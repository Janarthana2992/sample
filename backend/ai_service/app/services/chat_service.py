import json
import logging
import re
import uuid
from typing import Optional, List

import numpy as np
import httpx
import redis.asyncio as aioredis

from app.config import settings
from app.services.rag_service import rag_kb
from app.services.intent_router import route_intent
from app.services.handoff_service import handoff_service

logger = logging.getLogger(__name__)


# ── Sentence-Transformer based intent classification ────────
CATEGORIES = [
    "Audio", "Beauty & Personal Care", "Books & Stationery", "Electronics",
    "Fashion", "Gaming", "Home & Kitchen", "Laptops", "Medicine",
    "Men's Clothing", "Smartphones", "Sports & Fitness", "Toys", "Women's Clothing",
]
_CATEGORIES_LOWER = {c.lower(): c for c in CATEGORIES}

# Aliases so common words map to the right category
_CATEGORY_ALIASES = {
    "phone": "Smartphones", "phones": "Smartphones", "mobile": "Smartphones",
    "mobiles": "Smartphones", "cellphone": "Smartphones", "smartphone": "Smartphones",
    "laptop": "Laptops", "notebook": "Laptops",
    "headphone": "Audio", "headphones": "Audio", "earphone": "Audio",
    "earphones": "Audio", "earbuds": "Audio", "speaker": "Audio", "speakers": "Audio",
    "book": "Books & Stationery", "books": "Books & Stationery",
    "pen": "Books & Stationery", "pens": "Books & Stationery",
    "clothes": "Fashion", "clothing": "Fashion", "shirt": "Fashion",
    "shoes": "Fashion", "shoe": "Fashion", "sneakers": "Fashion",
    "game": "Gaming", "games": "Gaming", "console": "Gaming",
    "kitchen": "Home & Kitchen", "home": "Home & Kitchen",
    "beauty": "Beauty & Personal Care", "skincare": "Beauty & Personal Care",
    "makeup": "Beauty & Personal Care", "cosmetics": "Beauty & Personal Care",
    "sport": "Sports & Fitness", "sports": "Sports & Fitness",
    "fitness": "Sports & Fitness", "gym": "Sports & Fitness",
    "toy": "Toys", "toys": "Toys",
    "medicine": "Medicine", "medicines": "Medicine",
    "tablet": "Electronics", "tv": "Electronics", "television": "Electronics",
}

INTENT_EXAMPLES = {
    "search_products": [
        "show me phones under 20000",
        "find laptops for me",
        "I'm looking for headphones",
        "search for running shoes",
        "do you have any tablets",
        "show products in electronics",
        "I want to buy a camera",
        "any good bluetooth speakers",
        "what smartphones do you have",
        "looking for a dress",
    ],
    "suggest_top_rated": [
        "what are the best products",
        "recommend something for me",
        "popular items in electronics",
        "top rated smartphones",
        "what should I buy",
        "best selling products",
        "trending items",
        "suggest something nice",
    ],
    "get_product_reviews": [
        "what do customers say about this product",
        "show me the reviews",
        "how is the rating of this product",
        "are the reviews good",
        "what do people think about this",
        "customer opinions",
    ],
    "list_user_orders": [
        "show my orders",
        "my recent orders",
        "what have I ordered",
        "order history",
        "list my purchases",
    ],
    "get_order_status": [
        "where is my order",
        "track my delivery",
        "when will my order arrive",
        "order status",
        "check delivery status",
        "has my package shipped",
    ],
    "get_cart": [
        "what is in my cart",
        "show my cart",
        "cart contents",
        "view my basket",
        "items in cart",
    ],
    "add_to_cart": [
        "add this to my cart",
        "I want to buy this",
        "put this in my cart",
        "add to basket",
    ],
    "get_wishlist": [
        "show my wishlist",
        "wishlist items",
        "my saved items",
        "saved for later",
        "what is in my wishlist",
        "wishlist details",
        "my wish list",
    ],
    "list_addresses": [
        "show my addresses",
        "my delivery addresses",
        "saved addresses",
        "where can I deliver to",
    ],
    "get_cancellable_orders": [
        "I want to cancel my order",
        "which orders can I cancel",
        "how to cancel an order",
        "cancel order",
    ],
    "general": [
        "what can you do",
        "help me",
        "what features do you have",
        "how can you help",
        "tell me about yourself",
    ],
    "policy": [
        "what is the return policy",
        "shipping information",
        "payment methods accepted",
        "refund policy",
        "how long does delivery take",
        "do you offer cash on delivery",
    ],
}

_intent_embeddings: dict = {}  # intent_name -> np.ndarray (mean embedding)
_st_model = None


def _get_st_model():
    global _st_model
    if _st_model is None:
        from app.services.embedding_service import get_model
        _st_model = get_model()
    return _st_model


def init_intent_embeddings():
    """Pre-compute mean embeddings for each intent category."""
    global _intent_embeddings
    model = _get_st_model()
    for intent, examples in INTENT_EXAMPLES.items():
        vecs = model.encode(examples, normalize_embeddings=True)
        mean_vec = np.mean(vecs, axis=0).astype(np.float32)
        norm = np.linalg.norm(mean_vec)
        if norm > 0:
            mean_vec = mean_vec / norm
        _intent_embeddings[intent] = mean_vec
    logger.info("Initialized %d intent embeddings for chat", len(_intent_embeddings))


def _classify_intent_semantic(message: str) -> tuple:
    """Classify message intent using cosine similarity with sentence transformer.
    Returns (intent_name, confidence_score).
    """
    if not _intent_embeddings:
        init_intent_embeddings()

    model = _get_st_model()
    msg_vec = model.encode(message, normalize_embeddings=True)

    best_intent = "general"
    best_score = -1.0

    for intent, intent_vec in _intent_embeddings.items():
        score = float(np.dot(msg_vec, intent_vec))
        if score > best_score:
            best_score = score
            best_intent = intent

    return best_intent, best_score


# ── Parameter extraction helpers ────────────────────────────
_UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
_PRICE_UNDER_RE = re.compile(
    r"(?:under|below|less\s*than|max|upto|up\s*to|within|budget)\s*₹?\s*(\d[\d,]*)", re.I
)
_PRICE_ABOVE_RE = re.compile(
    r"(?:above|over|more\s*than|min|starting|from|at\s*least)\s*₹?\s*(\d[\d,]*)", re.I
)
_PRICE_BETWEEN_RE = re.compile(
    r"(?:between|from)\s*₹?\s*(\d[\d,]*)\s*(?:to|and|-)\s*₹?\s*(\d[\d,]*)", re.I
)


def _extract_category(text: str) -> Optional[str]:
    lower = text.lower()
    for cat_lower, cat in _CATEGORIES_LOWER.items():
        if cat_lower in lower:
            return cat
    # Check aliases
    for word in lower.split():
        if word in _CATEGORY_ALIASES:
            return _CATEGORY_ALIASES[word]
    return None


def _extract_price_range(text: str) -> tuple:
    m = _PRICE_BETWEEN_RE.search(text)
    if m:
        return float(m.group(1).replace(",", "")), float(m.group(2).replace(",", ""))
    min_price = None
    max_price = None
    m = _PRICE_UNDER_RE.search(text)
    if m:
        max_price = float(m.group(1).replace(",", ""))
    m = _PRICE_ABOVE_RE.search(text)
    if m:
        min_price = float(m.group(1).replace(",", ""))
    return min_price, max_price


def _extract_search_query(text: str) -> str:
    query = text.strip()
    query = _PRICE_UNDER_RE.sub("", query)
    query = _PRICE_ABOVE_RE.sub("", query)
    query = _PRICE_BETWEEN_RE.sub("", query)
    for prefix in [
        "show me", "find me", "search for", "look for", "i want", "i need",
        "do you have", "can you show", "looking for", "i'm looking for",
        "show", "find", "search", "get", "any",
    ]:
        if query.lower().startswith(prefix):
            query = query[len(prefix):].strip()
    return query.strip() or text.strip()


def _find_recent_product_id(history: list) -> Optional[str]:
    for entry in reversed(history):
        content = entry.get("content", "")
        m = _UUID_RE.search(content)
        if m:
            return m.group()
    return None


# ── Response formatting (templates) ─────────────────────────
def _format_search_results(data: dict) -> str:
    products = data.get("products", [])
    if not products:
        return "I couldn't find any products matching your search. Could you try different keywords or a broader search?"
    total = data.get("total", len(products))
    lines = [f"I found {total} product{'s' if total != 1 else ''} for you! Here are the top results:\n"]
    for i, p in enumerate(products[:6], 1):
        price = f"₹{p['selling_price']:,.0f}" if p.get("selling_price") else "Price N/A"
        stock = p.get("stock_status", "").replace("_", " ").title()
        rating = f" | {p['rating']}★" if p.get("rating") else ""
        reviews = f" ({p['review_count']} reviews)" if p.get("review_count") else ""
        lines.append(f"**{i}. {p['name']}** — {price} | {stock}{rating}{reviews}")
    return "\n".join(lines)


def _format_product_details(data: dict) -> str:
    if data.get("error"):
        return data["error"]
    name = data.get("name", "Unknown Product")
    price = f"₹{data['selling_price']:,.0f}" if data.get("selling_price") else "Price N/A"
    mrp = f" (MRP ₹{data['mrp']:,.0f})" if data.get("mrp") and data.get("mrp") != data.get("selling_price") else ""
    stock = data.get("stock_status", "").replace("_", " ").title()
    desc = data.get("description", "")
    return f"**{name}** — {price}{mrp} | {stock}\n\n{desc}"


def _format_order_status(data: dict) -> str:
    if data.get("error"):
        return data["error"]
    status = data.get("status", "Unknown").replace("_", " ").title()
    total = f"₹{data['total_price']:,.0f}" if data.get("total_price") else ""
    tracking = f"\nTracking: {data['tracking_number']}" if data.get("tracking_number") else ""
    delivery = f"\nEstimated delivery: {data['estimated_delivery']}" if data.get("estimated_delivery") else ""
    return f"Your order **{data.get('order_id', '')[:8]}...** is currently **{status}**.{' Total: ' + total if total else ''}{tracking}{delivery}"


def _format_orders_list(data: dict) -> str:
    if data.get("error"):
        return data["error"]
    orders = data.get("orders", [])
    if not orders:
        return "You don't have any orders yet. Start shopping to place your first order! 😊"
    lines = ["Here are your recent orders:\n"]
    for o in orders:
        status = o.get("status", "").replace("_", " ").title()
        total = f"₹{o['total_price']:,.0f}" if o.get("total_price") else ""
        lines.append(f"• Order **{o['order_id'][:8]}...** — {status} | {total} ({o.get('item_count', 0)} items)")
    return "\n".join(lines)


def _format_cart(data: dict) -> str:
    if data.get("error"):
        return data["error"]
    items = data.get("items", [])
    if not items:
        return "Your cart is empty. Browse our products and add something you like! 🛒"
    try:
        subtotal = f"₹{float(data['subtotal']):,.0f}" if data.get("subtotal") else ""
    except (ValueError, TypeError):
        subtotal = f"₹{data['subtotal']}" if data.get("subtotal") else ""
    lines = [f"Your cart has {data.get('item_count', len(items))} item{'s' if len(items) != 1 else ''}:\n"]
    for item in items:
        try:
            price = f"₹{float(item['price']):,.0f}" if item.get("price") else ""
        except (ValueError, TypeError):
            price = f"₹{item['price']}" if item.get("price") else ""
        lines.append(f"• **{item.get('product_name', 'Product')}** × {item.get('quantity', 1)} — {price}")
    if subtotal:
        lines.append(f"\n**Subtotal: {subtotal}**")
    return "\n".join(lines)


def _format_recommendations(data: dict) -> str:
    products = data.get("products", [])
    if not products:
        return "I don't have specific recommendations right now. Would you like to search for something?"
    note = data.get("note")
    lines = []
    if note:
        lines.append(f"_{note}_\n")
    else:
        lines.append("Here are some top-rated products I'd recommend:\n")
    for i, p in enumerate(products[:6], 1):
        price = f"₹{p['selling_price']:,.0f}" if p.get("selling_price") else "Price N/A"
        rating = f" | {p['rating']}★" if p.get("rating") else ""
        reviews = f" ({p['review_count']} reviews)" if p.get("review_count") else ""
        lines.append(f"**{i}. {p['name']}** — {price}{rating}{reviews}")
    return "\n".join(lines)


def _format_reviews(data: dict) -> str:
    if data.get("error"):
        return data["error"]
    reviews = data.get("reviews", [])
    total = data.get("total", 0)
    if not reviews:
        return "This product doesn't have any reviews yet."
    lines = [f"This product has {total} review{'s' if total != 1 else ''}. Here's what customers are saying:\n"]
    for rv in reviews:
        stars = "★" * rv.get("rating", 0) + "☆" * (5 - rv.get("rating", 0))
        text = rv.get("review_text", "No text")
        lines.append(f"• {stars} — {text}")
    return "\n".join(lines)


def _format_addresses(data: dict) -> str:
    if data.get("error"):
        return data["error"]
    addrs = data.get("addresses", [])
    if not addrs:
        return "You don't have any saved addresses. You can add one during checkout."
    lines = ["Here are your saved addresses:\n"]
    for a in addrs:
        default = " ⭐ (Default)" if a.get("is_default") else ""
        lines.append(
            f"• **{a.get('full_name', '')}** — {a.get('address_line1', '')}, "
            f"{a.get('city', '')}, {a.get('state', '')} {a.get('pincode', '')}{default}"
        )
    return "\n".join(lines)


def _format_cancellable_orders(data: dict) -> str:
    if data.get("error"):
        return data["error"]
    orders = data.get("cancellable_orders", [])
    note = data.get("note", "")
    if not orders:
        return f"You don't have any orders that can be cancelled right now. {note}"
    lines = [f"These orders can still be cancelled:\n"]
    for o in orders:
        status = o.get("status", "").title()
        try:
            total = f"₹{float(o['total_price']):,.0f}" if o.get("total_price") else ""
        except (ValueError, TypeError):
            total = f"₹{o['total_price']}" if o.get("total_price") else ""
        lines.append(f"• Order **{o['order_id'][:8]}...** — {status} | {total}")
    if note:
        lines.append(f"\n_{note}_")
    return "\n".join(lines)


def _format_add_to_cart(data: dict) -> str:
    if data.get("error"):
        return f"Couldn't add to cart: {data['error']}"
    return "Done! I've added the product to your cart. 🛒"


def _format_wishlist(data: dict) -> str:
    if data.get("error"):
        return data["error"]
    items = data.get("items", [])
    if not items:
        return "Your wishlist is empty. Browse products and save items you like! ❤️"
    lines = [f"Your wishlist has {len(items)} item{'s' if len(items) != 1 else ''}:\n"]
    for item in items:
        try:
            price = f"₹{float(item['selling_price']):,.0f}" if item.get("selling_price") else ""
        except (ValueError, TypeError):
            price = f"₹{item['selling_price']}" if item.get("selling_price") else ""
        stock = item.get("stock_status", "").replace("_", " ").title()
        lines.append(f"• **{item.get('product_name', 'Product')}** — {price} | {stock}")
    return "\n".join(lines)


_FORMATTERS = {
    "search_products": _format_search_results,
    "get_product_details": _format_product_details,
    "get_order_status": _format_order_status,
    "list_user_orders": _format_orders_list,
    "get_cart": _format_cart,
    "add_to_cart": _format_add_to_cart,
    "suggest_top_rated": _format_recommendations,
    "get_product_reviews": _format_reviews,
    "list_addresses": _format_addresses,
    "get_cancellable_orders": _format_cancellable_orders,
    "get_wishlist": _format_wishlist,
}

GENERAL_RESPONSE = (
    "Hi! I'm your ShopHere assistant. Here's what I can help you with:\n\n"
    "🛍️ **Products** — Search, compare, and filter by price or category\n"
    "📦 **Orders** — Check order status, track deliveries, cancel orders\n"
    "⭐ **Reviews** — Read what other customers think about products\n"
    "💡 **Recommendations** — Get personalized product suggestions\n"
    "🛒 **Cart** — View and manage your shopping cart\n"
    "📍 **Addresses** — View your saved delivery addresses\n"
    "ℹ️ **Policies** — Returns, shipping, and payment information\n\n"
    "Just ask me anything!"
)

# Map keyword-router intents → tool names
_KEYWORD_INTENT_TO_TOOL = {
    "order_status": "get_order_status",
    "cancel_order": "get_cancellable_orders",
    "list_addresses": "list_addresses",
    "cart": "get_cart",
    "recommend": "suggest_top_rated",
    "wishlist": "get_wishlist",
}

# Map semantic intents → tool names
_SEMANTIC_INTENT_TO_TOOL = {
    "search_products": "search_products",
    "suggest_top_rated": "suggest_top_rated",
    "get_product_reviews": "get_product_reviews",
    "list_user_orders": "list_user_orders",
    "get_order_status": "get_order_status",
    "get_cart": "get_cart",
    "add_to_cart": "add_to_cart",
    "list_addresses": "list_addresses",
    "get_cancellable_orders": "get_cancellable_orders",
    "get_wishlist": "get_wishlist",
}



# ── Redis for chat sessions ────────────────────────────────
_redis: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


# ── Tool execution ─────────────────────────────────────────
TOOL_CACHE_TTL = 300  # 5 minutes for product/search data


async def _cache_get(key: str) -> dict | None:
    """Get cached tool result from Redis."""
    try:
        r = await get_redis()
        raw = await r.get(f"tool_cache:{key}")
        if raw:
            return json.loads(raw)
    except Exception:
        pass
    return None


async def _cache_set(key: str, data: dict, ttl: int = TOOL_CACHE_TTL):
    """Cache a tool result in Redis."""
    try:
        r = await get_redis()
        await r.setex(f"tool_cache:{key}", ttl, json.dumps(data))
    except Exception:
        pass


async def _execute_tool(name: str, args: dict, auth_token: Optional[str] = None) -> dict:
    """Execute a tool call by making HTTP requests to the relevant microservice."""
    headers = {}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            if name == "search_products":
                cache_key = f"search:{args.get('query', '')}:{args.get('category', '')}:{args.get('min_price', '')}:{args.get('max_price', '')}"
                cached = await _cache_get(cache_key)
                if cached:
                    return cached
                body: dict = {"q": args.get("query", ""), "page": 1, "size": 6}
                if args.get("category"):
                    body["categories"] = [args["category"]]
                if args.get("min_price") is not None:
                    try:
                        body["min_price"] = float(args["min_price"])
                    except (ValueError, TypeError):
                        pass
                if args.get("max_price") is not None:
                    try:
                        body["max_price"] = float(args["max_price"])
                    except (ValueError, TypeError):
                        pass
                r = await client.post(f"{settings.PRODUCT_SERVICE_URL}/search/filter", json=body)
                if r.status_code == 200:
                    data = r.json()
                    hits = data.get("hits", [])
                    # Retry without category if 0 results and category was applied
                    if not hits and "categories" in body:
                        body.pop("categories")
                        r2 = await client.post(f"{settings.PRODUCT_SERVICE_URL}/search/filter", json=body)
                        if r2.status_code == 200:
                            data = r2.json()
                            hits = data.get("hits", [])
                    result = {
                        "products": [
                            {
                                "product_id": h["product_id"],
                                "name": h.get("name", ""),
                                "selling_price": h.get("selling_price"),
                                "mrp": h.get("mrp"),
                                "stock_status": h.get("stock_status", ""),
                                "rating": h.get("rating"),
                                "review_count": h.get("review_count", 0),
                                "image_url": h.get("image_url"),
                            }
                            for h in hits[:6]
                        ],
                        "total": data.get("total", 0),
                    }
                    await _cache_set(cache_key, result)
                    return result
                return {"error": "Search failed"}

            elif name == "get_product_details":
                pd_cache_key = f"product:{args['product_id']}"
                cached = await _cache_get(pd_cache_key)
                if cached:
                    return cached
                r = await client.get(f"{settings.PRODUCT_SERVICE_URL}/products/{args['product_id']}")
                if r.status_code == 200:
                    p = r.json()
                    images = p.get("images") or []
                    result = {
                        "product_id": p["product_id"],
                        "name": p.get("name"),
                        "description": p.get("description", "")[:300],
                        "mrp": p.get("mrp"),
                        "selling_price": p.get("selling_price"),
                        "stock_status": p.get("stock_status"),
                        "stock_quantity": p.get("stock_quantity"),
                        "image_url": images[0]["url"] if images else None,
                    }
                    await _cache_set(pd_cache_key, result)
                    return result
                return {"error": "Product not found"}

            elif name == "get_order_status":
                r = await client.get(
                    f"{settings.ORDER_SERVICE_URL}/orders/{args['order_id']}",
                    headers=headers,
                )
                if r.status_code == 200:
                    o = r.json()
                    return {
                        "order_id": o["order_id"],
                        "status": o.get("status"),
                        "payment_status": o.get("payment_status"),
                        "total_price": float(o.get("total_price", 0)),
                        "tracking_number": o.get("tracking_number"),
                        "estimated_delivery": o.get("estimated_delivery"),
                        "item_count": len(o.get("items", [])),
                    }
                return {"error": "Order not found or access denied"}

            elif name == "list_user_orders":
                r = await client.get(
                    f"{settings.ORDER_SERVICE_URL}/orders",
                    params={"size": 5},
                    headers=headers,
                )
                if r.status_code == 200:
                    data = r.json()
                    return {
                        "orders": [
                            {
                                "order_id": o["order_id"],
                                "status": o.get("status"),
                                "total_price": float(o.get("total_price", 0)),
                                "item_count": len(o.get("items", [])),
                                "created_at": o.get("created_at"),
                            }
                            for o in data.get("items", [])[:5]
                        ]
                    }
                return {"error": "Could not fetch orders. Please make sure you are logged in."}

            elif name == "get_cart":
                r = await client.get(f"{settings.CART_SERVICE_URL}/cart", headers=headers)
                if r.status_code == 200:
                    cart = r.json()
                    return {
                        "items": [
                            {
                                "product_id": item["product_id"],
                                "product_name": item.get("product_name"),
                                "quantity": item.get("quantity"),
                                "price": item.get("current_price") or item.get("unit_price"),
                            }
                            for item in cart.get("items", [])
                        ],
                        "subtotal": cart.get("subtotal"),
                        "item_count": cart.get("item_count"),
                    }
                return {"error": "Could not fetch cart. Please make sure you are logged in."}

            elif name == "add_to_cart":
                r = await client.post(
                    f"{settings.CART_SERVICE_URL}/cart/add",
                    json={"product_id": args["product_id"], "quantity": args.get("quantity", 1)},
                    headers=headers,
                )
                if r.status_code in (200, 201):
                    return {"success": True, "message": "Product added to cart"}
                detail = "Failed to add to cart"
                try:
                    detail = r.json().get("detail", detail)
                except Exception:
                    pass
                return {"error": detail}

            elif name == "suggest_top_rated":
                req_size = min(int(args.get("size", 6)), 10)
                params: dict = {"size": req_size}
                if args.get("category"):
                    params["category"] = args["category"]
                r = await client.get(f"{settings.PRODUCT_SERVICE_URL}/search/top-rated", params=params)
                hits = []
                used_fallback = False
                if r.status_code == 200:
                    hits = r.json().get("hits", [])
                # Fallback: if no reviewed products found, search by popularity
                if not hits:
                    used_fallback = True
                    fallback_body: dict = {"q": args.get("category", ""), "page": 1, "size": req_size}
                    if args.get("category"):
                        fallback_body["categories"] = [args["category"]]
                    rf = await client.post(f"{settings.PRODUCT_SERVICE_URL}/search/filter", json=fallback_body)
                    if rf.status_code == 200:
                        hits = rf.json().get("hits", [])
                return {
                    "products": [
                        {
                            "product_id": h["product_id"],
                            "name": h.get("name", ""),
                            "selling_price": h.get("selling_price"),
                            "mrp": h.get("mrp"),
                            "rating": h.get("rating"),
                            "review_count": h.get("review_count", 0),
                            "stock_status": h.get("stock_status", ""),
                            "image_url": h.get("image_url"),
                        }
                        for h in hits
                    ],
                    "total": len(hits),
                    "note": "No reviewed products yet; showing popular items in this category" if used_fallback else None,
                }

            elif name == "get_product_reviews":
                params = {
                    "product_id": args["product_id"],
                    "size": min(int(args.get("size", 5)), 10),
                    "page": 1,
                }
                if args.get("min_rating"):
                    params["min_rating"] = args["min_rating"]
                r = await client.get(f"{settings.PRODUCT_SERVICE_URL}/reviews", params=params)
                if r.status_code == 200:
                    data = r.json()
                    return {
                        "reviews": [
                            {
                                "rating": rv.get("rating"),
                                "review_text": (rv.get("review_text") or "")[:300],
                                "created_at": rv.get("created_at"),
                            }
                            for rv in data.get("items", [])
                        ],
                        "total": data.get("total", 0),
                    }
                return {"error": "Could not fetch reviews"}

            elif name == "list_addresses":
                r = await client.get(
                    f"{settings.ORDER_SERVICE_URL}/addresses",
                    headers=headers,
                )
                if r.status_code == 200:
                    addrs = r.json()
                    return {
                        "addresses": [
                            {
                                "address_id": a.get("address_id"),
                                "full_name": a.get("full_name"),
                                "address_line1": a.get("address_line1"),
                                "city": a.get("city"),
                                "state": a.get("state"),
                                "pincode": a.get("pincode"),
                                "is_default": a.get("is_default", False),
                            }
                            for a in addrs
                        ],
                        "total": len(addrs),
                    }
                return {"error": "Could not fetch addresses. Please make sure you are logged in."}

            elif name == "get_cancellable_orders":
                r = await client.get(
                    f"{settings.ORDER_SERVICE_URL}/orders",
                    params={"size": 20},
                    headers=headers,
                )
                if r.status_code == 200:
                    data = r.json()
                    cancellable = [
                        o for o in data.get("items", [])
                        if o.get("status") in ("pending", "confirmed")
                    ]
                    return {
                        "cancellable_orders": [
                            {
                                "order_id": o["order_id"],
                                "status": o.get("status"),
                                "total_price": float(o.get("total_price", 0)),
                                "item_count": len(o.get("items", [])),
                                "created_at": o.get("created_at"),
                            }
                            for o in cancellable
                        ],
                        "total": len(cancellable),
                        "note": "Orders can only be cancelled before they are shipped." if cancellable else "No cancellable orders found.",
                    }
                return {"error": "Could not fetch orders. Please make sure you are logged in."}

            elif name == "get_wishlist":
                r = await client.get(
                    f"{settings.CART_SERVICE_URL}/cart/saved",
                    headers=headers,
                )
                if r.status_code == 200:
                    data = r.json()
                    return {
                        "items": [
                            {
                                "product_id": item.get("product_id"),
                                "product_name": item.get("product_name"),
                                "selling_price": item.get("selling_price"),
                                "stock_status": item.get("stock_status", "in_stock"),
                                "image_url": item.get("image_url"),
                            }
                            for item in data.get("items", [])
                        ],
                        "count": data.get("count", 0),
                    }
                return {"error": "Could not fetch wishlist. Please make sure you are logged in."}

            else:
                return {"error": f"Unknown tool: {name}"}

        except httpx.TimeoutException:
            return {"error": f"Service timeout when calling {name}"}
        except Exception as exc:
            logger.error("Tool execution error for %s: %s", name, exc)
            return {"error": "Internal service error"}


# ── Session management ─────────────────────────────────────
async def _load_history(session_id: str) -> list:
    try:
        r = await get_redis()
        raw = await r.get(f"chat:{session_id}")
        if raw:
            return json.loads(raw)
    except Exception as exc:
        logger.warning("Redis unavailable for history load: %s", exc)
    return []


async def _save_history(session_id: str, history: list):
    try:
        r = await get_redis()
        # Keep last 20 turns to avoid token bloat
        trimmed = history[-40:]  # 40 messages = ~20 turns
        await r.setex(f"chat:{session_id}", settings.CHAT_SESSION_TTL, json.dumps(trimmed))
    except Exception as exc:
        logger.warning("Redis unavailable for history save: %s", exc)


async def clear_session(session_id: str):
    try:
        r = await get_redis()
        await r.delete(f"chat:{session_id}")
    except Exception:
        pass


# ── Parse malformed Groq tool calls ────────────────────────
# (Removed — no longer using Groq LLM)


# ── Main chat function (sentence-transformer based) ────────
async def chat(
    message: str,
    session_id: Optional[str] = None,
    auth_token: Optional[str] = None,
) -> dict:
    """Process a chat message using sentence-transformer intent classification."""
    if not session_id:
        session_id = str(uuid.uuid4())

    # ── Fast-path intent routing (keyword-based) ──
    routed = route_intent(message)
    if routed.fast_response:
        history = await _load_history(session_id)
        history.append({"role": "user", "content": message})
        history.append({"role": "assistant", "content": routed.fast_response})
        await _save_history(session_id, history)
        return {
            "response": routed.fast_response,
            "session_id": session_id,
            "products": None,
            "actions": None,
        }

    # ── Human handoff request ──
    if routed.intent == "human_handoff" and auth_token:
        try:
            from jose import jwt as jose_jwt
            payload = jose_jwt.decode(auth_token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
            user_id = payload.get("user_id", payload.get("sub", ""))
            user_name = payload.get("first_name", "Customer")
            ticket = await handoff_service.create_ticket(
                user_id=user_id,
                user_name=user_name,
                session_id=session_id,
                reason=message,
            )
            handoff_response = (
                "I'm connecting you with a human agent. You've been added to the queue. "
                "An agent will be with you shortly. Your ticket ID is: " + ticket.ticket_id
            )
            history = await _load_history(session_id)
            history.append({"role": "user", "content": message})
            history.append({"role": "assistant", "content": handoff_response})
            await _save_history(session_id, history)
            return {
                "response": handoff_response,
                "session_id": session_id,
                "products": None,
                "actions": [{"type": "handoff", "data": {"ticket_id": ticket.ticket_id}}],
            }
        except Exception as e:
            logger.warning("Failed to create handoff ticket: %s", e)

    history = await _load_history(session_id)
    products_found: list = []
    actions: list = []

    # ── Determine intent and tool ──
    tool_name: Optional[str] = None
    tool_args: dict = {}
    intent = routed.intent

    # 1. Map keyword-router intents to tools
    if intent in _KEYWORD_INTENT_TO_TOOL:
        tool_name = _KEYWORD_INTENT_TO_TOOL[intent]
    elif intent == "policy_question":
        pass  # handled below via RAG
    elif intent == "llm":
        # 2. Semantic classification fallback
        sem_intent, confidence = _classify_intent_semantic(message)
        logger.info("Semantic intent: %s (%.3f) for: %s", sem_intent, confidence, message[:80])
        if confidence > 0.35 and sem_intent in _SEMANTIC_INTENT_TO_TOOL:
            tool_name = _SEMANTIC_INTENT_TO_TOOL[sem_intent]
            intent = sem_intent
        elif sem_intent == "policy":
            intent = "policy_question"
        elif sem_intent == "general":
            intent = "general"
        else:
            # Low confidence — try RAG, then fall back to search
            intent = "fallback"

    # ── Extract parameters for the chosen tool ──
    if tool_name == "search_products":
        query = _extract_search_query(message)
        category = _extract_category(message)
        min_price, max_price = _extract_price_range(message)
        tool_args = {"query": query}
        if category:
            tool_args["category"] = category
        if min_price is not None:
            tool_args["min_price"] = min_price
        if max_price is not None:
            tool_args["max_price"] = max_price

    elif tool_name == "get_order_status":
        order_match = _UUID_RE.search(message)
        if order_match:
            tool_args = {"order_id": order_match.group()}
        else:
            tool_name = "list_user_orders"

    elif tool_name == "suggest_top_rated":
        category = _extract_category(message)
        if category:
            tool_args["category"] = category

    elif tool_name == "get_product_reviews":
        product_match = _UUID_RE.search(message)
        if product_match:
            tool_args = {"product_id": product_match.group()}
        else:
            pid = _find_recent_product_id(history)
            if pid:
                tool_args = {"product_id": pid}
            else:
                # Can't determine product — search instead
                tool_name = "search_products"
                tool_args = {"query": _extract_search_query(message)}

    elif tool_name == "add_to_cart":
        product_match = _UUID_RE.search(message)
        if product_match:
            tool_args = {"product_id": product_match.group(), "quantity": 1}
        else:
            pid = _find_recent_product_id(history)
            if pid:
                tool_args = {"product_id": pid, "quantity": 1}
            else:
                tool_name = None
                intent = "no_product_for_cart"

    # ── Execute tool and format response ──
    response_text = ""

    if tool_name:
        result = await _execute_tool(tool_name, tool_args, auth_token)

        # Collect products for frontend cards
        if tool_name in ("search_products", "suggest_top_rated") and "products" in result:
            products_found.extend(result["products"])
        elif tool_name == "get_product_details" and "product_id" in result:
            products_found.append(result)
            actions.append({"type": "view_product", "data": {"product_id": result["product_id"]}})
        elif tool_name == "add_to_cart" and result.get("success"):
            actions.append({"type": "add_to_cart", "data": {"product_id": tool_args.get("product_id")}})
        elif tool_name == "get_order_status" and "order_id" in result:
            actions.append({"type": "view_order", "data": {"order_id": result["order_id"]}})

        formatter = _FORMATTERS.get(tool_name)
        if formatter:
            response_text = formatter(result)
        else:
            response_text = "Here's what I found."

    elif intent in ("policy_question", "policy"):
        rag_chunks = await rag_kb.retrieve(message, top_k=3)
        if rag_chunks:
            response_text = rag_kb.format_context(rag_chunks, max_chars=1500)
        else:
            response_text = (
                "I don't have specific information about that right now. "
                "Would you like me to connect you with our support team?"
            )

    elif intent == "general":
        response_text = GENERAL_RESPONSE

    elif intent == "no_product_for_cart":
        response_text = (
            "I'd be happy to add a product to your cart! "
            "Could you search for a product first, and then I can add it for you?"
        )

    else:
        # Fallback: try RAG retrieval, then default search
        rag_chunks = await rag_kb.retrieve(message, top_k=4)
        if rag_chunks:
            # Check if top chunk is relevant enough
            response_text = rag_kb.format_context(rag_chunks, max_chars=1500)
        else:
            # Last resort: do a product search with the message text
            result = await _execute_tool("search_products", {"query": _extract_search_query(message)}, auth_token)
            if result.get("products"):
                products_found.extend(result["products"])
                response_text = _format_search_results(result)
            else:
                response_text = (
                    "I'm not sure I understood that. I can help you with product searches, "
                    "order tracking, recommendations, cart management, and store policies. "
                    "Could you rephrase your question?"
                )

    # Save to history
    history.append({"role": "user", "content": message})
    history.append({"role": "assistant", "content": response_text})
    await _save_history(session_id, history)

    return {
        "response": response_text,
        "session_id": session_id,
        "products": products_found if products_found else None,
        "actions": [{"type": a["type"], "data": a["data"]} for a in actions] if actions else None,
    }
