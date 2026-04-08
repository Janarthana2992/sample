from typing import List, Optional
from pydantic import BaseModel, Field
import uuid


class EmbedRequest(BaseModel):
    product_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)


class RecommendationItem(BaseModel):
    product_id: uuid.UUID
    score: float
    name: Optional[str] = None
    mrp: Optional[float] = None
    selling_price: Optional[float] = None
    image_url: Optional[str] = None
    stock_status: Optional[str] = None


class RecommendationResponse(BaseModel):
    items: List[RecommendationItem]
