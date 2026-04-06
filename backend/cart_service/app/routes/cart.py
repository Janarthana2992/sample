import uuid
from fastapi import APIRouter, Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings
from app.schemas.cart import CartItemIn, CartItemUpdate, CartResponse, CartItemSnapshot
from app.services import cart_service

router = APIRouter(prefix="/cart", tags=["cart"])
bearer_scheme = HTTPBearer()


def _get_user_id(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> str:
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "access":
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload["sub"]
    except JWTError:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Invalid token")


@router.post("/add", response_model=CartItemSnapshot, status_code=status.HTTP_200_OK)
async def add_to_cart(
    payload: CartItemIn,
    user_id: str = Depends(_get_user_id),
):
    return await cart_service.add_to_cart(user_id, str(payload.product_id), payload.quantity)


@router.get("", response_model=CartResponse)
async def get_cart(user_id: str = Depends(_get_user_id)):
    return await cart_service.get_cart(user_id)


@router.patch("/{product_id}", response_model=CartItemSnapshot)
async def update_item(
    product_id: uuid.UUID,
    payload: CartItemUpdate,
    user_id: str = Depends(_get_user_id),
):
    return await cart_service.update_cart_item(user_id, str(product_id), payload.quantity)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_item(product_id: uuid.UUID, user_id: str = Depends(_get_user_id)):
    await cart_service.remove_from_cart(user_id, str(product_id))


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def clear_cart(user_id: str = Depends(_get_user_id)):
    await cart_service.clear_cart(user_id)


# Internal endpoint — used by Order Service post-checkout
@router.delete("/internal/{user_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["internal"])
async def clear_cart_internal(user_id: str):
    await cart_service.clear_cart(user_id)


@router.get("/internal/{user_id}", tags=["internal"])
async def get_cart_raw(user_id: str):
    return await cart_service.get_cart_raw(user_id)
