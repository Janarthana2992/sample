"""
Local LLM service using llama-cpp-python.

Downloads a quantized GGUF model on first startup and hosts it
entirely inside the container — no external API calls.
"""

import asyncio
import logging
import os
from typing import List, Optional

from app.config import settings

logger = logging.getLogger(__name__)


class LocalLLM:
    """Manages a local GGUF model via llama-cpp-python."""

    def __init__(self):
        self._model = None

    def _ensure_model_downloaded(self) -> str:
        """Download model if not present, return path."""
        model_dir = os.path.join(settings.FAISS_INDEX_PATH, "models")
        os.makedirs(model_dir, exist_ok=True)
        model_path = os.path.join(model_dir, settings.LOCAL_MODEL_FILE)

        if os.path.exists(model_path):
            logger.info("Local model found at %s", model_path)
            return model_path

        logger.info(
            "Downloading model %s/%s — this may take a few minutes on first run...",
            settings.LOCAL_MODEL_REPO,
            settings.LOCAL_MODEL_FILE,
        )
        from huggingface_hub import hf_hub_download

        hf_hub_download(
            repo_id=settings.LOCAL_MODEL_REPO,
            filename=settings.LOCAL_MODEL_FILE,
            local_dir=model_dir,
        )
        logger.info("Model downloaded to %s", model_path)
        return model_path

    def load(self):
        """Download (if needed) and load the model into memory."""
        from llama_cpp import Llama

        model_path = self._ensure_model_downloaded()

        logger.info("Loading local LLM from %s ...", model_path)
        self._model = Llama(
            model_path=model_path,
            n_ctx=8192,
            n_threads=4,
            n_gpu_layers=0,  # CPU only
            verbose=False,
        )
        logger.info("Local LLM loaded successfully")

    @property
    def loaded(self) -> bool:
        return self._model is not None

    async def chat_completion(
        self,
        messages: List[dict],
        tools: Optional[List[dict]] = None,
        tool_choice: str = "auto",
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> dict:
        """Run chat completion in a thread pool to avoid blocking the event loop."""
        if self._model is None:
            raise RuntimeError("Local LLM not loaded")

        kwargs = {
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = tool_choice

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self._model.create_chat_completion(**kwargs),
        )
        return response

    async def generate_text(
        self,
        prompt: str,
        temperature: float = 0.1,
        max_tokens: int = 300,
    ) -> str:
        """Simple text generation for non-chat uses (e.g. search intent parsing)."""
        if self._model is None:
            raise RuntimeError("Local LLM not loaded")

        messages = [{"role": "user", "content": prompt}]
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self._model.create_chat_completion(
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            ),
        )
        return response["choices"][0]["message"].get("content", "")


# Singleton
local_llm = LocalLLM()
