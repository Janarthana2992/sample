"""
Lightweight keyword/regex-based intent router.
Routes chat messages to fast-path handlers or flags them for the LLM.
No LLM calls — pure keyword matching for speed.
"""

import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class RoutedIntent:
    intent: str           # e.g. "greeting", "order_status", "product_search", "llm"
    confidence: float     # 0.0-1.0
    extracted: dict       # any extracted entities (order_id, product query, etc.)
    fast_response: Optional[str] = None  # if set, skip LLM entirely


# Pre-compiled patterns
_ORDER_ID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)

_GREETING_PATTERNS = re.compile(
    r"^(hi|hello|hey|good\s*(morning|afternoon|evening)|howdy|yo|sup|namaste|hii+)\b",
    re.I,
)

_FAREWELL_PATTERNS = re.compile(
    r"^(bye|goodbye|thanks?\s*(you)?|thank\s*u|ok\s*bye|see\s*you|that'?s\s*all|nothing\s*else)\b",
    re.I,
)

_ORDER_KEYWORDS = re.compile(
    r"\b(order|tracking|shipment|dispatch|deliver|cancel|refund|return)\b", re.I
)

_CART_KEYWORDS = re.compile(
    r"\b(cart|basket|bag|add\s*to\s*cart|checkout)\b", re.I
)

_ADDRESS_KEYWORDS = re.compile(
    r"\b(address|addresses|delivery\s*address|saved\s*address|shipping\s*address)\b", re.I
)

_CANCEL_KEYWORDS = re.compile(
    r"\b(cancel|cancell?ation|want\s*to\s*cancel)\b", re.I
)

_REVIEW_KEYWORDS = re.compile(
    r"\b(review|rating|opinion|feedback|what\s*do\s*people\s*(think|say))\b", re.I
)

_HELP_KEYWORDS = re.compile(
    r"\b(help|support|contact|human|agent|speak\s*to|talk\s*to|connect\s*me)\b", re.I
)

_POLICY_KEYWORDS = re.compile(
    r"\b(return\s*policy|shipping\s*policy|refund\s*policy|payment\s*method|how\s*to\s*pay)\b", re.I
)

_RECOMMEND_KEYWORDS = re.compile(
    r"\b(recommend|suggest|best|top\s*rated|popular|trending|what\s*should\s*i\s*buy)\b", re.I
)


def route_intent(message: str) -> RoutedIntent:
    """Classify a chat message into an intent using keyword matching.

    Returns a RoutedIntent. If intent == "llm", the message needs full LLM processing.
    If fast_response is set, the caller can skip the LLM entirely.
    """
    text = message.strip()

    # 1. Greetings — fast response, no LLM needed
    if _GREETING_PATTERNS.match(text) and len(text.split()) <= 5:
        return RoutedIntent(
            intent="greeting",
            confidence=0.95,
            extracted={},
            fast_response="Hi there! 👋 I'm your ShopHere assistant. How can I help you today? You can ask me about products, orders, reviews, or recommendations!",
        )

    # 2. Farewells — fast response
    if _FAREWELL_PATTERNS.match(text) and len(text.split()) <= 6:
        return RoutedIntent(
            intent="farewell",
            confidence=0.90,
            extracted={},
            fast_response="You're welcome! Have a great day! 😊 Feel free to come back anytime.",
        )

    # 3. Human handoff request
    if _HELP_KEYWORDS.search(text) and any(
        w in text.lower() for w in ("human", "agent", "speak to", "talk to", "connect me", "real person")
    ):
        return RoutedIntent(
            intent="human_handoff",
            confidence=0.90,
            extracted={},
        )

    # 4. Order-related with order ID
    order_match = _ORDER_ID_RE.search(text)
    if order_match and _ORDER_KEYWORDS.search(text):
        return RoutedIntent(
            intent="order_status",
            confidence=0.85,
            extracted={"order_id": order_match.group()},
        )

    # 5. Cancel-specific intent
    if _CANCEL_KEYWORDS.search(text) and _ORDER_KEYWORDS.search(text):
        return RoutedIntent(
            intent="cancel_order",
            confidence=0.85,
            extracted={"order_id": order_match.group() if order_match else None},
        )

    # 6. Address listing
    if _ADDRESS_KEYWORDS.search(text):
        return RoutedIntent(
            intent="list_addresses",
            confidence=0.80,
            extracted={},
        )

    # 7. Cart-related
    if _CART_KEYWORDS.search(text):
        return RoutedIntent(
            intent="cart",
            confidence=0.75,
            extracted={},
        )

    # 8. Recommendation requests
    if _RECOMMEND_KEYWORDS.search(text):
        return RoutedIntent(
            intent="recommend",
            confidence=0.70,
            extracted={},
        )

    # 9. Policy questions — these can be answered by RAG without tool calls
    if _POLICY_KEYWORDS.search(text):
        return RoutedIntent(
            intent="policy_question",
            confidence=0.80,
            extracted={},
        )

    # Default: needs full LLM processing
    return RoutedIntent(
        intent="llm",
        confidence=0.0,
        extracted={},
    )
