from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status, Header
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models.product import Deal, DealCategory, DealSku, ProductCategory
from app.schemas.deal import DealCreate, DealOut, DealUpdate
from app.utils.rbac import require_roles, require_permission
from app.config import settings

router = APIRouter(prefix="/deals", tags=["deals"])


def _to_out(deal: Deal) -> DealOut:
    return DealOut.from_orm_with_relations(deal)


def _deal_q():
    return select(Deal).options(
        selectinload(Deal.deal_categories),
        selectinload(Deal.deal_skus),
    )


@router.post("", response_model=DealOut, status_code=status.HTTP_201_CREATED)
async def create_deal(
    payload: DealCreate,
    admin=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    if payload.end_datetime <= payload.start_datetime:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="end_datetime must be after start_datetime")
    deal = Deal(
        name=payload.name,
        deal_type=payload.deal_type,
        applies_to=payload.applies_to,
        discount_value=payload.discount_value,
        min_cart_value=payload.min_cart_value,
        start_datetime=payload.start_datetime,
        end_datetime=payload.end_datetime,
        max_uses=payload.max_uses,
        is_active=payload.is_active,
        staff_visible=payload.staff_visible,
        created_by=admin.user_id,
    )
    db.add(deal)
    await db.flush()

    if payload.applies_to == "specific_category" and payload.category_ids:
        for cat_id in payload.category_ids:
            db.add(DealCategory(deal_id=deal.deal_id, category_id=cat_id))
    elif payload.applies_to == "specific_skus" and payload.product_ids:
        for prod_id in payload.product_ids:
            db.add(DealSku(deal_id=deal.deal_id, product_id=prod_id))

    await db.commit()
    result = await db.execute(_deal_q().where(Deal.deal_id == deal.deal_id))
    return _to_out(result.scalar_one())


@router.get("", response_model=List[DealOut])
async def list_deals(
    active_only: bool = Query(default=False),
    staff_visible_only: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
):
    q = _deal_q().order_by(Deal.created_at.desc())
    if active_only:
        now = datetime.now(timezone.utc)
        q = q.where(Deal.is_active == True, Deal.start_datetime <= now, Deal.end_datetime >= now)
    if staff_visible_only:
        q = q.where(Deal.staff_visible == True)
    result = await db.execute(q)
    return [_to_out(d) for d in result.scalars().all()]


@router.get("/{deal_id}", response_model=DealOut)
async def get_deal(deal_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(_deal_q().where(Deal.deal_id == deal_id))
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    return _to_out(deal)


@router.patch("/{deal_id}", response_model=DealOut)
async def update_deal(
    deal_id: uuid.UUID,
    payload: DealUpdate,
    _=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(_deal_q().where(Deal.deal_id == deal_id))
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")

    data = payload.model_dump(exclude_none=True)
    category_ids = data.pop("category_ids", None)
    product_ids = data.pop("product_ids", None)

    for k, v in data.items():
        setattr(deal, k, v)
    deal.updated_at = datetime.now(timezone.utc)

    if category_ids is not None:
        for dc in list(deal.deal_categories):
            await db.delete(dc)
        for cat_id in category_ids:
            db.add(DealCategory(deal_id=deal_id, category_id=cat_id))

    if product_ids is not None:
        for ds in list(deal.deal_skus):
            await db.delete(ds)
        for prod_id in product_ids:
            db.add(DealSku(deal_id=deal_id, product_id=prod_id))

    await db.commit()
    result = await db.execute(_deal_q().where(Deal.deal_id == deal_id))
    return _to_out(result.scalar_one())


@router.delete("/{deal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deal(
    deal_id: uuid.UUID,
    _=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Deal).where(Deal.deal_id == deal_id))
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    await db.delete(deal)
    await db.commit()


# ── Internal: calculate best deal discount for a cart ────────────────────────
class CartCalcRequest(BaseModel):
    product_ids: List[uuid.UUID]
    cart_total: Decimal


class CartCalcResponse(BaseModel):
    discount: Decimal
    deal_name: Optional[str]
    deal_type: Optional[str]


@router.post("/calculate", response_model=CartCalcResponse)
async def calculate_deal_discount(
    payload: CartCalcRequest,
    x_internal_service_token: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
):
    """Internal endpoint called by order_service to compute best deal discount at checkout."""
    if x_internal_service_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    if not payload.product_ids:
        return CartCalcResponse(discount=Decimal("0"), deal_name=None, deal_type=None)

    now = datetime.now(timezone.utc)
    cart_total = payload.cart_total

    # Get category IDs for all products in this cart
    cat_rows = await db.execute(
        select(ProductCategory.category_id)
        .where(ProductCategory.product_id.in_(payload.product_ids))
    )
    cart_category_ids = list({r for r in cat_rows.scalars().all()})

    # Fetch all currently active deals
    deal_q = (
        select(Deal)
        .options(selectinload(Deal.deal_categories), selectinload(Deal.deal_skus))
        .where(
            Deal.is_active == True,
            Deal.start_datetime <= now,
            Deal.end_datetime >= now,
        )
    )
    deals = (await db.execute(deal_q)).scalars().all()

    best_discount = Decimal("0")
    best_name: Optional[str] = None
    best_type: Optional[str] = None

    for deal in deals:
        # Check min cart value
        if deal.min_cart_value and cart_total < deal.min_cart_value:
            continue
        # Check max_uses
        if deal.max_uses and deal.current_uses >= deal.max_uses:
            continue

        # Determine if this deal applies to anything in the cart
        applies = False
        if deal.applies_to == "all_products":
            applies = True
        elif deal.applies_to == "specific_skus":
            deal_prod_ids = {ds.product_id for ds in deal.deal_skus}
            applies = bool(deal_prod_ids.intersection(set(payload.product_ids)))
        elif deal.applies_to == "specific_category":
            deal_cat_ids = {dc.category_id for dc in deal.deal_categories}
            applies = bool(deal_cat_ids.intersection(set(cart_category_ids)))

        if not applies:
            continue

        # Compute discount value
        discount = Decimal("0")
        if deal.deal_type == "percentage" and deal.discount_value:
            discount = (cart_total * deal.discount_value / 100).quantize(Decimal("0.01"))
        elif deal.deal_type == "flat" and deal.discount_value:
            discount = min(deal.discount_value, cart_total)
        elif deal.deal_type == "free_shipping":
            discount = Decimal("0")  # handled at display level; no monetary discount
        elif deal.deal_type == "bogo":
            # 50% off the cart (simplified BOGO)
            discount = (cart_total * Decimal("0.5")).quantize(Decimal("0.01"))

        if discount > best_discount:
            best_discount = discount
            best_name = deal.name
            best_type = deal.deal_type

    return CartCalcResponse(discount=best_discount, deal_name=best_name, deal_type=best_type)
