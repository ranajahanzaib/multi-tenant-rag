"""Local embedding adapter; failures are explicit so callers can use lexical-only retrieval."""

import asyncio
from functools import lru_cache
from typing import Any

from multi_tenant_rag.config import settings


@lru_cache(maxsize=1)
def _model() -> Any:
    from sentence_transformers import SentenceTransformer  # type: ignore[import-not-found]

    return SentenceTransformer(settings.embedding_model)


def _encode(query: str) -> list[float]:
    vectors = _model().encode([query], normalize_embeddings=True)
    return [float(value) for value in vectors[0].tolist()]


async def embed_query(query: str) -> list[float]:
    return await asyncio.to_thread(_encode, query)
