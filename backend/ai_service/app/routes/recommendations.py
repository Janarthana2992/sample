import logging
import secrets
import uuid
from typing import List

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings
from app.schemas.recommendation import EmbedRequest, RecommendationItem, RecommendationResponse
from app.services.embedding_service import embed_and_store, get_similar, embed_text
from app.services.faiss_service import faiss_service

router = APIRouter(tags=["recommendations"])
bearer_scheme = HTTPBearer()
logger = logging.getLogger(__name__)


def _decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    return payload


def _get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    payload = _decode_access_token(credentials.credentials)
    payload["_token"] = credentials.credentials
    return payload


def _require_internal_service_token(
    x_internal_service_token: str | None = Header(default=None, alias="X-Internal-Service-Token"),
) -> None:
    if not x_internal_service_token or not secrets.compare_digest(
        x_internal_service_token,
        settings.INTERNAL_SERVICE_TOKEN,
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid internal service token")


# ── Internal: index a product ────────────────────────────────

@router.post("/internal/embed", status_code=status.HTTP_202_ACCEPTED, tags=["internal"])
async def generate_embeddings(
    payload: EmbedRequest,
    _=Depends(_require_internal_service_token),
):
    await embed_and_store(str(payload.product_id), payload.name, payload.description)
    return {"queued": True, "product_id": str(payload.product_id)}


@router.post("/internal/embed-all", status_code=status.HTTP_202_ACCEPTED, tags=["internal"])
async def embed_all_products(_=Depends(_require_internal_service_token)):
    """
    Bulk-index all active products from product service into FAISS.
    Call this once after deploying to seed the recommendation index.
    """
    indexed = 0
    page = 1
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            while True:
                r = await client.get(
                    f"{settings.PRODUCT_SERVICE_URL}/products",
                    params={"is_active": True, "size": 100, "page": page},
                )
                if r.status_code != 200:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="Failed to fetch products from product service",
                    )
                data = r.json()
                products = data.get("items", [])
                if not products:
                    break
                for p in products:
                    pid = p.get("product_id")
                    name = p.get("name", "")
                    desc = p.get("description", "") or ""
                    if pid:
                        await embed_and_store(pid, name, desc)
                        indexed += 1
                total = data.get("total", 0)
                if page * 100 >= total:
                    break
                page += 1
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("embed-all failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to synchronize product embeddings",
        ) from exc
    return {"indexed": indexed}


# ── Similar products (product detail page) ───────────────────

@router.get("/recommend/similar/{product_id}", response_model=RecommendationResponse)
async def similar_products(
    product_id: uuid.UUID,
    top_n: int = Query(default=5, ge=1, le=20),
):
    results = await get_similar(str(product_id), top_n)
    if not results:
        return RecommendationResponse(items=[])

    items = []
    async with httpx.AsyncClient(timeout=5.0) as client:
        for r in results:
            pid = r["product_id"]
            try:
                pr = await client.get(f"{settings.PRODUCT_SERVICE_URL}/products/{pid}")
                if pr.status_code == 200:
                    p = pr.json()
                    images = p.get("images") or []
                    image_url = images[0]["url"] if images else None
                    items.append(RecommendationItem(
                        product_id=uuid.UUID(pid),
                        score=r["score"],
                        name=p.get("name"),
                        mrp=p.get("mrp"),
                        selling_price=p.get("selling_price"),
                        image_url=image_url,
                        stock_status=p.get("stock_status"),
                    ))
            except Exception:
                pass
    return RecommendationResponse(items=items)


# ── General trending recommendations (homepage) ─────────────

@router.get("/recommend/products", response_model=RecommendationResponse)
async def recommend_products(top_n: int = Query(default=5, ge=1, le=20)):
    """
    General trending recommendations based on sales count.
    Fetches top products from Product Service and returns them ordered by popularity.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                f"{settings.PRODUCT_SERVICE_URL}/products",
                params={"is_active": True, "size": top_n},
            )
            if r.status_code == 200:
                products = r.json().get("items", [])
                items = []
                for p in products:
                    images = p.get("images") or []
                    image_url = images[0]["url"] if images else None
                    items.append(RecommendationItem(
                        product_id=uuid.UUID(p["product_id"]),
                        score=float(p.get("sales_count", 0)),
                        name=p.get("name"),
                        mrp=p.get("mrp"),
                        selling_price=p.get("selling_price"),
                        image_url=image_url,
                        stock_status=p.get("stock_status"),
                    ))
                return RecommendationResponse(items=items)
    except Exception as exc:
        logger.error("Failed to fetch trending products: %s", exc)
    return RecommendationResponse(items=[])


# ── Personalised user recommendations ───────────────────────

@router.get("/recommend/user/{user_id}", response_model=RecommendationResponse)
async def user_recommendations(
    user_id: uuid.UUID,
    top_n: int = Query(default=5, ge=1, le=20),
    current_user: dict = Depends(_get_current_user),
):
    """
    Personalised recommendations based on user purchase history.
    Fetches user's orders, extracts purchased products, averages their embeddings,
    then finds nearest neighbours in FAISS.
    """
    if current_user["sub"] != str(user_id) and current_user.get("role") not in {"admin", "staff"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                f"{settings.ORDER_SERVICE_URL}/orders",
                params={"user_id": str(user_id), "status": "delivered", "size": 20},
                headers={"Authorization": f"Bearer {current_user['_token']}"},
            )
            if r.status_code != 200:
                raise Exception("Could not fetch orders")
            orders = r.json().get("items", [])

        purchased_ids: list[str] = []
        for order in orders:
            for item in order.get("items", []):
                pid = item.get("product_id")
                if pid and pid not in purchased_ids:
                    purchased_ids.append(pid)

        if not purchased_ids:
            # Fallback to trending
            return await recommend_products(top_n)

        import numpy as np
        vectors = []
        for pid in purchased_ids[:10]:
            vec = faiss_service.get_vector_by_product_id(pid)
            if vec is not None:
                vectors.append(vec)

        if not vectors:
            return await recommend_products(top_n)

        avg_vector = np.mean(vectors, axis=0).tolist()
        results = await faiss_service.search_similar(avg_vector, top_n + len(purchased_ids))
        filtered = [r for r in results if r[0] not in purchased_ids][:top_n]

        # Fetch product details for FAISS results
        product_ids = [pid for pid, _ in filtered]
        scores = {pid: score for pid, score in filtered}
        items = []
        async with httpx.AsyncClient(timeout=5.0) as client:
            for pid in product_ids:
                try:
                    pr = await client.get(f"{settings.PRODUCT_SERVICE_URL}/products/{pid}")
                    if pr.status_code == 200:
                        p = pr.json()
                        images = p.get("images") or []
                        image_url = images[0]["url"] if images else None
                        items.append(RecommendationItem(
                            product_id=uuid.UUID(pid),
                            score=scores[pid],
                            name=p.get("name"),
                            mrp=p.get("mrp"),
                            selling_price=p.get("selling_price"),
                            image_url=image_url,
                            stock_status=p.get("stock_status"),
                        ))
                    else:
                        items.append(RecommendationItem(product_id=uuid.UUID(pid), score=scores[pid]))
                except Exception:
                    items.append(RecommendationItem(product_id=uuid.UUID(pid), score=scores[pid]))

        return RecommendationResponse(items=items)

    except Exception as exc:
        logger.error("User recommendation failed for %s: %s", user_id, exc)
        return await recommend_products(top_n)


# ── Interest-based recommendations (recently viewed products) ─

@router.get("/recommend/interest", response_model=RecommendationResponse)
async def interest_recommendations(
    product_ids: str = Query(..., description="Comma-separated list of recently viewed product IDs"),
    top_n: int = Query(default=8, ge=1, le=20),
):
    """
    Recommendations based on recently viewed products.
    Averages FAISS vectors of viewed products then finds nearest neighbours.
    """
    try:
        import numpy as np

        ids = [p.strip() for p in product_ids.split(",") if p.strip()]
        if not ids:
            return await recommend_products(top_n)

        vectors = []
        for pid in ids[:10]:
            vec = faiss_service.get_vector_by_product_id(pid)
            if vec is not None:
                vectors.append(vec)

        if not vectors:
            return await recommend_products(top_n)

        avg_vector = np.mean(vectors, axis=0).tolist()
        results = await faiss_service.search_similar(avg_vector, top_n + len(ids))
        # Exclude already-viewed products
        filtered = [r for r in results if r[0] not in ids][:top_n]

        product_id_list = [pid for pid, _ in filtered]
        scores = {pid: score for pid, score in filtered}

        items = []
        async with httpx.AsyncClient(timeout=5.0) as client:
            for pid in product_id_list:
                try:
                    pr = await client.get(f"{settings.PRODUCT_SERVICE_URL}/products/{pid}")
                    if pr.status_code == 200:
                        p = pr.json()
                        images = p.get("images") or []
                        image_url = images[0]["url"] if images else None
                        items.append(RecommendationItem(
                            product_id=uuid.UUID(pid),
                            score=scores[pid],
                            name=p.get("name"),
                            mrp=p.get("mrp"),
                            selling_price=p.get("selling_price"),
                            image_url=image_url,
                            stock_status=p.get("stock_status"),
                        ))
                except Exception:
                    pass

        if not items:
            return await recommend_products(top_n)

        return RecommendationResponse(items=items)

    except Exception as exc:
        logger.error("Interest recommendation failed: %s", exc)
        return await recommend_products(top_n)


# ── Search-query-based recommendations ───────────────────────

@router.get("/recommend/search", response_model=RecommendationResponse)
async def search_based_recommendations(
    queries: str = Query(..., description="Comma-separated recent search terms"),
    top_n: int = Query(default=8, ge=1, le=20),
):
    """
    Recommendations based on recent search queries.
    Embeds each search term as text, averages their FAISS vectors,
    then returns the nearest product neighbours.
    """
    try:
        import numpy as np

        terms = [q.strip() for q in queries.split(",") if q.strip()][:5]
        if not terms:
            return await recommend_products(top_n)

        vectors = []
        for term in terms:
            vec = embed_text(term)
            if vec:
                vectors.append(np.array(vec, dtype=np.float32))

        if not vectors:
            return await recommend_products(top_n)

        avg_vector = np.mean(vectors, axis=0).tolist()
        results = await faiss_service.search_similar(avg_vector, top_n)

        items = []
        async with httpx.AsyncClient(timeout=5.0) as client:
            for pid, score in results:
                try:
                    pr = await client.get(f"{settings.PRODUCT_SERVICE_URL}/products/{pid}")
                    if pr.status_code == 200:
                        p = pr.json()
                        images = p.get("images") or []
                        image_url = images[0]["url"] if images else None
                        items.append(RecommendationItem(
                            product_id=uuid.UUID(pid),
                            score=score,
                            name=p.get("name"),
                            mrp=p.get("mrp"),
                            selling_price=p.get("selling_price"),
                            image_url=image_url,
                            stock_status=p.get("stock_status"),
                        ))
                except Exception:
                    pass

        if not items:
            return await recommend_products(top_n)

        return RecommendationResponse(items=items)

    except Exception as exc:
        logger.error("Search recommendation failed: %s", exc)
        return await recommend_products(top_n)
