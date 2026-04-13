import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/search", tags=["smart-search"])


class IntentRequest(BaseModel):
    query: str


class IntentFilters(BaseModel):
    category: Optional[str] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    color: Optional[str] = None
    brand: Optional[str] = None


class IntentResponse(BaseModel):
    search_terms: str
    filters: IntentFilters
    intent: str
    rewritten_query: str
    original_query: str


CATEGORIES = [
    "Audio", "Beauty & Personal Care", "Books & Stationery", "Electronics",
    "Fashion", "Gaming", "Home & Kitchen", "Laptops", "Medicine",
    "Men's Clothing", "Smartphones", "Sports & Fitness", "Toys", "Women's Clothing",
]

PARSE_PROMPT = """You are a search query parser for an Indian e-commerce store.
Given a user's search query, extract structured information.

Available categories: {categories}

Return ONLY a JSON object with these fields:
- "search_terms": the core product keywords to search for
- "intent": one of "product_search", "category_browse", "price_filter", "comparison"
- "rewritten_query": a cleaner version of the query optimised for search
- "filters": an object with optional fields:
  - "category": matching category name from the list (or null)
  - "min_price": number or null
  - "max_price": number or null
  - "color": string or null
  - "brand": string or null

User query: "{query}"
"""


@router.post("/parse-intent", response_model=IntentResponse)
async def parse_search_intent(payload: IntentRequest):
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Query is required")

    # Try AI-powered parsing if Gemini or Groq key is available
    parsed = await _parse_with_ai(query)
    if parsed:
        return IntentResponse(
            search_terms=parsed.get("search_terms", query),
            filters=IntentFilters(**parsed.get("filters", {})),
            intent=parsed.get("intent", "product_search"),
            rewritten_query=parsed.get("rewritten_query", query),
            original_query=query,
        )

    # Fallback: return query as-is
    return IntentResponse(
        search_terms=query,
        filters=IntentFilters(),
        intent="product_search",
        rewritten_query=query,
        original_query=query,
    )


async def _parse_with_ai(query: str) -> Optional[dict]:
    """Try local LLM, fall back to Gemini, then return None."""
    prompt = PARSE_PROMPT.format(categories=", ".join(CATEGORIES), query=query)

    # Try local LLM
    try:
        from app.services.local_llm_service import local_llm
        if local_llm.loaded:
            text = await local_llm.generate_text(prompt, temperature=0.1, max_tokens=300)
            result = _extract_json(text)
            if result:
                return result
    except Exception as exc:
        logger.warning("Local LLM parse-intent failed: %s", exc)

    # Fallback: Gemini (if configured)
    if settings.GEMINI_API_KEY:
        try:
            import google.generativeai as genai
            genai.configure(api_key=settings.GEMINI_API_KEY)
            model = genai.GenerativeModel(settings.GEMINI_MODEL)
            resp = await model.generate_content_async(prompt)
            return _extract_json(resp.text)
        except Exception as exc:
            logger.warning("Gemini parse-intent failed: %s", exc)

    return None


def _extract_json(text: str) -> Optional[dict]:
    """Extract JSON object from LLM response text."""
    text = text.strip()
    # Strip markdown code fences
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON in text
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                pass
    return None
