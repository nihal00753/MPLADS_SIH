"""
Natural‑language query assistant for the MPLADS platform.

Answers plain‑language questions from officials (e.g. "which districts are
trending worse this quarter?") grounded strictly in the platform's own
structured data.  The LLM never sees any data beyond what is explicitly
passed into the ``QueryContext`` and is instructed to say "not available
in the current data" rather than guess.

The LLM is *dependency‑injected* as a callable with signature
``(system_prompt: str, user_prompt: str) -> str``.  This module never
imports an LLM SDK.

Response validation includes:
- Check for explicit "not available" / "I don't know" statements
  (treated as low confidence, not failure).
- Numeric hallucination guard: if the LLM answer contains numbers not
  present anywhere in the supplied data context, a warning is attached.

Known limitations (v1):
- Validation is lexical (string search); a sophisticated answer that
  computes a derived number from source data will be wrongly flagged
  as a hallucination.
- The module does not generate SQL or query the database directly; the
  caller must pre‑fetch relevant data and format it into the context.
- Very large data contexts may exceed the LLM's context window; callers
  are responsible for truncation or summarisation.

Dependencies: none beyond the Python standard library.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Set

from mplads_ai.common.types import InsufficientDataError, RiskSignal

MODULE_NAME = "nl_query"

# ---------------------------------------------------------------------------
# Data‑transfer objects
# ---------------------------------------------------------------------------

@dataclass
class QueryContext:
    """
    Data context explicitly passed to the LLM.

    The LLM will *only* see these fields.  No database connections, no
    side‑channel data.
    """
    data_summary: str
    available_metrics: List[str]
    time_range: str
    raw_data_snippet: Optional[str] = None


@dataclass
class QueryResult:
    """Grounded answer returned by the assistant."""
    answer: str
    data_used: str
    confidence: str           # HIGH | MEDIUM | LOW
    warnings: List[str] = field(default_factory=list)
    used_fallback: bool = False


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are a data analyst for the MPLADS (Member of Parliament Local Area \
Development Scheme) monitoring platform.

RULES — follow these without exception:
1. Answer ONLY from the data provided below under "DATA CONTEXT".
2. If the data does not contain the information needed to answer the \
question, respond with exactly: "This information is not available in \
the current data."
3. Never invent, estimate, or extrapolate figures not explicitly present \
in the data.
4. Cite specific numbers from the data when answering.
5. Keep answers concise — 2‑4 sentences maximum.
6. If the question is ambiguous, state what assumption you made.

DATA CONTEXT:
{data_context}

AVAILABLE METRICS: {metrics}
TIME RANGE: {time_range}
"""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _extract_numbers(text: str) -> Set[str]:
    """
    Extract all numeric tokens from text.

    Returns strings so that formatting differences (1,000 vs 1000) are
    handled by normalising both.
    """
    raw_numbers = re.findall(r"[\d,]+(?:\.\d+)?", text)
    normalised = set()
    for n in raw_numbers:
        stripped = n.replace(",", "")
        if stripped and stripped != ".":
            normalised.add(stripped)
    return normalised


def _check_hallucination(
    answer: str,
    context: QueryContext,
) -> List[str]:
    """
    Check whether the LLM answer contains numbers not present in the
    supplied data context.

    Returns a list of warning strings (empty if no issues found).
    """
    # Build the set of all numbers in the context
    context_text = (context.data_summary or "") + " " + (context.raw_data_snippet or "")
    context_numbers = _extract_numbers(context_text)

    # Extract numbers from the answer
    answer_numbers = _extract_numbers(answer)

    # Numbers in answer but not in context
    novel = answer_numbers - context_numbers

    # Filter out very small numbers (single digits are often ordinal / generic)
    significant_novel = {
        n for n in novel
        if len(n.replace(".", "")) > 1  # more than 1 digit
    }

    warnings: List[str] = []
    if significant_novel:
        warnings.append(
            f"Answer contains number(s) not found in the supplied data: "
            f"{', '.join(sorted(significant_novel))}. These may be computed "
            f"derivations or potential hallucinations."
        )
    return warnings


def _is_refusal(answer: str) -> bool:
    """Check whether the LLM explicitly said the data is unavailable."""
    refusal_phrases = [
        "not available in the current data",
        "i don't have",
        "i do not have",
        "cannot determine",
        "no data",
        "not enough information",
        "insufficient data",
    ]
    lower = answer.lower()
    return any(phrase in lower for phrase in refusal_phrases)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def answer_query(
    question: str,
    context: QueryContext,
    llm_callable: Callable[[str, str], str],
) -> QueryResult:
    """
    Answer a plain‑language question grounded in the supplied data context.

    The LLM is given a strict system prompt that forbids inventing figures
    and instructs it to refuse when data is insufficient.  After receiving
    the LLM response, the module validates it for potential hallucinations
    (numbers not present in the context).

    Args:
        question: The official's natural‑language question.
        context: ``QueryContext`` with all data the LLM is allowed to see.
        llm_callable: ``(system_prompt, user_prompt) -> str``.

    Returns:
        ``QueryResult`` with the grounded answer, confidence level, and
        any validation warnings.

    Raises:
        InsufficientDataError: if *question* is empty.
    """
    if not question or not question.strip():
        raise InsufficientDataError(
            MODULE_NAME,
            "Question is empty; nothing to answer.",
        )

    # Handle empty context gracefully (do NOT call the LLM)
    if not context.data_summary or not context.data_summary.strip():
        return QueryResult(
            answer="No data was provided to answer this question.",
            data_used="none",
            confidence="LOW",
            warnings=["Data context was empty; LLM was not called."],
            used_fallback=True,
        )

    # Build data context block
    data_block = context.data_summary
    if context.raw_data_snippet:
        data_block += "\n\nRAW DATA SNIPPET:\n" + context.raw_data_snippet

    system_prompt = _SYSTEM_PROMPT.format(
        data_context=data_block,
        metrics=", ".join(context.available_metrics) if context.available_metrics else "none specified",
        time_range=context.time_range or "not specified",
    )

    try:
        raw_answer = llm_callable(system_prompt, question)
    except Exception as exc:
        return QueryResult(
            answer="Unable to process the query at this time.",
            data_used="none",
            confidence="LOW",
            warnings=[f"LLM call failed: {exc}"],
            used_fallback=True,
        )

    if not raw_answer or not raw_answer.strip():
        return QueryResult(
            answer="The model returned an empty response.",
            data_used="none",
            confidence="LOW",
            warnings=["LLM returned empty response."],
            used_fallback=True,
        )

    # Validate
    warnings: List[str] = _check_hallucination(raw_answer, context)

    # Determine confidence
    if _is_refusal(raw_answer):
        confidence = "LOW"
    elif warnings:
        confidence = "MEDIUM"
    else:
        confidence = "HIGH"

    return QueryResult(
        answer=raw_answer.strip(),
        data_used=context.data_summary[:200],
        confidence=confidence,
        warnings=warnings,
        used_fallback=False,
    )


def to_risk_signals(result: QueryResult) -> List[RiskSignal]:
    """
    Convert a query result into ``RiskSignal`` objects.

    Only produces signals when the query result carries warnings
    (potential hallucinations or failures).  Normal, clean answers
    do not emit risk signals.
    """
    signals: List[RiskSignal] = []

    if result.warnings:
        signals.append(RiskSignal(
            signal_type="NL_QUERY_WARNING",
            severity=0.3 if result.confidence == "MEDIUM" else 0.5,
            reason="; ".join(result.warnings),
            metadata={
                "confidence": result.confidence,
                "used_fallback": result.used_fallback,
            },
        ))

    return signals
