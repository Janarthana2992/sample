from datetime import datetime, date
from decimal import Decimal
from typing import List, Optional
import uuid
from pydantic import BaseModel, Field


# ── Address ─────────────────────────────────────────────────

class AddressCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=6, max_length=20)
    address_line1: str = Field(min_length=5)
    address_line2: Optional[str] = None
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=100)
    pincode: str = Field(min_length=6, max_length=10, pattern=r"^\d{6}$")
    country: str = "India"
    is_default: bool = False


class AddressOut(BaseModel):
    address_id: uuid.UUID
    full_name: str
    phone: str
    address_line1: str
    address_line2: Optional[str]
    city: str
    state: str
    pincode: str
    country: str
    is_default: bool

    model_config = {"from_attributes": True}


# ── Order ────────────────────────────────────────────────────

class OrderItemOut(BaseModel):
    order_item_id: uuid.UUID
    product_id: uuid.UUID
    product_name: Optional[str] = None
    quantity: int
    unit_price: Decimal

    model_config = {"from_attributes": True}


class StatusHistoryOut(BaseModel):
    from_status: Optional[str]
    to_status: str
    changed_at: datetime
    note: Optional[str]

    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    order_id: uuid.UUID
    user_id: uuid.UUID
    total_price: Decimal
    deal_discount: Decimal
    status: str
    payment_method: Optional[str]
    payment_status: str
    tracking_number: Optional[str]
    estimated_delivery: Optional[date]
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    items: List[OrderItemOut] = []
    shipping_address: Optional[AddressOut] = None
    status_history: List[StatusHistoryOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class OrderListItem(BaseModel):
    order_id: uuid.UUID
    total_price: Decimal
    status: str
    item_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedOrders(BaseModel):
    items: List[OrderOut]
    total: int
    page: int
    size: int


class CheckoutRequest(BaseModel):
    address_id: uuid.UUID
    payment_method: str = Field(pattern="^(upi|card|net_banking|cod)$")


class StatusUpdateRequest(BaseModel):
    status: str = Field(pattern="^(confirmed|dispatched|delivered|cancelled)$")
    tracking_number: Optional[str] = None


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    note: Optional[str] = None
