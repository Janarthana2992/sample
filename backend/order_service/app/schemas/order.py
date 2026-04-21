from datetime import datetime, date
from decimal import Decimal
import re
from typing import List, Optional
import uuid
from pydantic import BaseModel, Field, field_validator


_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z .'\-]{1,254}$")
_PHONE_RE = re.compile(r"^[6-9]\d{9}$")
_PINCODE_RE = re.compile(r"^[1-9]\d{5}$")


# ── Address ─────────────────────────────────────────────────

class AddressCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=10, max_length=20)
    address_line1: str = Field(min_length=5, max_length=255)
    address_line2: Optional[str] = Field(default=None, max_length=255)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=100)
    pincode: str = Field(min_length=6, max_length=6)
    country: str = "India"
    is_default: bool = False

    @field_validator("full_name")
    @classmethod
    def _validate_full_name(cls, v: str) -> str:
        v = v.strip()
        if not _NAME_RE.match(v):
            raise ValueError("Full name must be 2+ chars and use letters/spaces/.'- only")
        return v

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        # accept leading 91 country code
        if digits.startswith("91") and len(digits) == 12:
            digits = digits[2:]
        if not _PHONE_RE.match(digits):
            raise ValueError("Phone must be a 10-digit Indian mobile number (starts with 6-9)")
        return digits

    @field_validator("pincode")
    @classmethod
    def _validate_pincode_format(cls, v: str) -> str:
        v = v.strip()
        if not _PINCODE_RE.match(v):
            raise ValueError("Pincode must be a valid 6-digit Indian PIN (first digit 1-9)")
        return v

    @field_validator("city", "state")
    @classmethod
    def _strip_non_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Value cannot be empty")
        return v

    @field_validator("address_line1")
    @classmethod
    def _validate_address_line1(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 5:
            raise ValueError("Address line 1 must be at least 5 characters")
        return v


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
