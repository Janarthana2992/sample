import asyncio
import logging
import secrets
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.routes.recommendations import router as rec_router
from app.routes.chat import router as chat_router
from app.routes.smart_search import router as smart_search_router
from app.routes.documents import router as docs_router
from app.routes.handoff import router as handoff_router
from app.services.faiss_service import faiss_service
from app.services.embedding_service import get_model
from app.services.rag_service import rag_kb

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)


def _require_internal_token(
    x_internal_service_token: str | None = Header(default=None, alias="X-Internal-Service-Token"),
):
    if not x_internal_service_token or not secrets.compare_digest(
        x_internal_service_token, settings.INTERNAL_SERVICE_TOKEN
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid token")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AI Service starting...")
    faiss_service.load()
    get_model()  # warm up embedding model
    rag_kb.load()  # load persisted RAG index
    logger.info("AI Service ready. FAISS vectors: %d, RAG chunks: %d",
                len(faiss_service.product_ids), len(rag_kb.chunks))
    # Pull Ollama model in background (non-blocking)
    asyncio.create_task(_ensure_ollama_model())
    # Build RAG index in background (non-blocking) if empty
    if len(rag_kb.chunks) == 0:
        asyncio.create_task(_build_rag_background())
    yield
    logger.info("AI Service stopped.")


async def _ensure_ollama_model():
    """Pull the configured Ollama model if it is not already present."""
    import httpx
    model = settings.OLLAMA_MODEL
    base_url = settings.OLLAMA_BASE_URL
    try:
        # Check if model is already available
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{base_url}/api/tags")
            if r.status_code == 200:
                names = [m.get("name", "") for m in r.json().get("models", [])]
                if any(model in n for n in names):
                    logger.info("Ollama model '%s' already present.", model)
                    return
        logger.info("Pulling Ollama model '%s' — this may take several minutes on first run...", model)
        async with httpx.AsyncClient(timeout=600.0) as client:
            async with client.stream(
                "POST", f"{base_url}/api/pull", json={"name": model}
            ) as resp:
                async for line in resp.aiter_lines():
                    if '"status"' in line:
                        import json as _json
                        try:
                            d = _json.loads(line)
                            status_msg = d.get("status", "")
                            if status_msg:
                                logger.info("Ollama pull — %s", status_msg)
                        except Exception:
                            pass
        logger.info("Ollama model '%s' is ready.", model)
    except Exception:
        logger.exception("Failed to pull Ollama model '%s'. Chat may not work until model is available.", model)


async def _build_rag_background():
    """Build the RAG knowledge base from product/review data (runs as background task)."""
    try:
        logger.info("RAG background build started...")
        await rag_kb.build_from_services()
        logger.info("RAG background build complete. Chunks indexed: %d", len(rag_kb.chunks))
    except Exception:
        logger.exception("RAG background build failed")


app = FastAPI(
    title="E-Commerce AI Recommendation Service",
    version="1.0.0",
    description="FAISS + Sentence Transformers product recommendations",
    lifespan=lifespan,
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url=None,
)

allowed_origins = ["*"] if settings.ENVIRONMENT == "development" else [settings.FRONTEND_URL]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting
from app.routes.chat import limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(rec_router)
app.include_router(chat_router)
app.include_router(smart_search_router)
app.include_router(docs_router)
app.include_router(handoff_router)


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "service": "ai", "indexed_products": len(faiss_service.product_ids),
            "rag_chunks": len(rag_kb.chunks)}


@app.post("/internal/rag-rebuild", tags=["internal"], dependencies=[Depends(_require_internal_token)])
async def rag_rebuild():
    """Rebuild the RAG knowledge base from current product/review data."""
    asyncio.create_task(_build_rag_background())
    return {"status": "rebuilding"}
