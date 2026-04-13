"""
Human handoff service — manages a queue of customers waiting for a human agent
and facilitates real-time chat between agents and customers via Redis pub/sub.

Queue keys in Redis:
  handoff:queue           — sorted set of waiting tickets (score = timestamp)
  handoff:ticket:{id}     — hash with ticket metadata
  handoff:chat:{id}       — list of chat messages for a ticket
  handoff:agent:{user_id} — set of ticket IDs assigned to this agent
"""

import json
import logging
import time
import uuid
from dataclasses import dataclass, asdict
from typing import Optional

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)

QUEUE_KEY = "handoff:queue"
TICKET_PREFIX = "handoff:ticket:"
CHAT_PREFIX = "handoff:chat:"
AGENT_PREFIX = "handoff:agent:"
CHANNEL_PREFIX = "handoff:channel:"
TICKET_TTL = 86400  # 24 hours


@dataclass
class HandoffTicket:
    ticket_id: str
    user_id: str
    user_name: str
    session_id: str  # chat session that triggered handoff
    reason: str
    status: str  # "waiting", "assigned", "resolved", "expired"
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    created_at: float = 0.0
    assigned_at: Optional[float] = None
    resolved_at: Optional[float] = None


@dataclass
class ChatMessage:
    sender: str  # "customer" or "agent"
    sender_name: str
    content: str
    timestamp: float


class HandoffService:
    """Manages human handoff queue and real-time agent-customer chat."""

    def __init__(self):
        self._redis: Optional[aioredis.Redis] = None

    async def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        return self._redis

    async def create_ticket(
        self,
        user_id: str,
        user_name: str,
        session_id: str,
        reason: str = "Customer requested human agent",
    ) -> HandoffTicket:
        """Create a handoff ticket and add to the waiting queue."""
        r = await self._get_redis()
        ticket_id = str(uuid.uuid4())
        now = time.time()

        ticket = HandoffTicket(
            ticket_id=ticket_id,
            user_id=user_id,
            user_name=user_name,
            session_id=session_id,
            reason=reason,
            status="waiting",
            created_at=now,
        )

        # Store ticket data
        await r.hset(f"{TICKET_PREFIX}{ticket_id}", mapping={
            "ticket_id": ticket_id,
            "user_id": user_id,
            "user_name": user_name,
            "session_id": session_id,
            "reason": reason,
            "status": "waiting",
            "created_at": str(now),
        })
        await r.expire(f"{TICKET_PREFIX}{ticket_id}", TICKET_TTL)

        # Add to queue (sorted by creation time)
        await r.zadd(QUEUE_KEY, {ticket_id: now})

        # Notify agents channel
        await r.publish("handoff:new_ticket", json.dumps({
            "ticket_id": ticket_id,
            "user_name": user_name,
            "reason": reason,
            "created_at": now,
        }))

        logger.info("Handoff ticket created: %s for user %s", ticket_id, user_id)
        return ticket

    async def get_queue(self) -> list[dict]:
        """Get all waiting tickets in the queue (oldest first)."""
        r = await self._get_redis()
        ticket_ids = await r.zrange(QUEUE_KEY, 0, -1)

        tickets = []
        for tid in ticket_ids:
            data = await r.hgetall(f"{TICKET_PREFIX}{tid}")
            if data and data.get("status") == "waiting":
                tickets.append(data)
        return tickets

    async def get_ticket(self, ticket_id: str) -> Optional[dict]:
        """Get a specific ticket's data."""
        r = await self._get_redis()
        data = await r.hgetall(f"{TICKET_PREFIX}{ticket_id}")
        return data if data else None

    async def assign_ticket(
        self, ticket_id: str, agent_id: str, agent_name: str
    ) -> bool:
        """Assign a waiting ticket to an agent."""
        r = await self._get_redis()
        data = await r.hgetall(f"{TICKET_PREFIX}{ticket_id}")

        if not data or data.get("status") != "waiting":
            return False

        now = time.time()
        await r.hset(f"{TICKET_PREFIX}{ticket_id}", mapping={
            "status": "assigned",
            "agent_id": agent_id,
            "agent_name": agent_name,
            "assigned_at": str(now),
        })

        # Remove from waiting queue
        await r.zrem(QUEUE_KEY, ticket_id)

        # Track agent's active tickets
        await r.sadd(f"{AGENT_PREFIX}{agent_id}", ticket_id)

        # Notify customer via pub/sub
        await r.publish(f"{CHANNEL_PREFIX}{ticket_id}", json.dumps({
            "type": "agent_joined",
            "agent_name": agent_name,
            "timestamp": now,
        }))

        logger.info("Ticket %s assigned to agent %s", ticket_id, agent_id)
        return True

    async def resolve_ticket(self, ticket_id: str, agent_id: str) -> bool:
        """Mark a ticket as resolved."""
        r = await self._get_redis()
        data = await r.hgetall(f"{TICKET_PREFIX}{ticket_id}")

        if not data or data.get("status") != "assigned":
            return False

        now = time.time()
        await r.hset(f"{TICKET_PREFIX}{ticket_id}", mapping={
            "status": "resolved",
            "resolved_at": str(now),
        })

        # Remove from agent's active tickets
        await r.srem(f"{AGENT_PREFIX}{agent_id}", ticket_id)

        # Notify customer
        await r.publish(f"{CHANNEL_PREFIX}{ticket_id}", json.dumps({
            "type": "resolved",
            "timestamp": now,
        }))

        logger.info("Ticket %s resolved by %s", ticket_id, agent_id)
        return True

    async def send_message(
        self,
        ticket_id: str,
        sender: str,
        sender_name: str,
        content: str,
    ) -> ChatMessage:
        """Send a message in a handoff chat and notify via pub/sub."""
        r = await self._get_redis()
        now = time.time()

        msg = ChatMessage(
            sender=sender,
            sender_name=sender_name,
            content=content,
            timestamp=now,
        )

        # Store message
        await r.rpush(f"{CHAT_PREFIX}{ticket_id}", json.dumps(asdict(msg)))
        await r.expire(f"{CHAT_PREFIX}{ticket_id}", TICKET_TTL)

        # Publish to channel for real-time delivery
        await r.publish(f"{CHANNEL_PREFIX}{ticket_id}", json.dumps({
            "type": "message",
            **asdict(msg),
        }))

        return msg

    async def get_messages(self, ticket_id: str) -> list[dict]:
        """Get all messages for a ticket."""
        r = await self._get_redis()
        raw_msgs = await r.lrange(f"{CHAT_PREFIX}{ticket_id}", 0, -1)
        return [json.loads(m) for m in raw_msgs]

    async def get_agent_tickets(self, agent_id: str) -> list[dict]:
        """Get all active tickets assigned to an agent."""
        r = await self._get_redis()
        ticket_ids = await r.smembers(f"{AGENT_PREFIX}{agent_id}")

        tickets = []
        for tid in ticket_ids:
            data = await r.hgetall(f"{TICKET_PREFIX}{tid}")
            if data:
                tickets.append(data)
        return tickets


# Singleton
handoff_service = HandoffService()
