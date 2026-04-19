from typing import List, Optional
import csv
import io
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.schemas.product import (
    FilterRequest, PaginatedProducts, ProductCreate, ProductOut,
    ProductUpdate, StockUpdate,
)
from app.services import product_service, search_service as ss
from app.utils.rbac import require_roles, require_permission
from app.models.product import Product, ProductCategory, Category
from app.utils.distributed_lock import distributed_lock

router = APIRouter(prefix="/products", tags=["products"])

admin_or_staff = require_permission("product_listing_view")


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(
    sku: str = Form(...),
    name: str = Form(...),
    description: str = Form(...),
    mrp: float = Form(...),
    selling_price: float = Form(...),
    stock_quantity: int = Form(...),
    category_ids: str = Form(...),  # comma-separated UUIDs
    tags: Optional[str] = Form(default=None),
    is_active: bool = Form(default=True),
    is_featured: bool = Form(default=False),
    is_promoted: bool = Form(default=False),
    promotion_priority: int = Form(default=0),
    promotion_badge: Optional[str] = Form(default=None),
    images: List[UploadFile] = File(default=[]),
    admin=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    from decimal import Decimal
    try:
        cat_ids = [uuid.UUID(c.strip()) for c in category_ids.split(",") if c.strip()]
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="category_ids must be a comma-separated list of UUIDs",
        ) from exc

    try:
        payload = ProductCreate(
            sku=sku,
            name=name,
            description=description,
            mrp=Decimal(str(mrp)),
            selling_price=Decimal(str(selling_price)),
            stock_quantity=stock_quantity,
            category_ids=cat_ids,
            tags=[t.strip() for t in tags.split(",")] if tags else [],
            is_active=is_active,
            is_featured=is_featured,
            is_promoted=is_promoted,
            promotion_priority=promotion_priority,
            promotion_badge=promotion_badge,
        )
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.errors(),
        ) from exc
    return await product_service.create_product(db, payload, images, admin.user_id)


@router.get("/low-stock", response_model=List[ProductOut])
async def list_low_stock(
    size: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _=Depends(admin_or_staff),
):
    """Returns low_stock + out_of_stock products ordered by stock_quantity ascending."""
    return await product_service.list_low_stock_products(db, size=size)


@router.get("", response_model=PaginatedProducts)
async def list_products(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=50, ge=1, le=500),
    category_id: Optional[uuid.UUID] = Query(default=None),
    stock_status: Optional[str] = Query(default=None),
    is_active: Optional[bool] = Query(default=None),
    min_price: Optional[float] = Query(default=None),
    max_price: Optional[float] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    return await product_service.list_products(
        db, page=page, size=size, category_id=category_id,
        stock_status=stock_status, is_active=is_active,
        min_price=min_price, max_price=max_price,
    )


@router.get("/featured", response_model=PaginatedProducts)
async def list_featured_products(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=8, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
):
    return await product_service.list_featured_products(db, page=page, size=size)


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(product_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await product_service.get_product(db, product_id)


@router.put("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: uuid.UUID,
    payload: ProductUpdate,
    _=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    return await product_service.update_product(db, product_id, payload)


@router.patch("/{product_id}/stock", response_model=ProductOut)
async def update_stock(
    product_id: uuid.UUID,
    payload: StockUpdate,
    _=Depends(require_permission("stock_management")),
    db: AsyncSession = Depends(get_db),
):
    return await product_service.update_stock(db, product_id, payload)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: uuid.UUID,
    _=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    await product_service.soft_delete_product(db, product_id)


# ── Image Management ─────────────────────────────────────────

@router.post("/{product_id}/images", response_model=ProductOut)
async def add_product_images(
    product_id: uuid.UUID,
    images: List[UploadFile] = File(...),
    _=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Add one or more images to an existing product."""
    return await product_service.add_product_images(db, product_id, images)


@router.delete("/{product_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product_image(
    product_id: uuid.UUID,
    image_id: uuid.UUID,
    _=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Remove a single image from a product."""
    await product_service.delete_product_image(db, product_id, image_id)



@router.get("/export/csv")
async def export_products_csv(
    _=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Export all products as a CSV file."""
    result = await db.execute(select(Product).order_by(Product.created_at.desc()))
    products = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "sku", "name", "description", "mrp", "selling_price",
        "stock_quantity", "stock_status", "tags", "is_active",
        "weight_kg", "length_cm", "width_cm", "height_cm",
    ])
    for p in products:
        writer.writerow([
            p.sku, p.name, p.description, p.mrp, p.selling_price,
            p.stock_quantity, p.stock_status,
            "|".join(p.tags or []), p.is_active,
            p.weight_kg or "", p.length_cm or "", p.width_cm or "", p.height_cm or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=products.csv"},
    )


# ── Bulk Import ─────────────────────────────────────────────

@router.post("/import/csv", status_code=status.HTTP_200_OK)
async def import_products_csv(
    file: UploadFile = File(...),
    admin=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Import products from a CSV file. SKU is used as the upsert key."""
    from decimal import Decimal

    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded")

    reader = csv.DictReader(io.StringIO(text))
    required_cols = {"sku", "name", "description", "mrp", "selling_price"}
    if not reader.fieldnames or not required_cols.issubset(set(reader.fieldnames)):
        raise HTTPException(status_code=400, detail=f"CSV must contain columns: {', '.join(required_cols)}")

    created = updated = errors = 0
    error_list: list[str] = []

    for i, row in enumerate(reader, start=2):  # row 1 = header
        sku = (row.get("sku") or "").strip().upper()
        if not sku:
            error_list.append(f"Row {i}: missing SKU"); errors += 1; continue
        try:
            mrp = Decimal(str(row["mrp"]))
            selling_price = Decimal(str(row["selling_price"]))
            stock_qty = int(row.get("stock_quantity") or 0)
            is_active = str(row.get("is_active", "true")).lower() not in ("false", "0", "no")
            tags = [t.strip() for t in (row.get("tags") or "").split("|") if t.strip()]
            stock_status = (row.get("stock_status") or "in_stock").strip()
            if stock_status not in ("in_stock", "low_stock", "out_of_stock"):
                stock_status = "in_stock"
        except Exception as e:
            error_list.append(f"Row {i} ({sku}): {e}"); errors += 1; continue

        existing = (await db.execute(select(Product).where(Product.sku == sku))).scalar_one_or_none()
        if existing:
            async with distributed_lock(f"product:{existing.product_id}", ttl=5, acquire_timeout=3):
                existing.name = row["name"].strip()
                existing.description = row["description"].strip()
                existing.mrp = mrp
                existing.selling_price = selling_price
                existing.stock_quantity = stock_qty
                existing.stock_status = stock_status
                existing.tags = tags
                existing.is_active = is_active
            updated += 1
        else:
            if len(row["name"].strip()) < 3 or len(row["description"].strip()) < 20:
                error_list.append(f"Row {i} ({sku}): name ≥3 chars, description ≥20 chars required")
                errors += 1; continue
            db.add(Product(
                sku=sku,
                name=row["name"].strip(),
                description=row["description"].strip(),
                mrp=mrp,
                selling_price=selling_price,
                stock_quantity=stock_qty,
                stock_status=stock_status,
                tags=tags,
                is_active=is_active,
            ))
            created += 1

    await db.commit()
    return {"created": created, "updated": updated, "errors": errors, "error_details": error_list[:20]}
