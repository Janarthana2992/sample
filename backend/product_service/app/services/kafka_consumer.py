"""Kafka consumer that processes product-events for async indexing.

Runs as a background asyncio task inside the product service.  Listens to the
``product-events`` topic and dispatches to Elasticsearch indexing and AI
embedding based on event type.
"""

import asyncio
import json
import logging
from typing import Optional

from aiokafka import AIOKafkaConsumer

from app.config import settings

logger = logging.getLogger(__name__)

TOPIC_PRODUCT_EVENTS = "product-events"
GROUP_ID = "product-indexer"

_consumer: Optional[AIOKafkaConsumer] = None
_task: Optional[asyncio.Task] = None


async def _handle_event(event: dict) -> None:
    """Route an event to the appropriate handler."""
    from app.services.search_service import es_service

    event_type = event.get("event")
    product_id = event.get("product_id")

    if event_type in ("product_created", "product_updated", "stock_updated"):
        doc = event.get("es_doc")
        if doc:
            ok = await es_service.index_product(doc)
            if ok:
                logger.info("ES indexed product %s via Kafka (%s)", product_id, event_type)
            else:
                logger.warning("ES index failed for %s via Kafka", product_id)

        # AI embedding for create/update
        if event_type in ("product_created", "product_updated"):
            await _embed_to_ai(event)

    elif event_type == "product_deleted":
        await es_service.delete_product(str(product_id))
        logger.info("ES deleted product %s via Kafka", product_id)

    else:
        logger.warning("Unknown event type: %s", event_type)


async def _embed_to_ai(event: dict) -> None:
    """Fire-and-forget AI embedding via internal endpoint."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.AI_SERVICE_URL}/internal/embed",
                headers={"X-Internal-Service-Token": settings.INTERNAL_SERVICE_TOKEN},
                json={
                    "product_id": str(event.get("product_id")),
                    "name": event.get("name", ""),
                    "description": event.get("description", ""),
                },
            )
            response.raise_for_status()
    except Exception as exc:
        logger.warning("AI embed via Kafka failed for %s: %s", event.get("product_id"), exc)


async def _consume_loop() -> None:
    """Main consumer loop — runs until cancelled."""
    global _consumer
    try:
        _consumer = AIOKafkaConsumer(
            TOPIC_PRODUCT_EVENTS,
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
            group_id=GROUP_ID,
            value_deserializer=lambda v: json.loads(v.decode("utf-8")),
            auto_offset_reset="earliest",
            enable_auto_commit=True,
            auto_commit_interval_ms=5000,
        )
        await _consumer.start()
        logger.info("Kafka consumer started, listening on %s", TOPIC_PRODUCT_EVENTS)

        async for msg in _consumer:
            try:
                await _handle_event(msg.value)
            except Exception as exc:
                logger.exception("Error handling Kafka event: %s", exc)

    except asyncio.CancelledError:
        logger.info("Kafka consumer task cancelled")
    except Exception as exc:
        logger.error("Kafka consumer crashed: %s", exc)
    finally:
        if _consumer:
            await _consumer.stop()
            _consumer = None
            logger.info("Kafka consumer stopped")


async def start_consumer() -> None:
    """Launch the consumer as a background task."""
    global _task
    _task = asyncio.create_task(_consume_loop())
    logger.info("Kafka consumer background task launched")


async def stop_consumer() -> None:
    """Cancel and await the consumer task."""
    global _task
    if _task and not _task.done():
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
    _task = None
