from datetime import datetime
from typing import Optional
import uuid
from pydantic import BaseModel, Field


class ReviewCreate(BaseModel):
    product_id: uuid.UUID
    order_id: uuid.UUID
    rating: int = Field(ge=1, le=5)
    review_text: Optional[str] = Field(default=None, max_length=2000)


class ReviewUpdate(BaseModel):
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    review_text: Optional[str] = Field(default=None, max_length=2000)


class ReviewReplyCreate(BaseModel):
    reply_text: str = Field(min_length=1, max_length=500)


class ReviewReplyOut(BaseModel):
    reply_id: uuid.UUID
    reply_text: str
    is_retracted: bool
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ReviewOut(BaseModel):
    review_id: uuid.UUID
    product_id: uuid.UUID
    user_id: uuid.UUID
    order_id: uuid.UUID
    rating: int
    review_text: Optional[str]
    is_flagged: bool
    created_at: datetime
    reply: Optional[ReviewReplyOut] = None

    model_config = {"from_attributes": True}


class PaginatedReviews(BaseModel):
    items: list[ReviewOut]
    total: int
    page: int
    size: int
