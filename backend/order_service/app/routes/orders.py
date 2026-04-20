from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi import Request
from jose import JWTError, jwt
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.database import get_db
from app.models.order import Address
from app.schemas.order import (
    AddressCreate, AddressOut,
    CheckoutRequest, OrderOut, PaginatedOrders, StatusUpdateRequest,
    VerifyPaymentRequest, CancelRequest, ReturnRequest, ReturnApprovalRequest,
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
    order = await create_order(db, auth["user_id"], payload)
    return order


@router.get("/orders", response_model=PaginatedOrders)
async def get_orders(
    user_id_filter: Optional[uuid.UUID] = Query(default=None, alias="user_id"),
    filter_status: Optional[str] = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=500),
    auth: dict = Depends(_auth),
    db: AsyncSession = Depends(get_db),
):
    role = auth["role"]
    if role == "customer" and user_id_filter and str(user_id_filter) != auth["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    return await list_orders(
        db,
        auth["user_id"],
        role,
        str(user_id_filter) if user_id_filter else None,
        filter_status,
        page,
        size,
    )


@router.get("/orders/{order_id}", response_model=OrderOut)
async def get_single_order(
    order_id: uuid.UUID,
    auth: dict = Depends(_auth),
    db: AsyncSession = Depends(get_db),
):
    return await get_order(db, order_id, auth["user_id"], auth["role"])


@router.post("/orders/{order_id}/cancel", response_model=OrderOut)
async def customer_cancel_order(
    order_id: uuid.UUID,
    payload: CancelRequest,
    auth: dict = Depends(_auth),
    db: AsyncSession = Depends(get_db),
):
    """Customers can cancel their own pending or confirmed orders."""
    from app.models.order import Order as OrderModel, OrderStatusHistory
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(OrderModel)
        .where(OrderModel.order_id == order_id)
        .options(selectinload(OrderModel.items), selectinload(OrderModel.shipping_address), selectinload(OrderModel.status_history))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if auth["role"] == "customer" and str(order.user_id) != auth["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if order.status not in ("pending", "confirmed"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel an order with status '{order.status}'")

    prev_status = order.status
    order.status = "cancelled"
    order.cancel_reason = payload.reason
    db.add(OrderStatusHistory(order_id=order.order_id, from_status=prev_status, to_status="cancelled", note=f"Cancelled by customer: {payload.reason}"))
    await db.commit()
    result = await db.execute(
        select(OrderModel).where(OrderModel.order_id == order_id)
        .options(selectinload(OrderModel.items), selectinload(OrderModel.shipping_address), selectinload(OrderModel.status_history))
    )
    final_order = result.scalar_one()

    # Restore stock for cancelled order items (best-effort)
    from app.services.order_service import _adjust_product_stock
    stock_items = [{"product_id": str(i.product_id), "quantity": i.quantity} for i in final_order.items]
    await _adjust_product_stock(stock_items, delta_sign=1)

    return final_order


@router.post("/orders/{order_id}/return", response_model=OrderOut)
async def customer_return_order(
    order_id: uuid.UUID,
    payload: ReturnRequest,
    auth: dict = Depends(_auth),
    db: AsyncSession = Depends(get_db),
):
    """Customers can request a return for delivered orders."""
    from app.models.order import Order as OrderModel, OrderStatusHistory
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(OrderModel)
        .where(OrderModel.order_id == order_id)
        .options(selectinload(OrderModel.items), selectinload(OrderModel.shipping_address), selectinload(OrderModel.status_history))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if str(order.user_id) != auth["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if order.status != "delivered":
        raise HTTPException(status_code=400, detail="Returns are only allowed for delivered orders")

    order.status = "return_requested"
    order.return_reason = payload.reason
    db.add(OrderStatusHistory(order_id=order.order_id, from_status="delivered", to_status="return_requested", note=f"Return requested by customer: {payload.reason}"))
    await db.commit()
    result = await db.execute(
        select(OrderModel).where(OrderModel.order_id == order_id)
        .options(selectinload(OrderModel.items), selectinload(OrderModel.shipping_address), selectinload(OrderModel.status_history))
    )
    return result.scalar_one()


@router.post("/orders/{order_id}/approve-return", response_model=OrderOut)
async def admin_approve_return(
    order_id: uuid.UUID,
    payload: ReturnApprovalRequest,
    auth: dict = Depends(_auth),
    db: AsyncSession = Depends(get_db),
):
    """Admin approves or rejects a return request."""
    from app.models.order import Order as OrderModel, OrderStatusHistory
    from sqlalchemy.orm import selectinload

    if auth["role"] not in ("admin", "staff"):
        raise HTTPException(status_code=403, detail="Not authorized")

    result = await db.execute(
        select(OrderModel)
        .where(OrderModel.order_id == order_id)
        .options(selectinload(OrderModel.items), selectinload(OrderModel.shipping_address), selectinload(OrderModel.status_history))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != "return_requested":
        raise HTTPException(status_code=400, detail="Order is not in return_requested status")

    new_status = "returned" if payload.approved else "delivered"
    note = payload.note or ("Return approved — item returned" if payload.approved else "Return rejected by admin")
    db.add(OrderStatusHistory(order_id=order.order_id, from_status="return_requested", to_status=new_status, note=note))
    order.status = new_status
    await db.commit()
    result = await db.execute(
        select(OrderModel).where(OrderModel.order_id == order_id)
        .options(selectinload(OrderModel.items), selectinload(OrderModel.shipping_address), selectinload(OrderModel.status_history))
    )
    return result.scalar_one()


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


# ── Payment verification ─────────────────────────────────────

@router.post("/orders/{order_id}/verify-payment", response_model=OrderOut)
async def verify_payment(
    order_id: uuid.UUID,
    payload: VerifyPaymentRequest,
    auth: dict = Depends(_auth),
    db: AsyncSession = Depends(get_db),
):
    from app.models.order import Order as OrderModel
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(OrderModel)
        .where(OrderModel.order_id == order_id)
        .options(selectinload(OrderModel.items), selectinload(OrderModel.shipping_address), selectinload(OrderModel.status_history))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if str(order.user_id) != auth["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if order.payment_status == "paid":
        return order

    # Verify signature
    from app.services.payment_service import verify_payment_signature
    if not verify_payment_signature(
        payload.razorpay_order_id,
        payload.razorpay_payment_id,
        payload.razorpay_signature,
    ):
        raise HTTPException(status_code=400, detail="Payment verification failed")

    order.razorpay_payment_id = payload.razorpay_payment_id
    order.razorpay_signature = payload.razorpay_signature
    order.payment_status = "paid"
    await db.commit()
    fresh = await db.execute(
        select(OrderModel).where(OrderModel.order_id == order_id)
        .options(selectinload(OrderModel.items), selectinload(OrderModel.shipping_address), selectinload(OrderModel.status_history))
    )
    order = fresh.scalar_one()

    # Clear the cart now that payment is confirmed (deferred from order creation)
    try:
        import httpx as _httpx
        from app.config import settings as _settings
        from app.services.order_service import _internal_service_headers
        async with _httpx.AsyncClient(timeout=5.0) as _client:
            await _client.delete(
                f"{_settings.CART_SERVICE_URL}/cart/internal/{order.user_id}",
                headers=_internal_service_headers(),
            )
    except Exception as _exc:
        import logging as _logging
        _logging.getLogger(__name__).warning("Failed to clear cart after payment: %s", _exc)

    return order


@router.post("/orders/webhook/razorpay", status_code=200, tags=["webhooks"])
async def razorpay_webhook(request_obj: Request, db: AsyncSession = Depends(get_db)):
    """Handle Razorpay webhook events. No auth — uses signature verification."""
    from app.services.payment_service import verify_webhook_signature
    from app.models.order import Order as OrderModel
    import json as _json

    body = await request_obj.body()
    signature = request_obj.headers.get("x-razorpay-signature", "")

    if not verify_webhook_signature(body, signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        event = _json.loads(body)
    except _json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("event", "")
    payment = event.get("payload", {}).get("payment", {}).get("entity", {})
    rz_order_id = payment.get("order_id")

    if not rz_order_id:
        return {"status": "ignored"}

    result = await db.execute(
        select(OrderModel).where(OrderModel.razorpay_order_id == rz_order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        return {"status": "order_not_found"}

    if event_type == "payment.captured" and order.payment_status != "paid":
        order.razorpay_payment_id = payment.get("id")
        order.payment_status = "paid"
        await db.commit()
    elif event_type == "payment.failed" and order.payment_status == "pending":
        order.payment_status = "failed"
        await db.commit()

    return {"status": "ok"}


@router.get("/payment/config", tags=["payment"])
async def payment_config():
    """Return Razorpay public key for frontend."""
    return {
        "razorpay_key_id": settings.RAZORPAY_KEY_ID or None,
        "payment_enabled": bool(settings.RAZORPAY_KEY_ID),
    }


# ── Admin analytics ──────────────────────────────────────────

@router.get("/admin/dashboard/kpis", tags=["admin"])
async def dashboard_kpis(auth: dict = Depends(_auth), db: AsyncSession = Depends(get_db)):
    if auth["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    from sqlalchemy import text
    result = await db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE AND status != 'cancelled') AS orders_today,
            COUNT(*) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', now()) AND status != 'cancelled') AS orders_month,
            COUNT(*) FILTER (WHERE status = 'dispatched') AS dispatched,
            COUNT(*) FILTER (WHERE status = 'pending') AS pending,
            COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
            COUNT(*) FILTER (WHERE status = 'return_requested') AS return_requests,
            COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
            COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
            COALESCE(SUM(total_price) FILTER (WHERE created_at >= CURRENT_DATE AND status != 'cancelled'), 0) AS revenue_today,
            COALESCE(SUM(total_price) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', now()) AND status != 'cancelled'), 0) AS revenue_month
        FROM orders
    """))
    row = result.fetchone()
    return {
        "orders_today": row.orders_today,
        "orders_month": row.orders_month,
        "dispatched": row.dispatched,
        "pending": row.pending,
        "confirmed": row.confirmed,
        "delivered": row.delivered,
        "cancelled": row.cancelled,
        "return_requests": row.return_requests,
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
    date_filter_sql = {
        "today": "INTERVAL '0 days'",
        "7d": "INTERVAL '7 days'",
        "30d": "INTERVAL '30 days'",
    }[period]
    result = await db.execute(
        text(f"""
        SELECT oi.product_id,
               MAX(oi.product_name) AS product_name,
               SUM(oi.quantity)     AS units_sold,
               SUM(oi.quantity * oi.unit_price) AS revenue
        FROM order_items oi
        JOIN orders o ON o.order_id = oi.order_id
        WHERE o.created_at >= CURRENT_DATE - {date_filter_sql}
          AND o.status != 'cancelled'
        GROUP BY oi.product_id
        ORDER BY units_sold DESC
        LIMIT 10
        """),
    )
    rows = result.fetchall()
    return [{"product_id": str(r.product_id), "product_name": r.product_name or str(r.product_id)[:8], "units_sold": r.units_sold, "revenue": float(r.revenue)} for r in rows]


@router.get("/internal/co-purchased/{product_id}", tags=["internal"])
async def co_purchased_products(
    product_id: uuid.UUID,
    top_n: int = Query(default=5, ge=1, le=20),
    token: str = Query(..., alias="token"),
    db: AsyncSession = Depends(get_db),
):
    """Internal: returns products most frequently bought together with the given product."""
    from app.config import settings as s
    if token != s.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")
    from sqlalchemy import text
    result = await db.execute(
        text("""
        SELECT other.product_id,
               MAX(other.product_name) AS product_name,
               COUNT(*) AS freq
        FROM order_items base
        JOIN order_items other
          ON other.order_id = base.order_id
         AND other.product_id != base.product_id
        JOIN orders o ON o.order_id = base.order_id
        WHERE base.product_id = :product_id
          AND o.status != 'cancelled'
        GROUP BY other.product_id
        ORDER BY freq DESC
        LIMIT :top_n
        """),
        {"product_id": str(product_id), "top_n": top_n},
    )
    rows = result.fetchall()
    return [{"product_id": str(r.product_id), "product_name": r.product_name, "freq": r.freq} for r in rows]


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
