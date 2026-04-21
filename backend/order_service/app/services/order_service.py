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
    "delivered": {"return_requested"},
    "return_requested": {"returned", "delivered"},
    "returned": set(),
    "cancelled": set(),
}

ROLE_ALLOWED_TRANSITIONS = {
    # admin can do anything valid
    "admin": {"confirmed", "dispatched", "delivered", "cancelled", "return_requested", "returned"},
    # staff with order_management can only dispatch confirmed orders
    "staff": {"dispatched"},
}


def _internal_service_headers() -> dict[str, str]:
    return {"X-Internal-Service-Token": settings.INTERNAL_SERVICE_TOKEN}


async def _adjust_product_stock(items: list, delta_sign: int):
    """Call product service to adjust stock. delta_sign: -1 to decrement, +1 to restore."""
    if not items:
        return
    try:
        adjust_payload = {
            "items": [
                {"product_id": str(item["product_id"]), "delta": delta_sign * item["quantity"]}
                for item in items
            ]
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{settings.PRODUCT_SERVICE_URL}/internal/stock-adjust",
                json=adjust_payload,
                headers=_internal_service_headers(),
            )
    except Exception as exc:
        logger.warning("Stock adjustment failed: %s", exc)


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
        try:
            r = await client.get(
                f"{settings.CART_SERVICE_URL}/cart/internal/{user_id}",
                headers=_internal_service_headers(),
            )
        except httpx.HTTPError as exc:
            logger.error("Failed to fetch cart for %s: %s", user_id, exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Cart service unavailable",
            ) from exc
        if r.status_code != 200:
            logger.error("Cart service returned %s for %s", r.status_code, user_id)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Cart service unavailable",
            )
        cart_items = r.json()

    if not cart_items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cart is empty")

    # Filter to specific product_ids if provided (Buy Only This)
    buy_only_ids = None
    if payload.product_ids:
        buy_only_ids = {str(pid) for pid in payload.product_ids}
        cart_items = [item for item in cart_items if item["product_id"] in buy_only_ids]
        if not cart_items:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected items not found in cart")

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
    product_ids_in_cart = []
    for item in cart_items:
        unit_price = Decimal(str(item["price_snapshot"]))
        qty = item["quantity"]
        total += unit_price * qty
        product_ids_in_cart.append(item["product_id"])
        order_items_data.append({
            "product_id": uuid.UUID(item["product_id"]),
            "product_name": item.get("product_name"),
            "quantity": qty,
            "unit_price": unit_price,
        })

    # 3b. Apply best deal discount
    deal_discount = Decimal("0")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(
                f"{settings.PRODUCT_SERVICE_URL}/deals/calculate",
                json={"product_ids": product_ids_in_cart, "cart_total": str(total)},
                headers=_internal_service_headers(),
            )
            if r.status_code == 200:
                deal_data = r.json()
                deal_discount = Decimal(str(deal_data.get("discount", "0")))
    except Exception as exc:
        logger.warning("Failed to fetch deal discount: %s", exc)

    discounted_total = max(total - deal_discount, Decimal("0"))

    estimated_delivery = (datetime.now(timezone.utc) + timedelta(days=5)).date()

    # 4. Create order (transactional)
    is_cod = payload.payment_method == "cod"
    order = Order(
        user_id=uuid.UUID(user_id),
        total_price=discounted_total,
        deal_discount=deal_discount,
        status="pending",
        shipping_address_id=payload.address_id,
        payment_method=payload.payment_method,
        payment_status="pending",
        estimated_delivery=estimated_delivery,
    )
    db.add(order)
    await db.flush()  # get order_id

    for item_data in order_items_data:
        db.add(OrderItem(order_id=order.order_id, **item_data))

    db.add(OrderStatusHistory(order_id=order.order_id, to_status="pending"))
    await db.commit()

    # 5. Create Razorpay order for non-COD payments
    if not is_cod and settings.RAZORPAY_KEY_ID:
        try:
            from app.services.payment_service import create_razorpay_order
            amount_paise = int((discounted_total * Decimal("100")).quantize(Decimal("1")))
            rz_order = create_razorpay_order(amount_paise, str(order.order_id)[:40])
            order.razorpay_order_id = rz_order["id"]
            await db.commit()
        except Exception as exc:
            logger.warning("Failed to create Razorpay order for %s: %s", order.order_id, exc)

    # 6. Clear cart (best-effort; order already committed)
    # For non-COD orders with Razorpay, the cart is cleared after payment verification
    # to allow retrying checkout if payment is cancelled.
    should_clear_cart = is_cod or not settings.RAZORPAY_KEY_ID
    if should_clear_cart:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                if buy_only_ids:
                    for pid in buy_only_ids:
                        try:
                            await client.delete(
                                f"{settings.CART_SERVICE_URL}/cart/internal/{user_id}/{pid}",
                                headers=_internal_service_headers(),
                            )
                        except Exception as exc:
                            logger.warning("Failed to remove item %s from cart: %s", pid, exc)
                else:
                    response = await client.delete(
                        f"{settings.CART_SERVICE_URL}/cart/internal/{user_id}",
                        headers=_internal_service_headers(),
                    )
                    if response.status_code not in {status.HTTP_204_NO_CONTENT, status.HTTP_404_NOT_FOUND}:
                        logger.warning("Cart clear returned %s for %s", response.status_code, user_id)
        except Exception as exc:
            logger.warning("Failed to clear cart after order creation: %s", exc)

    # Re-query with eager loading (db.refresh on relationships causes MissingGreenlet in async)
    result = await db.execute(
        select(Order)
        .where(Order.order_id == order.order_id)
        .options(
            selectinload(Order.items),
            selectinload(Order.shipping_address),
            selectinload(Order.status_history),
        )
    )
    final_order = result.scalar_one()

    # Decrement stock for ordered items (best-effort, non-blocking)
    stock_items = [
        {"product_id": str(i.product_id), "quantity": i.quantity}
        for i in final_order.items
    ]
    await _adjust_product_stock(stock_items, delta_sign=-1)

    return final_order


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
    result = await db.execute(
        select(Order).where(Order.order_id == order.order_id)
        .options(selectinload(Order.items), selectinload(Order.shipping_address), selectinload(Order.status_history))
    )
    updated_order = result.scalar_one()

    # Restore stock when admin/staff cancels an order (not on return)
    if payload.status == "cancelled" and old_status not in ("cancelled",):
        stock_items = [{"product_id": str(i.product_id), "quantity": i.quantity} for i in updated_order.items]
        await _adjust_product_stock(stock_items, delta_sign=1)

    return updated_order
