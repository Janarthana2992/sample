"""Kafka producer for product events.

Publishes product lifecycle events (created, updated, deleted, stock_updated)
to the ``product-events`` topic. A consumer (kafka_consumer.py) picks these up
for async Elasticsearch indexing and AI embedding.
"""

import json
import logging
from typing import Any, Dict, Optional

from aiokafka import AIOKafkaProducer

from app.config import settings

logger = logging.getLogger(__name__)

TOPIC_PRODUCT_EVENTS = "product-events"

_producer: Optional[AIOKafkaProducer] = None


async def init_kafka_producer() -> None:
    """Start the shared Kafka producer.  Call once at app startup."""
    global _producer
    try:
        _producer = AIOKafkaProducer(
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
            acks="all",
            retry_backoff_ms=200,
            request_timeout_ms=10000,
        )
        await _producer.start()
        logger.info("Kafka producer connected to %s", settings.KAFKA_BOOTSTRAP_SERVERS)
    except Exception as exc:
        logger.warning("Kafka producer failed to start (indexing will fall back to direct): %s", exc)
        _producer = None


async def close_kafka_producer() -> None:
    """Flush and stop the producer.  Call at app shutdown."""
    global _producer
    if _producer:
        await _producer.stop()
        _producer = None
        logger.info("Kafka producer stopped")


async def publish_product_event(event_type: str, payload: Dict[str, Any]) -> bool:
    """Publish a product event to Kafka.

    Parameters
    ----------
    event_type:
        One of ``product_created``, ``product_updated``, ``product_deleted``,
        ``stock_updated``.
    payload:
        Dict containing at minimum ``product_id`` and any data the consumer
        needs to perform the side-effect (ES doc fields, etc.).

    Returns True if published, False if Kafka is unavailable (caller should
    fall back to direct indexing).
    """
    if _producer is None:
        return False

    message = {"event": event_type, **payload}
    product_id = payload.get("product_id", "unknown")

    try:
        await _producer.send_and_wait(
            TOPIC_PRODUCT_EVENTS,
            value=message,
            key=str(product_id),
        )
        logger.info("Published %s for product %s", event_type, product_id)
        return True
    except Exception as exc:
        logger.error("Failed to publish %s for %s: %s", event_type, product_id, exc)
        return False
