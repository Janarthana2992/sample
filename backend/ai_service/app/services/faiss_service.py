import asyncio
import json
import logging
import os
from typing import List, Optional, Tuple

import faiss
import numpy as np

from app.config import settings

logger = logging.getLogger(__name__)

INDEX_FILE = os.path.join(settings.FAISS_INDEX_PATH, "products.index")
MAPPING_FILE = os.path.join(settings.FAISS_INDEX_PATH, "id_mapping.json")


class FAISSService:
    """
    Manages a FAISS IndexFlatIP (inner-product = cosine for L2-normalised vectors).
    product_ids list acts as the mapping from FAISS integer index → product UUID.
    """

    def __init__(self):
        self.dim = 384  # all-MiniLM-L6-v2 output dimension
        self.index: Optional[faiss.IndexFlatIP] = None
        self.product_ids: List[str] = []  # index i → product_id string
        self._lock = asyncio.Lock()

    def _new_index(self) -> faiss.IndexFlatIP:
        return faiss.IndexFlatIP(self.dim)

    def load(self):
        if os.path.exists(INDEX_FILE) and os.path.exists(MAPPING_FILE):
            try:
                self.index = faiss.read_index(INDEX_FILE)
                with open(MAPPING_FILE, "r") as f:
                    self.product_ids = json.load(f)
                logger.info("FAISS index loaded: %d vectors", self.index.ntotal)
                return
            except Exception as exc:
                logger.warning("Could not load FAISS index: %s — starting fresh", exc)
        self.index = self._new_index()
        self.product_ids = []

    def save(self):
        os.makedirs(settings.FAISS_INDEX_PATH, exist_ok=True)
        faiss.write_index(self.index, INDEX_FILE)
        with open(MAPPING_FILE, "w") as f:
            json.dump(self.product_ids, f)

    async def add_vector(self, product_id: str, vector: List[float]):
        async with self._lock:
            vec = np.array([vector], dtype=np.float32)
            faiss.normalize_L2(vec)
            if product_id in self.product_ids:
                # FAISS flat index doesn't support in-place update; rebuild would be needed
                # For now just skip re-indexing identical products
                logger.debug("Product %s already in FAISS index", product_id)
                return
            self.index.add(vec)
            self.product_ids.append(product_id)
            self.save()

    async def search_similar(self, vector: List[float], top_n: int = 5) -> List[Tuple[str, float]]:
        if not self.product_ids:
            return []
        async with self._lock:
            vec = np.array([vector], dtype=np.float32)
            faiss.normalize_L2(vec)
            k = min(top_n + 1, len(self.product_ids))
            scores, indices = self.index.search(vec, k)
            results = []
            for score, idx in zip(scores[0], indices[0]):
                if idx == -1:
                    continue
                pid = self.product_ids[idx]
                results.append((pid, float(score)))
            return results

    def get_vector_by_product_id(self, product_id: str) -> Optional[np.ndarray]:
        if product_id not in self.product_ids:
            return None
        idx = self.product_ids.index(product_id)
        return self.index.reconstruct(idx)


faiss_service = FAISSService()
