import logging

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from typing import Optional, List, Any
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.services.chat_service import chat, clear_session

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    session_id: str
    products: Optional[List[Any]] = None
    actions: Optional[List[Any]] = None


@router.post("", response_model=ChatResponse)
@limiter.limit("20/minute")
async def chat_endpoint(
    request: Request,
    payload: ChatRequest,
    authorization: Optional[str] = Header(default=None),
):
    auth_token = None
    if authorization and authorization.startswith("Bearer "):
        auth_token = authorization[7:]

    try:
        result = await chat(
            message=payload.message,
            session_id=payload.session_id,
            auth_token=auth_token,
        )
        return ChatResponse(**result)
    except Exception as e:
        logger.error("Chat error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process chat message",
        )


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    await clear_session(session_id)
    return {"cleared": True}

