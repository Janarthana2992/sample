import os
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional

import aiofiles
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.product import Product, ProductCategory, ProductImage, Category, Deal, DealCategory, DealSku, Review
from app.schemas.product import ProductCreate, ProductUpdate, StockUpdate
from app.services.search_service import es_service

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGES = 8


def _compute_stock_status(qty: int) -> str:
    if qty == 0:
        return "out_of_stock"
    if qty <= 10:
        return "low_stock"
    return "in_stock"


# ── Bayesian weighted rating ───────────────────────────────
# C = prior mean (global average, assume 3.5 if no data)
# m = minimum reviews to trust fully (damping factor)
BAYESIAN_C = 3.5
BAYESIAN_M = 10


def _bayesian_avg(avg_rating: float, review_count: int) -> float:
    """Weighted Bayesian average: (C*m + sum_ratings) / (m + n).

    A product with 50 reviews at 4.0 => ~3.95
    A product with 3 reviews at 4.2 => ~3.66   (penalised for few reviews)
    """
    if review_count == 0:
        return 0.0
    return round(
        (BAYESIAN_C * BAYESIAN_M + avg_rating * review_count) / (BAYESIAN_M + review_count),
        4,
    )


async def refresh_product_rating(db: AsyncSession, product_id: uuid.UUID):
    """Recalculate avg_rating, review_count, bayesian_rating for a product."""
    row = await db.execute(
        select(
            func.coalesce(func.avg(Review.rating), 0).label("avg_rating"),
            func.count(Review.review_id).label("review_count"),
        ).where(Review.product_id == product_id)
    )
    stats = row.one()
    avg_r = float(stats.avg_rating)
    cnt = int(stats.review_count)
    bayesian = _bayesian_avg(avg_r, cnt)

    await db.execute(
        Product.__table__.update()
        .where(Product.product_id == product_id)
        .values(avg_rating=round(avg_r, 2), review_count=cnt, bayesian_rating=bayesian)
    )
    await db.flush()


async def _save_image(file: UploadFile, product_id: uuid.UUID) -> str:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Only JPEG/PNG/WEBP images allowed")

    # Read and size-check
    content = await file.read()
    if len(content) > settings.MAX_IMAGE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Image exceeds {settings.MAX_IMAGE_SIZE_MB}MB limit")

    ext = file.content_type.split("/")[-1].replace("jpeg", "jpg")
    filename = f"{uuid.uuid4()}.{ext}"
    dir_path = os.path.join(settings.UPLOAD_DIR, str(product_id))
    os.makedirs(dir_path, exist_ok=True)
    file_path = os.path.join(dir_path, filename)

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    return f"/static/products/{product_id}/{filename}"


async def create_product(
    db: AsyncSession, payload: ProductCreate, images: List[UploadFile], created_by: uuid.UUID
) -> Product:
    # Validate categories exist
    result = await db.execute(
        select(Category).where(Category.category_id.in_(payload.category_ids))
    )
    found_cats = result.scalars().all()
    if len(found_cats) != len(payload.category_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more categories not found")

    # Auto-compute stock status if not provided
    stock_status = payload.stock_status or _compute_stock_status(payload.stock_quantity)

    product = Product(
        sku=payload.sku.upper(),
        name=payload.name,
        description=payload.description,
        mrp=payload.mrp,
        selling_price=payload.selling_price,
        stock_quantity=payload.stock_quantity,
        stock_status=stock_status,
        tags=payload.tags or [],
        is_active=payload.is_active,
        is_featured=payload.is_featured,
        is_promoted=payload.is_promoted,
        promotion_priority=payload.promotion_priority,
        promotion_badge=payload.promotion_badge,
        weight_kg=payload.weight_kg,
        length_cm=payload.length_cm,
        width_cm=payload.width_cm,
        height_cm=payload.height_cm,
    )
    db.add(product)
    await db.flush()

    # Attach categories
    for cat in found_cats:
        db.add(ProductCategory(product_id=product.product_id, category_id=cat.category_id))

    # Upload images
    if images:
        if len(images) > MAX_IMAGES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Maximum {MAX_IMAGES} images allowed")
        for idx, img_file in enumerate(images):
            url = await _save_image(img_file, product.product_id)
            db.add(ProductImage(product_id=product.product_id, url=url, sort_order=idx))

    await db.commit()
    await db.refresh(product, ["images", "product_categories"])

    # Async ES index (fire & forget pattern — errors logged)
    await _index_to_es(product, [c.category_id for c in found_cats], [c.name for c in found_cats])
    await _embed_to_ai(product)
    return product


async def _embed_to_ai(product: Product):
    """Fire-and-forget: send product text to AI service for FAISS indexing."""
    try:
        import httpx as _httpx
        async with _httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.AI_SERVICE_URL}/internal/embed",
                headers={"X-Internal-Service-Token": settings.INTERNAL_SERVICE_TOKEN},
                json={
                    "product_id": str(product.product_id),
                    "name": product.name,
                    "description": product.description or "",
                },
            )
            response.raise_for_status()
    except Exception as exc:
        logger.warning("AI embed failed for %s: %s", product.product_id, exc)


async def _index_to_es(product: Product, category_ids: list, category_names: list = []):
    images = product.images or []
    doc = {
        "product_id": str(product.product_id),
        "name": product.name,
        "description": product.description,
        "sku": product.sku,
        "category_ids": [str(c) for c in category_ids],
        "category_names": category_names,
        "tags": product.tags or [],
        "mrp": float(product.mrp),
        "selling_price": float(product.selling_price),
        "stock_status": product.stock_status,
        "is_active": product.is_active,
        "is_featured": product.is_featured,
        "is_promoted": product.is_promoted,
        "promotion_priority": product.promotion_priority,
        "promotion_badge": product.promotion_badge,
        "sales_count": product.sales_count,
        "image_url": images[0].url if images else None,
        "rating": float(product.avg_rating) if product.avg_rating else None,
        "review_count": product.review_count or 0,
        "bayesian_rating": float(product.bayesian_rating) if product.bayesian_rating else 0,
    }
    await es_service.index_product(doc)


async def list_featured_products(db: AsyncSession, page: int = 1, size: int = 8) -> dict:
    size = max(1, min(size, 24))
    page = max(1, page)
    base_options = [selectinload(Product.images), selectinload(Product.product_categories)]

    featured_query = (
        select(Product)
        .where(Product.is_active == True, Product.is_featured == True)
        .options(*base_options)
        .order_by(Product.promotion_priority.desc(), Product.created_at.desc())
    )
    featured = list((await db.execute(featured_query)).scalars().all())

    selected_ids = {product.product_id for product in featured}
    promoted_query = (
        select(Product)
        .where(
            Product.is_active == True,
            Product.is_promoted == True,
            Product.is_featured == False,
        )
        .options(*base_options)
        .order_by(Product.promotion_priority.desc(), Product.created_at.desc())
    )
    if selected_ids:
        promoted_query = promoted_query.where(Product.product_id.notin_(selected_ids))
    promoted = list((await db.execute(promoted_query)).scalars().all())

    manual_products = [*featured, *promoted]
    manual_ids = {product.product_id for product in manual_products}
    manual_total = len(manual_products)
    start = (page - 1) * size
    end = start + size
    items = manual_products[start:end]

    should_fill_automatic = (manual_total == 0 and page == 1) or (start < manual_total and len(items) < size)
    automatic: list[Product] = []

    if should_fill_automatic:
        remaining = max(size - len(items), 0)
        candidates_query = select(Product).where(Product.is_active == True).options(*base_options)
        if manual_ids:
            candidates_query = candidates_query.where(Product.product_id.notin_(manual_ids))
        candidates = list((await db.execute(candidates_query)).scalars().all())

        if candidates and remaining > 0:
            product_ids = [product.product_id for product in candidates]
            rating_rows = await db.execute(
                select(
                    Review.product_id,
                    func.avg(Review.rating).label("avg_rating"),
                    func.count(Review.review_id).label("review_count"),
                )
                .where(Review.product_id.in_(product_ids))
                .group_by(Review.product_id)
            )
            rating_map = {
                row[0]: (float(row[1] or 0), int(row[2] or 0))
                for row in rating_rows.all()
            }

            now = datetime.now(timezone.utc)
            deal_product_rows = await db.execute(
                select(DealSku.product_id)
                .join(Deal, Deal.deal_id == DealSku.deal_id)
                .where(
                    Deal.is_active == True,
                    Deal.start_datetime <= now,
                    Deal.end_datetime >= now,
                    DealSku.product_id.in_(product_ids),
                )
            )
            active_deal_product_ids = set(deal_product_rows.scalars().all())

            category_ids = {
                product_category.category_id
                for product in candidates
                for product_category in (product.product_categories or [])
            }
            active_deal_category_ids: set = set()
            if category_ids:
                deal_category_rows = await db.execute(
                    select(DealCategory.category_id)
                    .join(Deal, Deal.deal_id == DealCategory.deal_id)
                    .where(
                        Deal.is_active == True,
                        Deal.start_datetime <= now,
                        Deal.end_datetime >= now,
                        DealCategory.category_id.in_(category_ids),
                    )
                )
                active_deal_category_ids = set(deal_category_rows.scalars().all())

            global_deal_count = (
                await db.execute(
                    select(func.count(Deal.deal_id)).where(
                        Deal.is_active == True,
                        Deal.start_datetime <= now,
                        Deal.end_datetime >= now,
                        Deal.applies_to == "all_products",
                    )
                )
            ).scalar() or 0
            has_global_deal = global_deal_count > 0

            def automatic_score(product: Product) -> float:
                avg_rating, review_count = rating_map.get(product.product_id, (0.0, 0))
                has_category_deal = any(
                    product_category.category_id in active_deal_category_ids
                    for product_category in (product.product_categories or [])
                )
                deal_bonus = 20 if (product.product_id in active_deal_product_ids or has_category_deal or has_global_deal) else 0
                stock_bonus = 5 if product.stock_status == "in_stock" else 0
                return (
                    product.sales_count * 100
                    + avg_rating * 25
                    + min(review_count, 10) * 2
                    + deal_bonus
                    + stock_bonus
                )

            automatic = sorted(
                candidates,
                key=lambda product: (automatic_score(product), product.sales_count, product.created_at),
                reverse=True,
            )[:remaining]

    total = manual_total if manual_total > 0 else (len(automatic) if page == 1 else 0)
    return {
        "items": [*items, *automatic],
        "total": total,
        "page": page,
        "size": size,
    }


async def get_product(db: AsyncSession, product_id: uuid.UUID) -> Product:
    result = await db.execute(
        select(Product)
        .where(Product.product_id == product_id)
        .options(selectinload(Product.images), selectinload(Product.product_categories))
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


async def list_products(
    db: AsyncSession,
    page: int = 1,
    size: int = 50,
    category_id: Optional[uuid.UUID] = None,
    stock_status: Optional[str] = None,
    is_active: Optional[bool] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
) -> dict:
    query = select(Product).options(selectinload(Product.images))

    if category_id:
        query = query.join(ProductCategory, ProductCategory.product_id == Product.product_id).where(
            ProductCategory.category_id == category_id
        )
    if stock_status:
        query = query.where(Product.stock_status == stock_status)
    if is_active is not None:
        query = query.where(Product.is_active == is_active)
    if min_price is not None:
        query = query.where(Product.selling_price >= min_price)
    if max_price is not None:
        query = query.where(Product.selling_price <= max_price)

    count_q = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_q)
    total = total_result.scalar()

    query = query.order_by(Product.created_at.desc()).offset((page - 1) * size).limit(size)
    result = await db.execute(query)
    products = result.scalars().all()

    return {"items": products, "total": total, "page": page, "size": size}


async def update_product(
    db: AsyncSession, product_id: uuid.UUID, payload: ProductUpdate
) -> Product:
    product = await get_product(db, product_id)
    update_data = payload.model_dump(exclude_unset=True)

    category_ids = update_data.pop("category_ids", None)

    for key, val in update_data.items():
        setattr(product, key, val)

    if "stock_quantity" in update_data and "stock_status" not in update_data:
        product.stock_status = _compute_stock_status(product.stock_quantity)

    product.updated_at = datetime.now(timezone.utc)

    if category_ids is not None:
        await db.execute(
            delete(ProductCategory).where(ProductCategory.product_id == product_id)
        )
        for cid in category_ids:
            db.add(ProductCategory(product_id=product_id, category_id=cid))

    await db.commit()
    await db.refresh(product, ["images", "product_categories"])
    cats = [pc.category_id for pc in product.product_categories]
    cat_result = await db.execute(
        select(Category.name).where(Category.category_id.in_(cats))
    )
    cat_names = [r[0] for r in cat_result.all()]
    await _index_to_es(product, cats, cat_names)
    await _embed_to_ai(product)
    return product


async def update_stock(
    db: AsyncSession, product_id: uuid.UUID, payload: StockUpdate
) -> Product:
    product = await get_product(db, product_id)
    if payload.stock_quantity is not None:
        product.stock_quantity = payload.stock_quantity
        if payload.stock_status is None:
            product.stock_status = _compute_stock_status(payload.stock_quantity)
    if payload.stock_status is not None:
        product.stock_status = payload.stock_status
    product.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(product, ["images", "product_categories"])
    cats = [pc.category_id for pc in product.product_categories]
    cat_result = await db.execute(
        select(Category.name).where(Category.category_id.in_(cats))
    )
    cat_names = [r[0] for r in cat_result.all()]
    await _index_to_es(product, cats, cat_names)
    return product


async def soft_delete_product(db: AsyncSession, product_id: uuid.UUID):
    product = await get_product(db, product_id)
    product.is_active = False
    product.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await es_service.delete_product(str(product_id))
