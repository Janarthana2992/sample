"""Razorpay payment service — order creation, signature verification, and webhook validation."""
import hmac
import hashlib
import logging

import razorpay

from app.config import settings

logger = logging.getLogger(__name__)


def _client() -> razorpay.Client:
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))


def create_razorpay_order(amount_paise: int, receipt: str) -> dict:
    """Create a Razorpay order and return the order dict (contains 'id')."""
    client = _client()
    order = client.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "receipt": receipt[:40],
        "payment_capture": True,
    })
    logger.info("Razorpay order created: %s for receipt %s", order["id"], receipt)
    return order


def verify_payment_signature(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> bool:
    """Verify that the payment signature from the frontend is authentic."""
    try:
        client = _client()
        client.utility.verify_payment_signature({
            "razorpay_order_id": razorpay_order_id,
            "razorpay_payment_id": razorpay_payment_id,
            "razorpay_signature": razorpay_signature,
        })
        return True
    except razorpay.errors.SignatureVerificationError:
        logger.warning("Razorpay signature verification failed for order %s", razorpay_order_id)
        return False
    except Exception as exc:
        logger.error("Unexpected error during signature verification: %s", exc)
        return False


def verify_webhook_signature(body: bytes, signature: str) -> bool:
    """Verify a Razorpay webhook payload using HMAC-SHA256."""
    if not settings.RAZORPAY_KEY_SECRET or not signature:
        return False
    try:
        expected = hmac.new(
            settings.RAZORPAY_KEY_SECRET.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)
    except Exception as exc:
        logger.error("Webhook signature verification error: %s", exc)
        return False
