from datetime import datetime, timezone
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models.product import Deal, DealCategory, DealSku
from app.schemas.deal import DealCreate, DealOut, DealUpdate
from app.utils.rbac import require_roles, require_permission

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
