from datetime import datetime
from typing import List, Optional
import uuid
from pydantic import BaseModel, EmailStr, Field


VALID_MODULES = [
    "reply_reviews",
    "stock_management",
    "deal_management",
    "order_management",
    "product_listing_view",
]


class PermissionOut(BaseModel):
    permission_id: uuid.UUID
    module: str
    granted_at: datetime

    model_config = {"from_attributes": True}


class StaffCreateRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=20)
    temp_password: str = Field(min_length=8, max_length=128)
    permissions: List[str] = Field(default_factory=list)

    @property
    def validated_permissions(self) -> List[str]:
        invalid = set(self.permissions) - set(VALID_MODULES)
        if invalid:
            raise ValueError(f"Invalid permission modules: {invalid}")
        return self.permissions


class StaffUpdatePermissionsRequest(BaseModel):
    permissions: List[str]


class StaffResponse(BaseModel):
    user_id: uuid.UUID
    email: str
    full_name: str
    phone: Optional[str]
    is_active: bool
    created_at: datetime
    permissions: List[PermissionOut] = []

    model_config = {"from_attributes": True}
