"""RBAC helpers shared across services — copied from auth_service pattern."""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from app.config import settings

bearer_scheme = HTTPBearer()

VALID_MODULES = {
    "reply_reviews", "stock_management", "deal_management",
    "order_management", "product_listing_view",
}


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


class _TokenUser:
    def __init__(self, user_id: str, role: str, permissions: list):
        self.user_id = user_id
        self.role = role
        self.permissions = permissions  # list of module strings from token claims


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> _TokenUser:
    payload = _decode(credentials.credentials)
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    return _TokenUser(
        user_id=payload["sub"],
        role=payload.get("role", "customer"),
        permissions=payload.get("permissions", []),
    )


def require_roles(*roles: str):
    async def _check(user: _TokenUser = Depends(get_current_user)) -> _TokenUser:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return user
    return _check


def require_permission(module: str):
    async def _check(user: _TokenUser = Depends(get_current_user)) -> _TokenUser:
        if user.role == "admin":
            return user
        if user.role != "staff":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        # In a real system, validate against auth service or include perms in JWT
        if module not in user.permissions:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing permission: {module}")
        return user
    return _check
