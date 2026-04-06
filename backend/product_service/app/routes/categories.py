from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.product import Category
from app.schemas.product import CategoryCreate, CategoryOut
from app.utils.rbac import require_roles

router = APIRouter(prefix="/categories", tags=["categories"])


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(
    payload: CategoryCreate,
    _=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    cat = Category(name=payload.name, slug=payload.slug, parent_id=payload.parent_id)
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.get("", response_model=List[CategoryOut])
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).where(Category.is_active == True).order_by(Category.name))
    return result.scalars().all()


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: uuid.UUID,
    _=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Category).where(Category.category_id == category_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    cat.is_active = False
    await db.commit()
