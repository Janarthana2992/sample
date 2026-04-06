from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.database import get_db
from app.models.order import Address
from app.schemas.order import (
    AddressCreate, AddressOut,
    CheckoutRequest, OrderOut, PaginatedOrders, StatusUpdateRequest,
)
from app.services.order_service import (
    create_order, get_order, list_orders, update_order_status,
)
from sqlalchemy import select

router = APIRouter(tags=["orders"])
bearer_scheme = HTTPBearer()


def _auth(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        return {"user_id": payload["sub"], "role": payload.get("role", "customer"), "permissions": payload.get("permissions", [])}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ── Addresses ────────────────────────────────────────────────

@router.post("/addresses", response_model=AddressOut, status_code=status.HTTP_201_CREATED)
async def create_address(
    payload: AddressCreate,
    auth: dict = Depends(_auth),
    db: AsyncSession = Depends(get_db),
):
    addr = Address(user_id=uuid.UUID(auth["user_id"]), **payload.model_dump())
    db.add(addr)
    await db.commit()
    await db.refresh(addr)
    return addr


@router.get("/addresses", response_model=List[AddressOut])
async def list_addresses(auth: dict = Depends(_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Address).where(Address.user_id == uuid.UUID(auth["user_id"])))
    return result.scalars().all()


# ── Orders ───────────────────────────────────────────────────

@router.post("/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def checkout(
    payload: CheckoutRequest,
    auth: dict = Depends(_auth),
    db: AsyncSession = Depends(get_db),
):
    return await create_order(db, auth["user_id"], payload)


@router.get("/orders", response_model=PaginatedOrders)
async def get_orders(
    user_id_filter: Optional[str] = Query(default=None, alias="user_id"),
    filter_status: Optional[str] = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    auth: dict = Depends(_auth),
    db: AsyncSession = Depends(get_db),
):
    role = auth["role"]
    if role == "customer" and user_id_filter and user_id_filter != auth["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    return await list_orders(db, auth["user_id"], role, user_id_filter, filter_status, page, size)


@router.get("/orders/{order_id}", response_model=OrderOut)
async def get_single_order(
    order_id: uuid.UUID,
    auth: dict = Depends(_auth),
    db: AsyncSession = Depends(get_db),
):
    return await get_order(db, order_id, auth["user_id"], auth["role"])


@router.patch("/orders/{order_id}/status", response_model=OrderOut)
async def update_status(
    order_id: uuid.UUID,
    payload: StatusUpdateRequest,
    auth: dict = Depends(_auth),
    db: AsyncSession = Depends(get_db),
):
    role = auth["role"]
    if role not in ("admin", "staff"):
        raise HTTPException(status_code=403, detail="Not authorized to update order status")
    if role == "staff" and "order_management" not in auth.get("permissions", []):
        raise HTTPException(status_code=403, detail="Missing permission: order_management")
    return await update_order_status(db, order_id, auth["user_id"], role, payload)


# ── Admin analytics ──────────────────────────────────────────

@router.get("/admin/dashboard/kpis", tags=["admin"])
async def dashboard_kpis(auth: dict = Depends(_auth), db: AsyncSession = Depends(get_db)):
    if auth["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    from sqlalchemy import text
    result = await db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS orders_today,
            COUNT(*) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', now())) AS orders_month,
            COUNT(*) FILTER (WHERE status = 'dispatched') AS dispatched,
            COUNT(*) FILTER (WHERE status = 'pending') AS pending,
            COALESCE(SUM(total_price) FILTER (WHERE created_at >= CURRENT_DATE), 0) AS revenue_today,
            COALESCE(SUM(total_price) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', now())), 0) AS revenue_month
        FROM orders
        WHERE status != 'cancelled'
    """))
    row = result.fetchone()
    return {
        "orders_today": row.orders_today,
        "orders_month": row.orders_month,
        "dispatched": row.dispatched,
        "pending": row.pending,
        "revenue_today": float(row.revenue_today),
        "revenue_month": float(row.revenue_month),
    }


@router.get("/admin/dashboard/top-products", tags=["admin"])
async def top_products(
    period: str = Query(default="7d", pattern="^(today|7d|30d)$"),
    auth: dict = Depends(_auth),
    db: AsyncSession = Depends(get_db),
):
    if auth["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    from sqlalchemy import text
    date_filter = {
        "today": "CURRENT_DATE",
        "7d": "CURRENT_DATE - INTERVAL '7 days'",
        "30d": "CURRENT_DATE - INTERVAL '30 days'",
    }[period]
    result = await db.execute(text(f"""
        SELECT oi.product_id,
               p.name            AS product_name,
               SUM(oi.quantity)  AS units_sold,
               SUM(oi.quantity * oi.unit_price) AS revenue
        FROM order_items oi
        JOIN orders o ON o.order_id = oi.order_id
        LEFT JOIN products p ON p.product_id = oi.product_id
        WHERE o.created_at >= {date_filter}
          AND o.status != 'cancelled'
        GROUP BY oi.product_id, p.name
        ORDER BY units_sold DESC
        LIMIT 10
    """))
    rows = result.fetchall()
    return [{"product_id": str(r.product_id), "product_name": r.product_name or str(r.product_id)[:8], "units_sold": r.units_sold, "revenue": float(r.revenue)} for r in rows]


@router.get("/admin/dashboard/pincode-map", tags=["admin"])
async def pincode_map(auth: dict = Depends(_auth), db: AsyncSession = Depends(get_db)):
    if auth["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    from sqlalchemy import text
    result = await db.execute(text("""
        SELECT a.pincode, a.city, a.state,
               COUNT(o.order_id) AS order_count
        FROM orders o
        JOIN addresses a ON a.address_id = o.shipping_address_id
        WHERE o.status != 'cancelled'
        GROUP BY a.pincode, a.city, a.state
        ORDER BY order_count DESC
        LIMIT 500
    """))
    rows = result.fetchall()
    return [{"pincode": r.pincode, "city": r.city, "state": r.state, "order_count": r.order_count} for r in rows]
