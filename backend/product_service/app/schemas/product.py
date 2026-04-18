from datetime import datetime
from decimal import Decimal
from typing import List, Optional
import uuid

from pydantic import BaseModel, Field, field_validator, model_validator


# ── Category ────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    slug: str = Field(min_length=2, max_length=120)
    parent_id: Optional[uuid.UUID] = None


class CategoryOut(BaseModel):
    category_id: uuid.UUID
    name: str
    slug: str
    parent_id: Optional[uuid.UUID]
    is_active: bool

    model_config = {"from_attributes": True}


# ── Product ─────────────────────────────────────────────────

class ProductImageOut(BaseModel):
    image_id: uuid.UUID
    url: str
    sort_order: int

    model_config = {"from_attributes": True}


class ProductCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_\-]+$")
    name: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=20, max_length=5000)
    mrp: Decimal = Field(gt=0)
    selling_price: Decimal = Field(gt=0)
    stock_quantity: int = Field(ge=0)
    stock_status: Optional[str] = Field(default=None, pattern=r"^(in_stock|low_stock|out_of_stock)$")
    tags: List[str] = Field(default_factory=list)
    category_ids: List[uuid.UUID] = Field(min_length=1)
    weight_kg: Optional[Decimal] = None
    length_cm: Optional[Decimal] = None
    width_cm: Optional[Decimal] = None
    height_cm: Optional[Decimal] = None
    is_active: bool = True
    is_featured: bool = False
    is_promoted: bool = False
    promotion_priority: int = Field(default=0, ge=0)
    promotion_badge: Optional[str] = Field(default=None, max_length=60)

    @field_validator("selling_price")
    @classmethod
    def price_lte_mrp(cls, v, values):
        if "mrp" in values.data and v > values.data["mrp"]:
            raise ValueError("selling_price must be ≤ MRP")
        return v

    @field_validator("promotion_badge", mode="before")
    @classmethod
    def clean_promotion_badge_create(cls, value):
        if value is None:
            return None
        value = str(value).strip()
        return value or None


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=3, max_length=200)
    description: Optional[str] = Field(default=None, min_length=20, max_length=5000)
    mrp: Optional[Decimal] = Field(default=None, gt=0)
    selling_price: Optional[Decimal] = Field(default=None, gt=0)
    stock_quantity: Optional[int] = Field(default=None, ge=0)
    stock_status: Optional[str] = Field(default=None, pattern=r"^(in_stock|low_stock|out_of_stock)$")
    tags: Optional[List[str]] = None
    category_ids: Optional[List[uuid.UUID]] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None
    is_promoted: Optional[bool] = None
    promotion_priority: Optional[int] = Field(default=None, ge=0)
    promotion_badge: Optional[str] = Field(default=None, max_length=60)

    @field_validator("promotion_badge", mode="before")
    @classmethod
    def clean_promotion_badge_update(cls, value):
        if value is None:
            return None
        value = str(value).strip()
        return value or None


class StockUpdate(BaseModel):
    stock_quantity: Optional[int] = Field(default=None, ge=0)
    stock_status: Optional[str] = Field(default=None, pattern=r"^(in_stock|low_stock|out_of_stock)$")


class ProductOut(BaseModel):
    product_id: uuid.UUID
    sku: str
    name: str
    description: str
    mrp: Decimal
    selling_price: Decimal
    stock_quantity: int
    stock_status: str
    tags: Optional[List[str]]
    is_active: bool
    is_featured: bool
    is_promoted: bool
    promotion_priority: int
    promotion_badge: Optional[str]
    sales_count: int
    avg_rating: Optional[Decimal] = None
    review_count: int = 0
    images: List[ProductImageOut] = []
    category_ids: List[uuid.UUID] = []
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode='after')
    def sync_stock_status(self) -> 'ProductOut':
        """Auto-correct stock_status from stock_quantity to prevent stale/inconsistent data."""
        if self.stock_quantity <= 0:
            self.stock_status = 'out_of_stock'
        elif self.stock_quantity <= 10 and self.stock_status == 'out_of_stock':
            # qty > 0 but status says out_of_stock — correct it
            self.stock_status = 'low_stock'
        elif self.stock_quantity > 10 and self.stock_status == 'out_of_stock':
            self.stock_status = 'in_stock'
        return self

    @classmethod
    def model_validate(cls, obj, **kwargs):
        instance = super().model_validate(obj, **kwargs)
        if hasattr(obj, 'product_categories') and obj.product_categories:
            instance.category_ids = [pc.category_id for pc in obj.product_categories]
        return instance


class ProductListOut(BaseModel):
    product_id: uuid.UUID
    sku: str
    name: str
    mrp: Decimal
    selling_price: Decimal
    stock_status: str
    is_active: bool
    is_featured: bool
    is_promoted: bool
    promotion_priority: int
    promotion_badge: Optional[str]
    images: List[ProductImageOut] = []

    model_config = {"from_attributes": True}


class PaginatedProducts(BaseModel):
    items: List[ProductOut]
    total: int
    page: int
    size: int


# ── Search / Filter ─────────────────────────────────────────

class SearchResult(BaseModel):
    product_id: uuid.UUID
    name: str
    sku: str
    mrp: Decimal
    selling_price: Decimal
    stock_status: str
    rating: Optional[float]
    image_url: Optional[str]
    score: float


class FilterRequest(BaseModel):
    q: str = ""
    categories: Optional[List[str]] = None
    min_price: Optional[Decimal] = Field(default=None, ge=0)
    max_price: Optional[Decimal] = Field(default=None, ge=0)
    min_rating: Optional[float] = Field(default=None, ge=1, le=5)
    brands: Optional[List[str]] = None
    in_stock_only: bool = False
    deals_only: bool = False
    page: int = Field(default=1, ge=1)
    size: int = Field(default=20, ge=1, le=100)
