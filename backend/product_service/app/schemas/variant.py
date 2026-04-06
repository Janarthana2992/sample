from datetime import datetime
from decimal import Decimal
from typing import Optional
import uuid
from pydantic import BaseModel, Field


class VariantCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_\-]+$")
    color: Optional[str] = Field(default=None, max_length=80)
    size: Optional[str] = Field(default=None, max_length=80)
    stock_quantity: int = Field(ge=0, default=0)
    stock_status: str = "in_stock"
    price_adjustment: Decimal = Field(default=Decimal("0"))
    is_active: bool = True


class VariantUpdate(BaseModel):
    color: Optional[str] = Field(default=None, max_length=80)
    size: Optional[str] = Field(default=None, max_length=80)
    stock_quantity: Optional[int] = Field(default=None, ge=0)
    stock_status: Optional[str] = None
    price_adjustment: Optional[Decimal] = None
    is_active: Optional[bool] = None


class VariantOut(BaseModel):
    variant_id: uuid.UUID
    product_id: uuid.UUID
    sku: str
    color: Optional[str]
    size: Optional[str]
    stock_quantity: int
    stock_status: str
    price_adjustment: Decimal
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}
