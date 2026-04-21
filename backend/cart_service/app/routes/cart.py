import secrets
import uuid
from fastapi import APIRouter, Depends, Header, HTTPException, status
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
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload["sub"]
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc


def _require_internal_service_token(
    x_internal_service_token: str | None = Header(default=None, alias="X-Internal-Service-Token"),
) -> None:
    if not x_internal_service_token or not secrets.compare_digest(
        x_internal_service_token,
        settings.INTERNAL_SERVICE_TOKEN,
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid internal service token")


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


# ── Save for Later ───────────────────────────────────────────

@router.post("/save-for-later/{product_id}", status_code=status.HTTP_200_OK)
async def save_for_later(product_id: uuid.UUID, user_id: str = Depends(_get_user_id)):
    return await cart_service.save_for_later(user_id, str(product_id))


@router.post("/move-to-cart/{product_id}", response_model=CartItemSnapshot, status_code=status.HTTP_200_OK)
async def move_to_cart(product_id: uuid.UUID, user_id: str = Depends(_get_user_id)):
    return await cart_service.move_to_cart(user_id, str(product_id))


@router.get("/saved", status_code=status.HTTP_200_OK)
async def get_saved_items(user_id: str = Depends(_get_user_id)):
    return await cart_service.get_saved_items(user_id)


@router.delete("/saved/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_saved_item(product_id: uuid.UUID, user_id: str = Depends(_get_user_id)):
    await cart_service.remove_saved_item(user_id, str(product_id))


# Internal endpoint — used by Order Service post-checkout
@router.delete("/internal/{user_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["internal"])
async def clear_cart_internal(
    user_id: uuid.UUID,
    _=Depends(_require_internal_service_token),
):
    await cart_service.clear_cart(str(user_id))


@router.get("/internal/{user_id}", tags=["internal"])
async def get_cart_raw(
    user_id: uuid.UUID,
    _=Depends(_require_internal_service_token),
):
    return await cart_service.get_cart_raw(str(user_id))


@router.delete("/internal/{user_id}/{product_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["internal"])
async def remove_item_internal(
    user_id: uuid.UUID,
    product_id: uuid.UUID,
    _=Depends(_require_internal_service_token),
):
    try:
        await cart_service.remove_from_cart(str(user_id), str(product_id))
    except Exception:
        pass  # best-effort removal
