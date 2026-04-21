from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from decimal import Decimal
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models.product import Category, Product, ProductCategory
from app.schemas.product import FilterRequest, SearchResult
from app.services.search_service import es_service

router = APIRouter(prefix="/search", tags=["search"])


class AutocompleteResponse(BaseModel):
    suggestions: List[str]


class SearchResponse(BaseModel):
    total: int
    page: int
    size: int
    hits: List[dict]
    suggestion: Optional[str] = None


def _product_to_hit(product: Product) -> dict:
    first_image = product.images[0].url if getattr(product, "images", None) else None
    return {
        "product_id": str(product.product_id),
        "name": product.name,
        "sku": product.sku,
        "mrp": float(product.mrp),
        "selling_price": float(product.selling_price),
        "stock_status": product.stock_status,
        "rating": float(product.avg_rating) if product.avg_rating else None,
        "image_url": first_image,
        "tags": product.tags or [],
        "is_active": product.is_active,
        "score": 1.0,
    }


async def _db_fallback_search(
    db: AsyncSession,
    q: str,
    categories: Optional[List[str]],
    min_price: Optional[float],
    max_price: Optional[float],
    min_rating: Optional[float],
    in_stock_only: bool,
    page: int,
    size: int,
) -> dict:
    """Direct DB search, used when Elasticsearch is empty/unavailable."""
    query = (
        select(Product)
        .where(Product.is_active == True)
        .options(selectinload(Product.images))
    )

    if q:
        like = f"%{q.strip().lower()}%"
        query = query.where(
            or_(
                func.lower(Product.name).like(like),
                func.lower(Product.description).like(like),
            )
        )

    if categories:
        query = (
            query.join(ProductCategory, ProductCategory.product_id == Product.product_id)
            .join(Category, Category.category_id == ProductCategory.category_id)
            .where(Category.name.in_(categories))
        )

    if min_price is not None:
        query = query.where(Product.selling_price >= float(min_price))
    if max_price is not None:
        query = query.where(Product.selling_price <= float(max_price))
    if min_rating is not None:
        query = query.where(Product.avg_rating >= float(min_rating))
    if in_stock_only:
        query = query.where(Product.stock_status.in_(["in_stock", "low_stock"]))

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = int(total_result.scalar() or 0)

    query = (
        query.order_by(Product.sales_count.desc(), Product.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(query)
    products = result.scalars().unique().all()

    return {
        "total": total,
        "hits": [_product_to_hit(p) for p in products],
        "suggestion": None,
    }


@router.get("", response_model=SearchResponse)
async def search_products(
    q: str = Query(default="", min_length=0, max_length=200),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    result = await es_service.search(query=q, page=page, size=size)
    if result["total"] == 0:
        # Fallback to DB if ES returned nothing (empty index or ES down).
        result = await _db_fallback_search(
            db, q, None, None, None, None, False, page, size,
        )
    return SearchResponse(
        total=result["total"], page=page, size=size,
        hits=result["hits"], suggestion=result.get("suggestion"),
    )


@router.post("/filter", response_model=SearchResponse)
async def filter_products(payload: FilterRequest, db: AsyncSession = Depends(get_db)):
    filters = {
        "categories": payload.categories,
        "min_price": payload.min_price,
        "max_price": payload.max_price,
        "min_rating": payload.min_rating,
        "in_stock_only": payload.in_stock_only,
    }
    result = await es_service.search(
        query=payload.q, page=payload.page, size=payload.size, filters=filters
    )
    if result["total"] == 0:
        result = await _db_fallback_search(
            db,
            payload.q,
            payload.categories,
            float(payload.min_price) if payload.min_price is not None else None,
            float(payload.max_price) if payload.max_price is not None else None,
            payload.min_rating,
            payload.in_stock_only,
            payload.page,
            payload.size,
        )
    return SearchResponse(
        total=result["total"], page=payload.page, size=payload.size,
        hits=result["hits"], suggestion=result.get("suggestion"),
    )


@router.get("/autocomplete", response_model=AutocompleteResponse)
async def autocomplete(
    q: str = Query(min_length=1, max_length=100),
    db: AsyncSession = Depends(get_db),
):
    # Category name prefix matches (case-insensitive, from DB)
    # Escape LIKE wildcards to prevent pattern injection
    safe_q = q.replace("%", r"\%").replace("_", r"\_")
    cat_result = await db.execute(
        select(Category.name)
        .where(Category.is_active == True, Category.name.ilike(f"{safe_q}%"))
        .limit(3)
    )
    cat_suggestions = [r[0] for r in cat_result.all()]

    # Product name suggestions from Elasticsearch
    product_suggestions = await es_service.autocomplete(q)

    # Merge: categories first, then products; deduplicate
    seen: set = set()
    combined: List[str] = []
    for s in cat_suggestions + product_suggestions:
        key = s.lower()
        if key not in seen:
            seen.add(key)
            combined.append(s)

    return AutocompleteResponse(suggestions=combined[:8])


@router.get("/top-rated", response_model=SearchResponse)
async def top_rated_products(
    category: Optional[str] = Query(default=None),
    size: int = Query(default=10, ge=1, le=30),
):
    """Return products sorted by Bayesian weighted rating (penalises few reviews)."""
    result = await es_service.top_rated(category=category, size=size)
    return SearchResponse(
        total=result["total"], page=1, size=size,
        hits=result["hits"],
    )
