"""
RAG Knowledge Base — indexes products, reviews, and store policies into a
dedicated FAISS vector store.  At query time, the top-K most relevant chunks
are retrieved and injected into the LLM context so the model answers from
real data rather than hallucinating.

Embedding model: all-MiniLM-L6-v2 (open-source, 384-dim, already loaded).
Vector store:    FAISS IndexFlatIP (cosine similarity on L2-normalised vectors).
"""

import json
import logging
import os
import asyncio
from typing import List, Optional, Tuple

import faiss
import numpy as np

from app.config import settings

logger = logging.getLogger(__name__)

RAG_INDEX_DIR = os.path.join(settings.FAISS_INDEX_PATH, "rag")
RAG_INDEX_FILE = os.path.join(RAG_INDEX_DIR, "rag.index")
RAG_CHUNKS_FILE = os.path.join(RAG_INDEX_DIR, "chunks.json")
RAG_DOCS_FILE = os.path.join(RAG_INDEX_DIR, "custom_docs.json")

# ── Store policies (static knowledge) ──────────────────────
STORE_POLICIES = [
    {
        "type": "policy",
        "title": "Returns Policy",
        "text": (
            "ShopHere offers a 7-day easy return policy on most products. "
            "Electronics have a 10-day replacement window. Fashion items can "
            "be returned within 15 days if unused with tags attached. "
            "Refunds are processed within 5-7 business days to the original payment method."
        ),
    },
    {
        "type": "policy",
        "title": "Shipping Information",
        "text": (
            "Standard shipping takes 3-7 business days across India. "
            "Express shipping (1-3 days) is available for ₹99 extra on eligible items. "
            "Free shipping on orders above ₹499. "
            "We ship to all Indian pincodes. Tracking is available for all orders."
        ),
    },
    {
        "type": "policy",
        "title": "Payment Methods",
        "text": (
            "We accept UPI, credit/debit cards (Visa, Mastercard, RuPay), "
            "net banking, wallets (Paytm, PhonePe), and Cash on Delivery. "
            "EMI options available on orders above ₹3,000 via Razorpay. "
            "All payments are secured with 256-bit SSL encryption."
        ),
    },
    {
        "type": "policy",
        "title": "Order Cancellation",
        "text": (
            "Orders can be cancelled before they are shipped. Once shipped, "
            "you'll need to wait for delivery and then initiate a return. "
            "Refunds for cancelled orders are processed within 3-5 business days."
        ),
    },
    {
        "type": "policy",
        "title": "Customer Support",
        "text": (
            "Our support team is available Monday to Saturday, 9 AM to 9 PM IST. "
            "You can reach us via the chat assistant, email at support@shophere.in, "
            "or call 1800-XXX-XXXX (toll-free). Average response time is under 2 hours."
        ),
    },
]


class RAGChunk:
    """A single piece of knowledge stored in the RAG index."""
    __slots__ = ("chunk_id", "doc_type", "entity_id", "title", "text")

    def __init__(self, chunk_id: str, doc_type: str, entity_id: str, title: str, text: str):
        self.chunk_id = chunk_id
        self.doc_type = doc_type
        self.entity_id = entity_id
        self.title = title
        self.text = text

    def to_dict(self) -> dict:
        return {
            "chunk_id": self.chunk_id,
            "doc_type": self.doc_type,
            "entity_id": self.entity_id,
            "title": self.title,
            "text": self.text,
        }

    @staticmethod
    def from_dict(d: dict) -> "RAGChunk":
        return RAGChunk(**d)

    def context_str(self) -> str:
        """Format for injection into the LLM context."""
        return f"[{self.doc_type.upper()}] {self.title}\n{self.text}"


class RAGKnowledgeBase:
    """FAISS-backed knowledge base for RAG retrieval."""

    def __init__(self):
        self.dim = 384
        self.index: Optional[faiss.IndexFlatIP] = None
        self.chunks: List[RAGChunk] = []
        self._lock = asyncio.Lock()
        self._model = None

    def _get_model(self):
        if self._model is None:
            from app.services.embedding_service import get_model
            self._model = get_model()
        return self._model

    def _embed(self, texts: List[str]) -> np.ndarray:
        model = self._get_model()
        vecs = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return np.array(vecs, dtype=np.float32)

    def load(self):
        """Load persisted RAG index from disk."""
        if os.path.exists(RAG_INDEX_FILE) and os.path.exists(RAG_CHUNKS_FILE):
            try:
                self.index = faiss.read_index(RAG_INDEX_FILE)
                with open(RAG_CHUNKS_FILE, "r") as f:
                    self.chunks = [RAGChunk.from_dict(c) for c in json.load(f)]
                logger.info("RAG index loaded: %d chunks", len(self.chunks))
                return
            except Exception as exc:
                logger.warning("Could not load RAG index: %s — starting fresh", exc)
        self.index = faiss.IndexFlatIP(self.dim)
        self.chunks = []

    def save(self):
        """Persist RAG index to disk."""
        os.makedirs(RAG_INDEX_DIR, exist_ok=True)
        faiss.write_index(self.index, RAG_INDEX_FILE)
        with open(RAG_CHUNKS_FILE, "w") as f:
            json.dump([c.to_dict() for c in self.chunks], f)
        logger.info("RAG index saved: %d chunks", len(self.chunks))

    async def build_from_services(self):
        """Fetch all products + reviews from product service, embed, and index."""
        import httpx

        async with self._lock:
            new_chunks: List[RAGChunk] = []

            # 1. Store policies
            for i, policy in enumerate(STORE_POLICIES):
                new_chunks.append(RAGChunk(
                    chunk_id=f"policy_{i}",
                    doc_type="policy",
                    entity_id=f"policy_{i}",
                    title=policy["title"],
                    text=policy["text"],
                ))

            async with httpx.AsyncClient(timeout=30.0) as client:
                headers = {"X-Internal-Service-Token": settings.INTERNAL_SERVICE_TOKEN}

                # 2. Products — fetch all via search/filter with empty query
                page = 1
                all_products = []
                while True:
                    r = await client.post(
                        f"{settings.PRODUCT_SERVICE_URL}/search/filter",
                        json={"q": "", "page": page, "size": 50},
                    )
                    if r.status_code != 200:
                        break
                    data = r.json()
                    hits = data.get("hits", [])
                    all_products.extend(hits)
                    if len(hits) < 50:
                        break
                    page += 1

                logger.info("RAG: fetched %d products", len(all_products))

                for p in all_products:
                    pid = p.get("product_id", "")
                    name = p.get("name", "")
                    desc = p.get("description", "")[:500]
                    price = p.get("selling_price")
                    mrp = p.get("mrp")
                    stock = p.get("stock_status", "unknown")
                    rating = p.get("rating")
                    review_count = p.get("review_count", 0)
                    cats = p.get("category_names", "")

                    price_str = f"₹{price:,.0f}" if price else "price N/A"
                    mrp_str = f" (MRP ₹{mrp:,.0f})" if mrp and mrp != price else ""
                    rating_str = f" | {rating}★ ({review_count} reviews)" if rating else ""
                    stock_str = stock.replace("_", " ")

                    text = (
                        f"{name} — {price_str}{mrp_str} | {stock_str}{rating_str}\n"
                        f"Categories: {cats}\n"
                        f"{desc}"
                    )
                    new_chunks.append(RAGChunk(
                        chunk_id=f"product_{pid}",
                        doc_type="product",
                        entity_id=pid,
                        title=name,
                        text=text,
                    ))

                # 3. Reviews — fetch all
                review_page = 1
                all_reviews = []
                while True:
                    r = await client.get(
                        f"{settings.PRODUCT_SERVICE_URL}/reviews",
                        params={"page": review_page, "size": 100},
                    )
                    if r.status_code != 200:
                        break
                    data = r.json()
                    items = data.get("items", [])
                    all_reviews.extend(items)
                    if len(items) < 100:
                        break
                    review_page += 1

                logger.info("RAG: fetched %d reviews", len(all_reviews))

                # Map reviews to product names
                product_name_map = {p.get("product_id"): p.get("name", "Unknown") for p in all_products}

                for rv in all_reviews:
                    rid = rv.get("review_id", "")
                    pid = rv.get("product_id", "")
                    pname = product_name_map.get(pid, "Unknown Product")
                    rating = rv.get("rating", 0)
                    text = rv.get("review_text", "")
                    reply = rv.get("reply")
                    reply_str = ""
                    if reply and not reply.get("is_retracted"):
                        reply_str = f"\nStore reply: {reply.get('reply_text', '')}"

                    chunk_text = (
                        f"Review for {pname} — {rating}★\n"
                        f"{text}{reply_str}"
                    )
                    new_chunks.append(RAGChunk(
                        chunk_id=f"review_{rid}",
                        doc_type="review",
                        entity_id=rid,
                        title=f"Review: {pname} ({rating}★)",
                        text=chunk_text,
                    ))

            # 4. Embed all chunks
            if not new_chunks:
                logger.warning("RAG: no chunks to index")
                return

            texts = [c.text for c in new_chunks]
            logger.info("RAG: embedding %d chunks...", len(texts))
            vecs = self._embed(texts)
            faiss.normalize_L2(vecs)

            # Build fresh index
            new_index = faiss.IndexFlatIP(self.dim)
            new_index.add(vecs)

            self.index = new_index
            self.chunks = new_chunks
            self.save()
            logger.info("RAG: knowledge base built with %d chunks", len(self.chunks))

    async def retrieve(self, query: str, top_k: int = 6) -> List[RAGChunk]:
        """Retrieve the top-K most relevant chunks for a query."""
        if not self.chunks or self.index is None or self.index.ntotal == 0:
            return []

        vec = self._embed([query])
        faiss.normalize_L2(vec)
        k = min(top_k, len(self.chunks))
        scores, indices = self.index.search(vec, k)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1 or score < 0.15:  # low similarity threshold
                continue
            results.append(self.chunks[idx])
        return results

    def format_context(self, chunks: List[RAGChunk], max_chars: int = 3000) -> str:
        """Format retrieved chunks into a context string for the LLM."""
        if not chunks:
            return ""
        parts = []
        total = 0
        for c in chunks:
            entry = c.context_str()
            if total + len(entry) > max_chars:
                break
            parts.append(entry)
            total += len(entry)
        return "\n\n---\n\n".join(parts)

    # ── Custom document management ──────────────────────────────

    def _load_custom_docs(self) -> List[dict]:
        """Load custom docs metadata from disk."""
        if os.path.exists(RAG_DOCS_FILE):
            try:
                with open(RAG_DOCS_FILE, "r") as f:
                    return json.load(f)
            except Exception:
                pass
        return []

    def _save_custom_docs(self, docs: List[dict]):
        """Persist custom docs metadata."""
        os.makedirs(RAG_INDEX_DIR, exist_ok=True)
        with open(RAG_DOCS_FILE, "w") as f:
            json.dump(docs, f)

    def list_custom_docs(self) -> List[dict]:
        """Return metadata for all admin-uploaded documents."""
        return self._load_custom_docs()

    async def add_custom_document(self, doc_id: str, filename: str, content: str) -> int:
        """Chunk, embed, and add a custom document to the RAG index. Returns chunk count."""
        chunks_text = self._chunk_text(content, max_chunk=800, overlap=100)
        if not chunks_text:
            return 0

        async with self._lock:
            new_chunks: List[RAGChunk] = []
            for i, chunk in enumerate(chunks_text):
                new_chunks.append(RAGChunk(
                    chunk_id=f"doc_{doc_id}_{i}",
                    doc_type="document",
                    entity_id=doc_id,
                    title=f"{filename} (part {i + 1})",
                    text=chunk,
                ))

            vecs = self._embed([c.text for c in new_chunks])
            faiss.normalize_L2(vecs)
            self.index.add(vecs)
            self.chunks.extend(new_chunks)
            self.save()

            # Save doc metadata
            docs = self._load_custom_docs()
            docs.append({
                "doc_id": doc_id,
                "filename": filename,
                "chunk_count": len(new_chunks),
                "char_count": len(content),
            })
            self._save_custom_docs(docs)

            logger.info("RAG: added custom doc '%s' with %d chunks", filename, len(new_chunks))
            return len(new_chunks)

    async def delete_custom_document(self, doc_id: str) -> bool:
        """Remove a custom document's chunks and rebuild the index."""
        async with self._lock:
            remaining = [c for c in self.chunks if c.entity_id != doc_id]
            if len(remaining) == len(self.chunks):
                return False

            if remaining:
                vecs = self._embed([c.text for c in remaining])
                faiss.normalize_L2(vecs)
                new_index = faiss.IndexFlatIP(self.dim)
                new_index.add(vecs)
            else:
                new_index = faiss.IndexFlatIP(self.dim)

            self.index = new_index
            self.chunks = remaining
            self.save()

            # Update doc metadata
            docs = self._load_custom_docs()
            docs = [d for d in docs if d["doc_id"] != doc_id]
            self._save_custom_docs(docs)

            logger.info("RAG: deleted custom doc %s, remaining chunks: %d", doc_id, len(self.chunks))
            return True

    @staticmethod
    def _chunk_text(text: str, max_chunk: int = 800, overlap: int = 100) -> List[str]:
        """Split text into overlapping chunks by paragraph boundaries."""
        paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
        chunks: List[str] = []
        current = ""

        for para in paragraphs:
            if len(current) + len(para) + 1 > max_chunk and current:
                chunks.append(current)
                # Keep overlap from end of previous chunk
                current = current[-overlap:] + "\n" + para if overlap else para
            else:
                current = current + "\n" + para if current else para

        if current:
            chunks.append(current)

        return chunks


# Singleton
rag_kb = RAGKnowledgeBase()
