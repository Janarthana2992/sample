"""
Human handoff routes — REST endpoints for queue management and
WebSocket endpoint for real-time agent-customer chat.
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field

from app.config import settings
from app.services.handoff_service import handoff_service

router = APIRouter(tags=["handoff"])
bearer_scheme = HTTPBearer()
logger = logging.getLogger(__name__)


# ── Auth helpers ────────────────────────────────────────────

def _decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    return payload


def _require_auth(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    return _decode_token(credentials.credentials)


def _require_staff_or_admin(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    payload = _decode_token(credentials.credentials)
    if payload.get("role") not in ("admin", "staff"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff or admin access required")
    return payload


# ── Request/Response schemas ────────────────────────────────

class CreateTicketRequest(BaseModel):
    session_id: str
    reason: str = Field(default="Customer requested human agent", max_length=500)


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class AssignTicketRequest(BaseModel):
    ticket_id: str


class ResolveTicketRequest(BaseModel):
    ticket_id: str


# ── Customer endpoints ──────────────────────────────────────

@router.post("/handoff/request")
async def request_handoff(
    payload: CreateTicketRequest,
    auth: dict = Depends(_require_auth),
):
    """Customer requests a human agent."""
    user_id = auth.get("user_id", auth.get("sub", ""))
    user_name = auth.get("first_name", "Customer")

    ticket = await handoff_service.create_ticket(
        user_id=user_id,
        user_name=user_name,
        session_id=payload.session_id,
        reason=payload.reason,
    )
    return {
        "ticket_id": ticket.ticket_id,
        "status": ticket.status,
        "message": "You've been added to the queue. An agent will be with you shortly.",
    }


@router.get("/handoff/ticket/{ticket_id}")
async def get_ticket_status(
    ticket_id: str,
    auth: dict = Depends(_require_auth),
):
    """Get ticket status and messages."""
    ticket = await handoff_service.get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    messages = await handoff_service.get_messages(ticket_id)
    return {**ticket, "messages": messages}


@router.post("/handoff/ticket/{ticket_id}/message")
async def customer_send_message(
    ticket_id: str,
    payload: SendMessageRequest,
    auth: dict = Depends(_require_auth),
):
    """Customer sends a message in the handoff chat."""
    ticket = await handoff_service.get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.get("status") not in ("waiting", "assigned"):
        raise HTTPException(status_code=400, detail="This conversation has ended")

    user_name = auth.get("first_name", "Customer")
    msg = await handoff_service.send_message(
        ticket_id=ticket_id,
        sender="customer",
        sender_name=user_name,
        content=payload.content,
    )
    return {"status": "sent", "timestamp": msg.timestamp}


# ── Agent/Admin endpoints ───────────────────────────────────

@router.get("/handoff/queue")
async def get_handoff_queue(auth: dict = Depends(_require_staff_or_admin)):
    """Get all waiting handoff tickets."""
    tickets = await handoff_service.get_queue()
    return {"tickets": tickets, "total": len(tickets)}


@router.post("/handoff/assign")
async def assign_ticket(
    payload: AssignTicketRequest,
    auth: dict = Depends(_require_staff_or_admin),
):
    """Agent accepts and picks up a ticket from the queue."""
    agent_id = auth.get("user_id", auth.get("sub", ""))
    agent_name = auth.get("first_name", "Agent")

    success = await handoff_service.assign_ticket(
        ticket_id=payload.ticket_id,
        agent_id=agent_id,
        agent_name=agent_name,
    )
    if not success:
        raise HTTPException(status_code=400, detail="Ticket not available for assignment")
    return {"status": "assigned", "ticket_id": payload.ticket_id}


@router.post("/handoff/resolve")
async def resolve_ticket(
    payload: ResolveTicketRequest,
    auth: dict = Depends(_require_staff_or_admin),
):
    """Agent resolves/closes a ticket."""
    agent_id = auth.get("user_id", auth.get("sub", ""))

    success = await handoff_service.resolve_ticket(
        ticket_id=payload.ticket_id,
        agent_id=agent_id,
    )
    if not success:
        raise HTTPException(status_code=400, detail="Cannot resolve this ticket")
    return {"status": "resolved", "ticket_id": payload.ticket_id}


@router.post("/handoff/ticket/{ticket_id}/agent-message")
async def agent_send_message(
    ticket_id: str,
    payload: SendMessageRequest,
    auth: dict = Depends(_require_staff_or_admin),
):
    """Agent sends a message in the handoff chat."""
    ticket = await handoff_service.get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.get("status") != "assigned":
        raise HTTPException(status_code=400, detail="Ticket is not in assigned state")

    agent_name = auth.get("first_name", "Agent")
    msg = await handoff_service.send_message(
        ticket_id=ticket_id,
        sender="agent",
        sender_name=agent_name,
        content=payload.content,
    )
    return {"status": "sent", "timestamp": msg.timestamp}


@router.get("/handoff/my-tickets")
async def get_my_tickets(auth: dict = Depends(_require_staff_or_admin)):
    """Get agent's currently assigned tickets."""
    agent_id = auth.get("user_id", auth.get("sub", ""))
    tickets = await handoff_service.get_agent_tickets(agent_id)
    return {"tickets": tickets, "total": len(tickets)}


# ── WebSocket for real-time chat ────────────────────────────

@router.websocket("/ws/handoff/{ticket_id}")
async def handoff_websocket(websocket: WebSocket, ticket_id: str):
    """WebSocket endpoint for real-time handoff chat.

    Auth via query param: ?token=<jwt>
    Messages: JSON with {type: "message", content: "..."}
    """
    # Authenticate via query parameter
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    user_id = payload.get("user_id", payload.get("sub", ""))
    user_name = payload.get("first_name", "User")
    role = payload.get("role", "customer")
    sender_type = "agent" if role in ("admin", "staff") else "customer"

    # Verify ticket exists
    ticket = await handoff_service.get_ticket(ticket_id)
    if not ticket:
        await websocket.close(code=4004, reason="Ticket not found")
        return

    await websocket.accept()

    # Send existing messages
    messages = await handoff_service.get_messages(ticket_id)
    await websocket.send_json({"type": "history", "messages": messages})

    # Subscribe to ticket's Redis channel for real-time updates
    import redis.asyncio as aioredis
    pubsub_redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = pubsub_redis.pubsub()
    await pubsub.subscribe(f"handoff:channel:{ticket_id}")

    import asyncio

    async def listen_redis():
        """Forward Redis pub/sub messages to the WebSocket."""
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    data = json.loads(message["data"])
                    await websocket.send_json(data)
        except (WebSocketDisconnect, Exception):
            pass

    redis_task = asyncio.create_task(listen_redis())

    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "message":
                content = data.get("content", "").strip()
                if content:
                    await handoff_service.send_message(
                        ticket_id=ticket_id,
                        sender=sender_type,
                        sender_name=user_name,
                        content=content,
                    )
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for ticket %s", ticket_id)
    except Exception as e:
        logger.error("WebSocket error for ticket %s: %s", ticket_id, e)
    finally:
        redis_task.cancel()
        await pubsub.unsubscribe(f"handoff:channel:{ticket_id}")
        await pubsub_redis.aclose()
