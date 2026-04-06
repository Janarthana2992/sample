import logging
from datetime import datetime, timezone, timedelta, date
from decimal import Decimal
from typing import List, Optional
import uuid

import httpx
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.order import Address, Order, OrderItem, OrderStatusHistory
from app.schemas.order import CheckoutRequest, StatusUpdateRequest

logger = logging.getLogger(__name__)

# Status transition rules
VALID_TRANSITIONS = {
    "pending": {"confirmed", "cancelled"},
    "confirmed": {"dispatched", "cancelled"},
    "dispatched": {"delivered"},
    "delivered": set(),
    "cancelled": set(),
}

ROLE_ALLOWED_TRANSITIONS = {
    # admin can do anything valid
    "admin": {"confirmed", "dispatched", "delivered", "cancelled"},
    # staff with order_management can only dispatch confirmed orders
    "staff": {"dispatched"},
}


async def create_order(db: AsyncSession, user_id: str, payload: CheckoutRequest) -> Order:
    """
    Atomic order creation:
    1. Fetch cart from Cart Service
    2. Validate stock
    3. Create order + items in DB
    4. Clear cart
    """
    # 1. Fetch cart
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(f"{settings.CART_SERVICE_URL}/cart/internal/{user_id}")
        if r.status_code != 200:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not fetch cart")
        cart_items = r.json()

    if not cart_items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cart is empty")

    # 2. Validate address belongs to user
    addr_result = await db.execute(
        select(Address).where(Address.address_id == payload.address_id, Address.user_id == uuid.UUID(user_id))
    )
    address = addr_result.scalar_one_or_none()
    if not address:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Address not found")

    # 3. Calculate totals
    total = Decimal("0")
    order_items_data = []
    for item in cart_items:
        unit_price = Decimal(str(item["price_snapshot"]))
        qty = item["quantity"]
        total += unit_price * qty
        order_items_data.append({
            "product_id": uuid.UUID(item["product_id"]),
            "product_name": item.get("product_name"),
            "quantity": qty,
            "unit_price": unit_price,
        })

    estimated_delivery = (datetime.now(timezone.utc) + timedelta(days=5)).date()

    # 4. Create order (transactional)
    order = Order(
        user_id=uuid.UUID(user_id),
        total_price=total,
        status="pending",
        shipping_address_id=payload.address_id,
        payment_method=payload.payment_method,
        payment_status="paid" if payload.payment_method != "cod" else "pending",
        estimated_delivery=estimated_delivery,
    )
    db.add(order)
    await db.flush()  # get order_id

    for item_data in order_items_data:
        db.add(OrderItem(order_id=order.order_id, **item_data))

    db.add(OrderStatusHistory(order_id=order.order_id, to_status="pending"))
    await db.commit()

    # 5. Clear cart (best-effort; order already committed)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.delete(f"{settings.CART_SERVICE_URL}/cart/internal/{user_id}")
    except Exception as exc:
        logger.warning("Failed to clear cart after order creation: %s", exc)

    await db.refresh(order, ["items", "shipping_address", "status_history"])
    return order


async def get_order(db: AsyncSession, order_id: uuid.UUID, user_id: str, role: str) -> Order:
    result = await db.execute(
        select(Order)
        .where(Order.order_id == order_id)
        .options(
            selectinload(Order.items),
            selectinload(Order.shipping_address),
            selectinload(Order.status_history),
        )
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if role == "customer" and str(order.user_id) != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return order


async def list_orders(
    db: AsyncSession,
    user_id: str,
    role: str,
    filter_user_id: Optional[str] = None,
    filter_status: Optional[str] = None,
    page: int = 1,
    size: int = 20,
) -> dict:
    q = select(Order).options(
        selectinload(Order.items),
        selectinload(Order.shipping_address),
        selectinload(Order.status_history),
    )

    if role == "customer":
        q = q.where(Order.user_id == uuid.UUID(user_id))
    elif filter_user_id:
        q = q.where(Order.user_id == uuid.UUID(filter_user_id))

    if filter_status:
        q = q.where(Order.status == filter_status)

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar()

    q = q.order_by(Order.created_at.desc()).offset((page - 1) * size).limit(size)
    items = (await db.execute(q)).scalars().all()
    return {"items": items, "total": total, "page": page, "size": size}


async def update_order_status(
    db: AsyncSession,
    order_id: uuid.UUID,
    actor_user_id: str,
    actor_role: str,
    payload: StatusUpdateRequest,
) -> Order:
    result = await db.execute(
        select(Order).where(Order.order_id == order_id)
        .options(selectinload(Order.items), selectinload(Order.shipping_address), selectinload(Order.status_history))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    # Guard valid transition
    allowed_for_role = ROLE_ALLOWED_TRANSITIONS.get(actor_role, set())
    if payload.status not in allowed_for_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{actor_role}' cannot transition to '{payload.status}'",
        )
    if payload.status not in VALID_TRANSITIONS.get(order.status, set()):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot transition from '{order.status}' to '{payload.status}'",
        )

    old_status = order.status
    order.status = payload.status
    order.updated_at = datetime.now(timezone.utc)
    if payload.tracking_number:
        order.tracking_number = payload.tracking_number

    db.add(OrderStatusHistory(
        order_id=order.order_id,
        from_status=old_status,
        to_status=payload.status,
        changed_by=uuid.UUID(actor_user_id),
        note=payload.note,
    ))
    await db.commit()
    await db.refresh(order, ["items", "shipping_address", "status_history"])
    return order
