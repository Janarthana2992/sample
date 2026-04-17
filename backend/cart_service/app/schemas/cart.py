from decimal import Decimal
from datetime import datetime
from typing import Dict, List, Optional
import uuid
from pydantic import BaseModel, Field


class CartItemIn(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(ge=1, le=1000)


class WishlistItemIn(BaseModel):
    product_id: uuid.UUID


class WishlistItem(BaseModel):
    product_id: str
    product_name: str
    selling_price: Decimal
    mrp: Decimal
    image_url: Optional[str] = None
    stock_status: str = "in_stock"
    added_at: str


class WishlistResponse(BaseModel):
    user_id: str
    items: List[WishlistItem]
    count: int


class CartItemUpdate(BaseModel):
    quantity: int = Field(ge=1, le=1000)


class CartItemSnapshot(BaseModel):
    """Stored in Redis per cart item."""
    product_id: str
    quantity: int
    price_snapshot: Decimal   # selling_price captured at add-to-cart
    product_name: str
    image_url: Optional[str] = None
    added_at: str             # ISO datetime


class CartLine(BaseModel):
    product_id: uuid.UUID
    product_name: str
    quantity: int
    unit_price: Decimal
    current_price: Decimal
    price_stale: bool        # True if current_price != unit_price
    image_url: Optional[str]
    line_total: Decimal


class CartResponse(BaseModel):
    user_id: str
    items: List[CartLine]
    subtotal: Decimal
    item_count: int
