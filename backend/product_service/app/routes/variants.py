from datetime import datetime, timezone
from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.product import Product, ProductVariant
from app.schemas.variant import VariantCreate, VariantOut, VariantUpdate
from app.utils.rbac import require_roles

router = APIRouter(prefix="/products/{product_id}/variants", tags=["variants"])


async def _get_product_or_404(product_id: uuid.UUID, db: AsyncSession) -> Product:
    result = await db.execute(select(Product).where(Product.product_id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


@router.get("", response_model=List[VariantOut])
async def list_variants(product_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _get_product_or_404(product_id, db)
    result = await db.execute(
        select(ProductVariant).where(ProductVariant.product_id == product_id)
        .order_by(ProductVariant.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=VariantOut, status_code=status.HTTP_201_CREATED)
async def create_variant(
    product_id: uuid.UUID,
    payload: VariantCreate,
    _=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    await _get_product_or_404(product_id, db)

    # Check SKU uniqueness
    existing = (await db.execute(select(ProductVariant).where(ProductVariant.sku == payload.sku.upper()))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Variant SKU already exists")

    variant = ProductVariant(
        product_id=product_id,
        sku=payload.sku.upper(),
        color=payload.color,
        size=payload.size,
        stock_quantity=payload.stock_quantity,
        stock_status=payload.stock_status,
        price_adjustment=payload.price_adjustment,
        is_active=payload.is_active,
    )
    db.add(variant)
    await db.commit()
    await db.refresh(variant)
    return variant


@router.patch("/{variant_id}", response_model=VariantOut)
async def update_variant(
    product_id: uuid.UUID,
    variant_id: uuid.UUID,
    payload: VariantUpdate,
    _=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProductVariant).where(
            ProductVariant.variant_id == variant_id,
            ProductVariant.product_id == product_id,
        )
    )
    variant = result.scalar_one_or_none()
    if not variant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")

    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(variant, k, v)
    variant.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(variant)
    return variant


@router.delete("/{variant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_variant(
    product_id: uuid.UUID,
    variant_id: uuid.UUID,
    _=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProductVariant).where(
            ProductVariant.variant_id == variant_id,
            ProductVariant.product_id == product_id,
        )
    )
    variant = result.scalar_one_or_none()
    if not variant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")
    await db.delete(variant)
    await db.commit()
