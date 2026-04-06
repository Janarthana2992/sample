from typing import List, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.user import User, StaffPermission
from app.utils.security import decode_token

bearer_scheme = HTTPBearer()


async def _get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_token(credentials.credentials)
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


async def get_current_user(user: User = Depends(_get_current_user)) -> User:
    return user


def require_roles(*roles: str):
    async def _check(user: User = Depends(_get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role(s): {', '.join(roles)}",
            )
        return user
    return _check


def require_permission(module: str):
    """For staff routes — user must be admin OR staff with the given module permission."""
    async def _check(
        user: User = Depends(_get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        if user.role == "admin":
            return user
        if user.role != "staff":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        result = await db.execute(
            select(StaffPermission).where(
                StaffPermission.user_id == user.user_id,
                StaffPermission.module == module,
            )
        )
        perm = result.scalar_one_or_none()
        if not perm:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {module}",
            )
        return user
    return _check
