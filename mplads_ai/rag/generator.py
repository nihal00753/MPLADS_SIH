"""
Gemini Flash Generator for MPLADS RAG Pipeline.

Takes retrieved chunks + user question, calls Gemini 2.0 Flash
for grounded, hallucination-guarded generation.
"""

from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Optional, Set

# ---------------------------------------------------------------------------
# Gemini Client (lazy init)
# ---------------------------------------------------------------------------

_gemini_client: Any = None
_gemini_available = False


def _get_gemini_client():
    """Lazy-init the Gemini client."""
    global _gemini_client, _gemini_available

    if _gemini_client is not None:
        return _gemini_client

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        # Try loading from .env file
        env_path = os.path.join(r"d:\MPLADS AIML", ".env")
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("GEMINI_API_KEY="):
                        api_key = line.split("=", 1)[1].strip()
                        break

    if not api_key:
        print("[RAG Generator] No GEMINI_API_KEY found. Using fallback mode.")
        _gemini_available = False
        return None

    try:
        from google import genai
        _gemini_client = genai.Client(api_key=api_key)
        _gemini_available = True
        print("[RAG Generator] Gemini client initialized successfully.")
        return _gemini_client
    except Exception as e:
        print(f"[RAG Generator] Failed to init Gemini: {e}. Using fallback mode.")
        _gemini_available = False
        return None


# ---------------------------------------------------------------------------
# System Prompt
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are the **MPLADS AI Copilot**, a data analyst for the Member of Parliament \
Local Area Development Scheme (MPLADS) monitoring platform.

## Your Role
- Answer questions ONLY from the retrieved data context provided below.
- Cite specific numbers, names, and facts from the data.
- If the data does not contain the information needed, say: \
"This information is not available in the current dataset."

## Formatting Rules
- Use **bold** for key numbers and names.
- Use bullet points for lists.
- Keep answers concise: 2-5 sentences for simple questions, up to 8 for complex ones.
- Always mention the data source: "Based on the MPLADS dataset..."
- Use ₹ symbol for Indian currency. Format large amounts in Crore (₹1 Crore = ₹10,000,000).

## Strict Rules
1. NEVER invent or estimate figures not present in the data.
2. NEVER make up MP names, constituency names, or vendor names.
3. If you compute a derived number (percentage, average), show the calculation.
4. If the question is ambiguous, state your assumption.

## Retrieved Data Context
{context}
"""


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------

def generate(
    question: str,
    retrieved_chunks: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Generate a grounded answer using Gemini Flash.

    Args:
        question: User's natural language question.
        retrieved_chunks: List of dicts with 'text', 'metadata', 'score' from retriever.

    Returns:
        Dict with keys: answer, confidence, data_used, warnings, sources, used_fallback.
    """
    # Build context from retrieved chunks
    context_parts = []
    sources = []
    for i, chunk in enumerate(retrieved_chunks[:10], 1):
        context_parts.append(f"[Source {i}] {chunk['text']}")
        sources.append({
            "source_id": i,
            "type": chunk["metadata"].get("type", "unknown"),
            "text_preview": chunk["text"][:120] + "..." if len(chunk["text"]) > 120 else chunk["text"],
            "relevance_score": round(chunk["score"], 3),
        })

    context_text = "\n\n".join(context_parts) if context_parts else "No relevant data found."

    # Try Gemini first
    client = _get_gemini_client()

    if client and _gemini_available:
        return _generate_with_gemini(client, question, context_text, sources)
    else:
        return _generate_fallback(question, context_text, retrieved_chunks, sources)


def _generate_with_gemini(
    client: Any,
    question: str,
    context_text: str,
    sources: List[Dict],
) -> Dict[str, Any]:
    """Generate answer using Gemini 2.0 Flash."""
    try:
        system_prompt = _SYSTEM_PROMPT.format(context=context_text)

        # Active and verified models for this API key
        models_to_try = [
            "gemini-3.6-flash",
            "gemini-3.7-flash",
            "gemini-3.8-flash",
            "gemini-flash-latest",
            "gemini-3.5-flash",
        ]
        response = None
        used_model = "gemini-3.6-flash"
        last_err = None
        extracted_text = ""

        def _get_text(res: Any) -> str:
            if not res:
                return ""
            if getattr(res, "text", None):
                return res.text.strip()
            if hasattr(res, "candidates") and res.candidates:
                for cand in res.candidates:
                    if cand.content and cand.content.parts:
                        txts = [p.text for p in cand.content.parts if hasattr(p, "text") and p.text]
                        if txts:
                            return " ".join(txts).strip()
            return ""

        for model_name in models_to_try:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=question,
                    config={
                        "system_instruction": system_prompt,
                        "temperature": 0.2,
                        "max_output_tokens": 1024,
                    },
                )
                text = _get_text(response)
                if text:
                    used_model = model_name
                    extracted_text = text
                    print(f"[RAG Generator] Successfully generated response using {model_name}")
                    break
            except Exception as me:
                print(f"[RAG Generator] Model {model_name} failed: {type(me).__name__}: {me}")
                last_err = me
                continue

        if not extracted_text:
            if last_err:
                print(f"[RAG Generator] All Gemini models failed. Last error: {last_err}")
            return _generate_fallback(question, context_text, [], sources)

        answer = extracted_text

        # Validate: check for hallucination
        warnings = _check_hallucination(answer, context_text)

        # Determine confidence
        if _is_refusal(answer):
            confidence = 0.3
        elif warnings:
            confidence = 0.7
        else:
            confidence = 0.95

        return {
            "answer": answer,
            "confidence": confidence,
            "data_used": f"MPLADS RAG Pipeline ({used_model} + FAISS + 12,937 records)",
            "warnings": warnings,
            "sources": sources,
            "used_fallback": False,
            "model": used_model,
        }

    except Exception as e:
        print(f"[RAG Generator] Gemini call failed: {e}")
        return _generate_fallback(question, context_text, [], sources)


def _generate_fallback(
    question: str,
    context_text: str,
    retrieved_chunks: List[Dict],
    sources: List[Dict],
) -> Dict[str, Any]:
    """Enhanced deterministic fallback when Gemini is unavailable."""
    # Use the context text directly as the answer with some formatting
    if "no relevant data found" in context_text.lower():
        answer = "I could not find specific records matching your query in the MPLADS dataset."
    else:
        # Extract the first 2-3 most relevant source texts
        source_texts = [s["text_preview"] for s in sources[:3]]
        answer = (
            f"Based on the MPLADS dataset, here is what I found:\n\n"
            + "\n\n".join(f"• {t}" for t in source_texts)
        )

    return {
        "answer": answer,
        "confidence": 0.6,
        "data_used": "MPLADS RAG Pipeline (Fallback Mode — FAISS retrieval only)",
        "warnings": ["Gemini API unavailable; showing raw retrieved data."],
        "sources": sources,
        "used_fallback": True,
        "model": "fallback-retrieval-only",
    }


# ---------------------------------------------------------------------------
# Validation Helpers
# ---------------------------------------------------------------------------

def _extract_numbers(text: str) -> Set[str]:
    """Extract all numeric tokens from text."""
    raw_numbers = re.findall(r"[\d,]+(?:\.\d+)?", text)
    normalised = set()
    for n in raw_numbers:
        stripped = n.replace(",", "")
        if stripped and stripped != ".":
            normalised.add(stripped)
    return normalised


def _check_hallucination(answer: str, context: str) -> List[str]:
    """Check if the answer contains numbers not present in the context."""
    context_numbers = _extract_numbers(context)
    answer_numbers = _extract_numbers(answer)
    novel = answer_numbers - context_numbers

    # Filter trivially small numbers
    significant_novel = {
        n for n in novel
        if len(n.replace(".", "")) > 2  # more than 2 digits
    }

    warnings: List[str] = []
    if significant_novel:
        warnings.append(
            f"Answer may contain computed/derived numbers: "
            f"{', '.join(sorted(list(significant_novel)[:5]))}."
        )
    return warnings


def _is_refusal(answer: str) -> bool:
    """Check if the model refused to answer."""
    lower = answer.lower()
    return any(phrase in lower for phrase in [
        "not available in the current",
        "i don't have",
        "cannot determine",
        "no data",
        "not enough information",
    ])
