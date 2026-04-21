import json
import logging
from decimal import Decimal
from datetime import datetime, timezone
from typing import Optional
import uuid

import redis.asyncio as aioredis
from fastapi import HTTPException, status

from app.config import settings
from app.schemas.cart import CartItemSnapshot, CartLine, CartResponse

logger = logging.getLogger(__name__)

_redis_pool: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = await aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            max_connections=20,
        )
    return _redis_pool


def _cart_key(user_id: str) -> str:
    return f"cart:{user_id}"


async def _fetch_product(product_id: str) -> dict:
    """Fetch live product info from Product Service."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{settings.PRODUCT_SERVICE_URL}/products/{product_id}")
            if r.status_code == 200:
                return r.json()
    except Exception as exc:
        logger.error("Product service fetch failed for %s: %s", product_id, exc)
    return {}


async def add_to_cart(user_id: str, product_id: str, quantity: int) -> CartItemSnapshot:
    redis = await get_redis()
    product = await _fetch_product(product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    if product.get("stock_status") == "out_of_stock":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Product is out of stock")
    if product.get("stock_quantity", 0) < quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only {product['stock_quantity']} units available",
        )

    key = _cart_key(user_id)
    existing_raw = await redis.hget(key, product_id)
    if existing_raw:
        existing = CartItemSnapshot(**json.loads(existing_raw))
        new_qty = existing.quantity + quantity
        if product.get("stock_quantity", 0) < new_qty:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot add {quantity} more; only {product['stock_quantity']} units available",
            )
        existing.quantity = new_qty
        item = existing
    else:
        item = CartItemSnapshot(
            product_id=product_id,
            quantity=quantity,
            price_snapshot=Decimal(str(product["selling_price"])),
            product_name=product["name"],
            image_url=product.get("images", [{}])[0].get("url") if product.get("images") else None,
            added_at=datetime.now(timezone.utc).isoformat(),
        )

    await redis.hset(key, product_id, json.dumps(item.model_dump(), default=str))
    await redis.expire(key, settings.CART_TTL_SECONDS)
    return item


async def remove_from_cart(user_id: str, product_id: str):
    redis = await get_redis()
    deleted = await redis.hdel(_cart_key(user_id), product_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not in cart")


async def update_cart_item(user_id: str, product_id: str, quantity: int) -> CartItemSnapshot:
    redis = await get_redis()
    key = _cart_key(user_id)
    existing_raw = await redis.hget(key, product_id)
    if not existing_raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not in cart")

    product = await _fetch_product(product_id)
    if product.get("stock_quantity", 0) < quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only {product.get('stock_quantity', 0)} units available",
        )

    item = CartItemSnapshot(**json.loads(existing_raw))
    item.quantity = quantity
    await redis.hset(key, product_id, json.dumps(item.model_dump(), default=str))
    await redis.expire(key, settings.CART_TTL_SECONDS)
    return item


async def get_cart(user_id: str) -> CartResponse:
    redis = await get_redis()
    raw_items = await redis.hgetall(_cart_key(user_id))

    lines = []
    subtotal = Decimal("0")

    for product_id, raw in raw_items.items():
        snapshot = CartItemSnapshot(**json.loads(raw))
        product = await _fetch_product(product_id)
        current_price = Decimal(str(product.get("selling_price", snapshot.price_snapshot))) if product else snapshot.price_snapshot
        price_stale = current_price != snapshot.price_snapshot
        line_total = current_price * snapshot.quantity

        lines.append(CartLine(
            product_id=uuid.UUID(product_id),
            product_name=snapshot.product_name,
            quantity=snapshot.quantity,
            unit_price=snapshot.price_snapshot,
            current_price=current_price,
            price_stale=price_stale,
            image_url=snapshot.image_url,
            line_total=line_total,
        ))
        subtotal += line_total

    return CartResponse(
        user_id=user_id,
        items=lines,
        subtotal=subtotal,
        item_count=sum(l.quantity for l in lines),
    )


async def clear_cart(user_id: str):
    redis = await get_redis()
    await redis.delete(_cart_key(user_id))


async def get_cart_raw(user_id: str) -> list[dict]:
    """Return raw cart data — used by Order Service."""
    redis = await get_redis()
    raw_items = await redis.hgetall(_cart_key(user_id))
    result = []
    for pid, raw in raw_items.items():
        item = json.loads(raw)
        item["product_id"] = pid
        result.append(item)
    return result


# ── Save for Later (Wishlist) ─────────────────────────────────

def _saved_key(user_id: str) -> str:
    return f"saved:{user_id}"


async def save_for_later(user_id: str, product_id: str) -> dict:
    """Add a product to the wishlist/saved-for-later list.
    If the item is in the cart, it is moved; otherwise it is added directly.
    """
    redis = await get_redis()
    cart_key = _cart_key(user_id)
    saved_key = _saved_key(user_id)

    cart_raw = await redis.hget(cart_key, product_id)

    if cart_raw:
        # Item is in cart — move it
        snapshot = CartItemSnapshot(**json.loads(cart_raw))
        saved_item = {
            "product_id": product_id,
            "product_name": snapshot.product_name,
            "price_snapshot": str(snapshot.price_snapshot),
            "image_url": snapshot.image_url,
            "quantity": snapshot.quantity,
            "added_at": datetime.now(timezone.utc).isoformat(),
        }
        await redis.hset(saved_key, product_id, json.dumps(saved_item))
        await redis.hdel(cart_key, product_id)
    else:
        # Direct wishlist add — fetch product details
        product = await _fetch_product(product_id)
        if not product:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
        saved_item = {
            "product_id": product_id,
            "product_name": product.get("name", ""),
            "price_snapshot": str(product.get("selling_price", 0)),
            "image_url": (product.get("images") or [{}])[0].get("url") if product.get("images") else product.get("image_url"),
            "quantity": 1,
            "added_at": datetime.now(timezone.utc).isoformat(),
        }
        await redis.hset(saved_key, product_id, json.dumps(saved_item))

    return saved_item


async def move_to_cart(user_id: str, product_id: str) -> CartItemSnapshot:
    """Move an item from saved-for-later back into cart."""
    redis = await get_redis()
    saved_key = _saved_key(user_id)
    cart_key = _cart_key(user_id)

    raw = await redis.hget(saved_key, product_id)
    if not raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not in saved list")

    saved = json.loads(raw)

    # Re-fetch product to get fresh stock / price
    product = await _fetch_product(product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product no longer exists")
    if product.get("stock_status") == "out_of_stock":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Product is out of stock")

    qty = min(saved.get("quantity", 1), product.get("stock_quantity", 1))
    item = CartItemSnapshot(
        product_id=product_id,
        quantity=qty,
        price_snapshot=Decimal(str(product["selling_price"])),
        product_name=product["name"],
        image_url=product.get("images", [{}])[0].get("url") if product.get("images") else None,
        added_at=datetime.now(timezone.utc).isoformat(),
    )

    await redis.hset(cart_key, product_id, json.dumps(item.model_dump(), default=str))
    await redis.expire(cart_key, settings.CART_TTL_SECONDS)
    await redis.hdel(saved_key, product_id)

    return item


async def get_saved_items(user_id: str) -> list[dict]:
    """Get all saved-for-later items with current prices."""
    redis = await get_redis()
    raw_items = await redis.hgetall(_saved_key(user_id))
    items = []
    for product_id, raw in raw_items.items():
        saved = json.loads(raw)
        product = await _fetch_product(product_id)
        current_price = Decimal(str(product.get("selling_price", saved["price_snapshot"]))) if product else Decimal(saved["price_snapshot"])
        stock_status = product.get("stock_status", "unknown") if product else "unknown"
        items.append({
            "product_id": product_id,
            "product_name": saved["product_name"],
            "price_snapshot": saved["price_snapshot"],
            "current_price": str(current_price),
            "image_url": saved.get("image_url"),
            "stock_status": stock_status,
            "added_at": saved["added_at"],
        })
    return items


async def remove_saved_item(user_id: str, product_id: str):
    """Remove an item from saved-for-later."""
    redis = await get_redis()
    deleted = await redis.hdel(_saved_key(user_id), product_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not in saved list")
