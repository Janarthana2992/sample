"""Distributed locking via Redis for product-level concurrency control.

Uses Redis SET NX EX for atomic lock acquisition with automatic expiry.
Provides both a context-manager API and a FastAPI dependency.
"""

import uuid
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import redis.asyncio as aioredis
from fastapi import HTTPException, status

from app.config import settings

logger = logging.getLogger(__name__)

# Module-level Redis connection pool (initialised lazily via startup)
_redis: aioredis.Redis | None = None

# Defaults
DEFAULT_LOCK_TTL = 10  # seconds – auto-release if holder crashes
DEFAULT_ACQUIRE_TIMEOUT = 5  # seconds – max time waiting to acquire
RETRY_INTERVAL = 0.05  # seconds between acquire retries


async def init_redis() -> None:
    """Create the shared Redis connection pool.  Call once at app startup."""
    global _redis
    _redis = aioredis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        max_connections=20,
    )
    # Verify connectivity
    await _redis.ping()
    logger.info("Product-service Redis lock pool ready")


async def close_redis() -> None:
    """Shutdown Redis pool.  Call at app shutdown."""
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None
        logger.info("Product-service Redis lock pool closed")


def _get_redis() -> aioredis.Redis:
    if _redis is None:
        raise RuntimeError("Redis not initialised – call init_redis() first")
    return _redis


@asynccontextmanager
async def distributed_lock(
    resource: str,
    ttl: int = DEFAULT_LOCK_TTL,
    acquire_timeout: float = DEFAULT_ACQUIRE_TIMEOUT,
) -> AsyncIterator[None]:
    """Acquire a distributed lock on *resource*, yield, then release.

    Parameters
    ----------
    resource:
        Logical name, e.g. ``product:{product_id}``.
    ttl:
        Lock auto-expiry in seconds (safety net).
    acquire_timeout:
        Maximum seconds to wait for lock acquisition before raising 409.

    Raises
    ------
    HTTPException 409
        If the lock cannot be acquired within *acquire_timeout*.
    """
    r = _get_redis()
    lock_key = f"lock:{resource}"
    lock_value = str(uuid.uuid4())

    # ── Acquire ──────────────────────────────────────────────
    deadline = asyncio.get_event_loop().time() + acquire_timeout
    acquired = False
    while asyncio.get_event_loop().time() < deadline:
        acquired = await r.set(lock_key, lock_value, nx=True, ex=ttl)
        if acquired:
            break
        await asyncio.sleep(RETRY_INTERVAL)

    if not acquired:
        logger.warning("Lock acquire timeout on %s", lock_key)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Resource is currently being modified by another request. Please retry.",
        )

    try:
        yield
    finally:
        # ── Release (only if we still own it) ────────────────
        # Lua script ensures atomic check-and-delete
        release_script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
        """
        try:
            await r.eval(release_script, 1, lock_key, lock_value)
        except Exception:
            logger.exception("Failed to release lock %s", lock_key)
