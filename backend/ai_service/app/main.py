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
from app.services.local_llm_service import local_llm

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
    # Try to load local LLM; if it fails, Groq will be used as fallback
    try:
        local_llm.load()  # download (first run) & load local LLM
        logger.info("Local LLM loaded successfully")
    except Exception as exc:
        logger.warning("Local LLM failed to load: %s — will use Groq fallback", exc)
    logger.info("AI Service ready. FAISS vectors: %d, RAG chunks: %d, LLM loaded: %s",
                len(faiss_service.product_ids), len(rag_kb.chunks), local_llm.loaded)
    # Build RAG index in background (non-blocking) if empty
    if len(rag_kb.chunks) == 0:
        asyncio.create_task(_build_rag_background())
    yield
    logger.info("AI Service stopped.")


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
            "rag_chunks": len(rag_kb.chunks), "llm_loaded": local_llm.loaded}


@app.post("/internal/rag-rebuild", tags=["internal"], dependencies=[Depends(_require_internal_token)])
async def rag_rebuild():
    """Rebuild the RAG knowledge base from current product/review data."""
    asyncio.create_task(_build_rag_background())
    return {"status": "rebuilding"}
