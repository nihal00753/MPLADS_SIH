"""
Semantic Retriever for MPLADS RAG Pipeline.

Performs vector similarity search against the FAISS index,
returning the top-K most relevant chunks for a given query.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import numpy as np

# ---------------------------------------------------------------------------
# Singleton state (populated by init_retriever)
# ---------------------------------------------------------------------------

_faiss_index: Any = None
_chunks_text: List[str] = []
_chunks_meta: List[Dict] = []
_embed_model: Any = None

_is_initialized = False


def init_retriever(
    faiss_index: Any,
    chunks_text: List[str],
    chunks_meta: List[Dict],
) -> None:
    """Initialize the retriever with a pre-built index."""
    global _faiss_index, _chunks_text, _chunks_meta, _embed_model, _is_initialized

    from sentence_transformers import SentenceTransformer
    from mplads_ai.rag.indexer import EMBEDDING_MODEL

    _faiss_index = faiss_index
    _chunks_text = chunks_text
    _chunks_meta = chunks_meta
    _embed_model = SentenceTransformer(EMBEDDING_MODEL)
    _is_initialized = True


def is_ready() -> bool:
    """Check if the retriever is initialized."""
    return _is_initialized


def retrieve(
    query: str,
    top_k: int = 10,
    filter_type: Optional[str] = None,
    filter_state: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Retrieve the top-K most relevant chunks for a query.

    Args:
        query: Natural language question.
        top_k: Number of results to return.
        filter_type: Optional filter by chunk type ('work', 'vendor', 'mp', 'summary').
        filter_state: Optional filter by state name.

    Returns:
        List of dicts with keys: text, metadata, score.
    """
    if not _is_initialized:
        return []

    # Embed the query
    query_vec = _embed_model.encode(
        [query],
        normalize_embeddings=True,
    ).astype(np.float32)

    # Search with a larger k to allow for post-filtering
    search_k = top_k * 4 if (filter_type or filter_state) else top_k + 5
    scores, indices = _faiss_index.search(query_vec, min(search_k, len(_chunks_text)))

    results: List[Dict[str, Any]] = []
    for score, idx in zip(scores[0], indices[0]):
        if idx < 0 or idx >= len(_chunks_text):
            continue

        meta = _chunks_meta[idx]

        # Apply filters
        if filter_type and meta.get("type") != filter_type:
            continue
        if filter_state and meta.get("state", "").lower() != filter_state.lower():
            continue

        results.append({
            "text": _chunks_text[idx],
            "metadata": meta,
            "score": float(score),
        })

        if len(results) >= top_k:
            break

    # Boost summary chunks to the top for broad questions
    _boost_summaries(query, results)

    return results


def _boost_summaries(query: str, results: List[Dict[str, Any]]) -> None:
    """
    Reorder results to prioritize summary chunks for aggregate questions.
    """
    q_lower = query.lower()
    is_aggregate = any(kw in q_lower for kw in [
        "how many", "total", "count", "average", "all",
        "overview", "summary", "statistics", "rate",
        "percentage", "distribution", "breakdown",
    ])

    if is_aggregate:
        # Move summary chunks to front
        summaries = [r for r in results if r["metadata"].get("type") == "summary"]
        non_summaries = [r for r in results if r["metadata"].get("type") != "summary"]
        results.clear()
        results.extend(summaries)
        results.extend(non_summaries)


def get_stats() -> Dict[str, Any]:
    """Return index statistics for the RAG status endpoint."""
    if not _is_initialized:
        return {"status": "not_initialized", "total_chunks": 0}

    type_counts: Dict[str, int] = {}
    for meta in _chunks_meta:
        t = meta.get("type", "unknown")
        type_counts[t] = type_counts.get(t, 0) + 1

    return {
        "status": "ready",
        "total_chunks": len(_chunks_text),
        "total_vectors": _faiss_index.ntotal if _faiss_index else 0,
        "chunk_types": type_counts,
        "embedding_model": "all-MiniLM-L6-v2",
    }
