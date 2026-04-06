from typing import List, Optional
from pydantic import BaseModel
import uuid


class EmbedRequest(BaseModel):
    product_id: uuid.UUID
    name: str
    description: str


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
