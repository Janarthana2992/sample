from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.product import Category
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


@router.get("", response_model=SearchResponse)
async def search_products(
    q: str = Query(default="", min_length=0, max_length=200),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
):
    result = await es_service.search(query=q, page=page, size=size)
    return SearchResponse(
        total=result["total"], page=page, size=size,
        hits=result["hits"], suggestion=result.get("suggestion"),
    )


@router.post("/filter", response_model=SearchResponse)
async def filter_products(payload: FilterRequest):
    filters = {
        "categories": payload.categories,
        "min_price": payload.min_price,
        "max_price": payload.max_price,
        "min_rating": payload.min_rating,
        "in_stock_only": payload.in_stock_only,
        "deals_only": payload.deals_only,
    }
    result = await es_service.search(query=payload.q, page=payload.page, size=payload.size, filters=filters)
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
