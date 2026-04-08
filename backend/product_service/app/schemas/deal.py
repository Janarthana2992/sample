from datetime import datetime
from decimal import Decimal
from typing import List, Optional
import uuid
from pydantic import BaseModel, Field, field_validator


VALID_DEAL_TYPES = {"percentage", "flat", "bogo", "free_shipping"}
VALID_APPLIES_TO = {"all_products", "specific_category", "specific_skus"}


class DealCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    deal_type: str = Field(pattern=r"^(percentage|flat|bogo|free_shipping)$")
    applies_to: str = Field(pattern=r"^(all_products|specific_category|specific_skus)$")
    discount_value: Optional[Decimal] = Field(default=None, ge=0)
    min_cart_value: Optional[Decimal] = Field(default=None, ge=0)
    start_datetime: datetime
    end_datetime: datetime
    max_uses: Optional[int] = Field(default=None, ge=1)
    is_active: bool = True
    staff_visible: bool = False
    category_ids: Optional[List[uuid.UUID]] = None
    product_ids: Optional[List[uuid.UUID]] = None

    @field_validator("discount_value", "min_cart_value", "max_uses", mode="before")
    @classmethod
    def empty_string_to_none(cls, value):
        if value == "":
            return None
        return value


class DealUpdate(BaseModel):
    name: Optional[str] = None
    discount_value: Optional[Decimal] = None
    min_cart_value: Optional[Decimal] = None
    start_datetime: Optional[datetime] = None
    end_datetime: Optional[datetime] = None
    max_uses: Optional[int] = None
    is_active: Optional[bool] = None
    staff_visible: Optional[bool] = None
    category_ids: Optional[List[uuid.UUID]] = None
    product_ids: Optional[List[uuid.UUID]] = None

    @field_validator("discount_value", "min_cart_value", "max_uses", mode="before")
    @classmethod
    def empty_string_to_none(cls, value):
        if value == "":
            return None
        return value


class DealOut(BaseModel):
    deal_id: uuid.UUID
    name: str
    deal_type: str
    applies_to: str
    discount_value: Optional[Decimal]
    min_cart_value: Optional[Decimal]
    start_datetime: datetime
    end_datetime: datetime
    max_uses: Optional[int]
    current_uses: int
    is_active: bool
    staff_visible: bool
    created_at: datetime
    category_ids: List[uuid.UUID] = []
    product_ids: List[uuid.UUID] = []

    @classmethod
    def from_orm_with_relations(cls, deal: object) -> "DealOut":
        from app.models.product import Deal as DealModel
        d = deal
        return cls(
            deal_id=d.deal_id,
            name=d.name,
            deal_type=d.deal_type,
            applies_to=d.applies_to,
            discount_value=d.discount_value,
            min_cart_value=d.min_cart_value,
            start_datetime=d.start_datetime,
            end_datetime=d.end_datetime,
            max_uses=d.max_uses,
            current_uses=d.current_uses,
            is_active=d.is_active,
            staff_visible=d.staff_visible,
            created_at=d.created_at,
            category_ids=[dc.category_id for dc in (d.deal_categories or [])],
            product_ids=[ds.product_id for ds in (d.deal_skus or [])],
        )

    model_config = {"from_attributes": True}
