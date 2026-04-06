from datetime import datetime, timezone
from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models.user import User, StaffPermission
from app.schemas.user import (
    VALID_MODULES,
    StaffCreateRequest,
    StaffResponse,
    StaffUpdatePermissionsRequest,
)
from app.utils.rbac import get_current_user, require_roles
from app.utils.security import hash_password

router = APIRouter(prefix="/staff", tags=["staff-management"])

admin_only = require_roles("admin")


@router.post("", response_model=StaffResponse, status_code=status.HTTP_201_CREATED)
async def create_staff(
    payload: StaffCreateRequest,
    admin: User = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
):
    # Validate permissions
    invalid = set(payload.permissions) - set(VALID_MODULES)
    if invalid:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid modules: {invalid}")

    # Check email not taken
    result = await db.execute(select(User).where(User.email == payload.email.lower()))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    staff = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        phone=payload.phone,
        hashed_password=hash_password(payload.temp_password),
        role="staff",
    )
    db.add(staff)
    await db.flush()  # get staff.user_id before commit

    # Grant permissions
    for module in payload.permissions:
        db.add(StaffPermission(user_id=staff.user_id, module=module, granted_by=admin.user_id))

    await db.commit()
    # Reload with permissions
    result = await db.execute(
        select(User).where(User.user_id == staff.user_id).options(selectinload(User.permissions))
    )
    return result.scalar_one()


@router.get("", response_model=List[StaffResponse])
async def list_staff(
    _: User = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .where(User.role == "staff")
        .options(selectinload(User.permissions))
        .order_by(User.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{staff_id}", response_model=StaffResponse)
async def get_staff(
    staff_id: uuid.UUID,
    _: User = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .where(User.user_id == staff_id, User.role == "staff")
        .options(selectinload(User.permissions))
    )
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")
    return staff


@router.patch("/{staff_id}/permissions", response_model=StaffResponse)
async def update_staff_permissions(
    staff_id: uuid.UUID,
    payload: StaffUpdatePermissionsRequest,
    admin: User = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
):
    invalid = set(payload.permissions) - set(VALID_MODULES)
    if invalid:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid modules: {invalid}")

    result = await db.execute(select(User).where(User.user_id == staff_id, User.role == "staff"))
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")

    # Delete existing and re-add
    await db.execute(delete(StaffPermission).where(StaffPermission.user_id == staff_id))
    for module in set(payload.permissions):
        db.add(StaffPermission(user_id=staff_id, module=module, granted_by=admin.user_id))

    await db.commit()
    result = await db.execute(
        select(User).where(User.user_id == staff_id).options(selectinload(User.permissions))
    )
    return result.scalar_one()


@router.patch("/{staff_id}/suspend", response_model=StaffResponse)
async def toggle_staff_suspension(
    staff_id: uuid.UUID,
    _: User = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .where(User.user_id == staff_id, User.role == "staff")
        .options(selectinload(User.permissions))
    )
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")
    staff.is_active = not staff.is_active
    staff.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(staff)
    return staff
