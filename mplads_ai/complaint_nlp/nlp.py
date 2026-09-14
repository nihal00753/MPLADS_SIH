"""
Complaint NLP for MPLADS citizen-complaint triage and deduplication.

Provides two capabilities:
1. **Triage** — classifies a citizen complaint by urgency (HIGH / MEDIUM /
   LOW) and category, producing a one‑line summary.  The primary path uses
   an LLM call with a strict JSON system prompt; if the LLM response cannot
   be parsed, a keyword‑based fallback classifier runs instead.
2. **Near‑duplicate clustering** — groups complaints that describe the same
   underlying issue using TF‑IDF + cosine similarity and single‑linkage
   clustering.

The LLM is *dependency‑injected* as a callable with signature
``(system_prompt: str, user_prompt: str) -> str``.  This module never
imports an LLM SDK — the caller is responsible for wiring up the model.

Known limitations (v1):
- The keyword fallback has low recall for nuanced or code‑switched
  complaints (Hindi‑English mixed).
- TF‑IDF clustering treats every token equally and does not capture
  semantic similarity; embeddings‑based clustering is a v2 improvement.
- The LLM call is synchronous; for high‑throughput batch triage,
  callers should parallelise externally.

Dependencies: scikit‑learn >= 1.3 (for TF‑IDF vectorizer).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence

from mplads_ai.common.types import InsufficientDataError, RiskSignal

MODULE_NAME = "complaint_nlp"

# ---------------------------------------------------------------------------
# Default categories and urgency keywords for fallback classifier
# ---------------------------------------------------------------------------

DEFAULT_CATEGORIES: List[str] = [
    "Infrastructure",
    "Water Supply",
    "Sanitation",
    "Road",
    "Education",
    "Health",
    "Electricity",
    "Community Hall",
    "Other",
]

_HIGH_URGENCY_KEYWORDS = re.compile(
    r"\b(collapse[ds]?|danger(?:ous)?|death|injur(?:y|ed|ies)|flood(?:ed|ing)?|"
    r"urgent|emergency|life.?threaten|electric.?shock|sewage.?overflow|"
    r"cave.?in|crack(?:ed|s)?|accident)\b",
    re.IGNORECASE,
)

_MEDIUM_URGENCY_KEYWORDS = re.compile(
    r"\b(delay(?:ed)?|pending|incomplete|broken|leak(?:ing|s)?|damage[ds]?|"
    r"not.?working|poor.?quality|overdue|stall(?:ed)?)\b",
    re.IGNORECASE,
)

# Keyword→category mapping for fallback
_CATEGORY_KEYWORDS: Dict[str, re.Pattern] = {
    "Water Supply": re.compile(r"\b(water|bore.?well|tank|pipeline|tap|drink)\b", re.I),
    "Road": re.compile(r"\b(road|highway|pothole|tar|asphalt|bridge|culvert)\b", re.I),
    "Sanitation": re.compile(r"\b(toilet|drain|sewage|garbage|waste|sanitation)\b", re.I),
    "Education": re.compile(r"\b(school|class.?room|library|education|student)\b", re.I),
    "Health": re.compile(r"\b(hospital|clinic|health|medical|PHC|dispensary)\b", re.I),
    "Electricity": re.compile(r"\b(electric|power|transformer|pole|light|lamp)\b", re.I),
    "Community Hall": re.compile(r"\b(community.?hall|kalyana.?mandapam|bhavan|auditorium)\b", re.I),
    "Infrastructure": re.compile(r"\b(building|construct|infra|cement|structure)\b", re.I),
}


# ---------------------------------------------------------------------------
# Data‑transfer objects
# ---------------------------------------------------------------------------

@dataclass
class TriageResult:
    """Output of complaint triage."""
    urgency: str          # HIGH | MEDIUM | LOW
    category: str
    summary: str
    raw_llm_response: Optional[str] = None
    used_fallback: bool = False


@dataclass
class ComplaintCluster:
    """A group of near‑duplicate complaints about the same issue."""
    cluster_id: int
    representative_text: str
    complaint_ids: List[str]
    similarity_scores: List[float]


# ---------------------------------------------------------------------------
# LLM system prompt
# ---------------------------------------------------------------------------

_TRIAGE_SYSTEM_PROMPT_TEMPLATE = """\
You are a complaint triage assistant for the MPLADS fund-monitoring platform.
Given a citizen complaint, classify it and return ONLY a JSON object with
exactly these three keys — no markdown, no explanation, no wrapping:

{{"urgency": "HIGH" | "MEDIUM" | "LOW", "category": "<one of: {categories}>", "summary": "<one-line summary of the complaint, max 20 words>"}}

Rules:
- HIGH urgency: imminent danger to life, structural collapse, flooding,
  electrical hazard, or health emergency.
- MEDIUM urgency: stalled or delayed work, quality issues, resource
  shortages, broken infrastructure still in use.
- LOW urgency: general feedback, requests for new projects, minor cosmetic
  issues.
- If the complaint does not fit any listed category, use "Other".
- Do NOT add any text outside the JSON object.
"""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_llm_json(raw: str) -> Optional[Dict[str, str]]:
    """
    Attempt to parse a JSON object from the LLM response.

    Tolerates common LLM quirks: markdown code fences, trailing text.
    Returns ``None`` if parsing fails.
    """
    # Strip markdown code fences if present
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```\s*$", "", cleaned)

    # Try to find a JSON object
    brace_start = cleaned.find("{")
    brace_end = cleaned.rfind("}")
    if brace_start == -1 or brace_end == -1 or brace_end <= brace_start:
        return None

    json_str = cleaned[brace_start : brace_end + 1]

    try:
        obj = json.loads(json_str)
    except json.JSONDecodeError:
        return None

    # Validate required keys
    required = {"urgency", "category", "summary"}
    if not required.issubset(obj.keys()):
        return None

    if obj["urgency"] not in ("HIGH", "MEDIUM", "LOW"):
        return None

    return obj


def _keyword_fallback(text: str, categories: List[str]) -> TriageResult:
    """
    Rule‑based fallback when LLM triage fails.

    Determines urgency from keyword presence, category from keyword→category
    map, and summary from the first 100 characters.
    """
    if _HIGH_URGENCY_KEYWORDS.search(text):
        urgency = "HIGH"
    elif _MEDIUM_URGENCY_KEYWORDS.search(text):
        urgency = "MEDIUM"
    else:
        urgency = "LOW"

    category = "Other"
    for cat_name, pattern in _CATEGORY_KEYWORDS.items():
        if cat_name in categories and pattern.search(text):
            category = cat_name
            break

    summary = text[:100].replace("\n", " ").strip()
    if len(text) > 100:
        summary += "…"

    return TriageResult(
        urgency=urgency,
        category=category,
        summary=summary,
        raw_llm_response=None,
        used_fallback=True,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def triage_complaint(
    text: str,
    llm_callable: Callable[[str, str], str],
    categories: Optional[List[str]] = None,
    max_retries: int = 1,
) -> TriageResult:
    """
    Classify a citizen complaint by urgency and category.

    Sends the complaint to the provided LLM callable with a strict JSON
    system prompt.  The LLM response is validated: if JSON parsing fails,
    the call is retried up to *max_retries* times, and if it still fails,
    a keyword‑based fallback classifier runs.

    Args:
        text: The raw complaint text.
        llm_callable: ``(system_prompt, user_prompt) -> str``.  The module
            never imports an LLM SDK; the caller wires it up.
        categories: Allowed category labels.  Defaults to the built‑in
            ``DEFAULT_CATEGORIES`` list.
        max_retries: Number of LLM re‑calls on parse failure (default 1).

    Raises:
        InsufficientDataError: if *text* is empty or whitespace.
    """
    if not text or not text.strip():
        raise InsufficientDataError(
            MODULE_NAME,
            "Complaint text is empty; cannot triage.",
        )

    cats = categories or DEFAULT_CATEGORIES
    system_prompt = _TRIAGE_SYSTEM_PROMPT_TEMPLATE.format(
        categories=", ".join(cats)
    )

    attempts = 0
    while attempts <= max_retries:
        try:
            raw = llm_callable(system_prompt, text)
        except Exception:
            attempts += 1
            continue

        parsed = _parse_llm_json(raw)
        if parsed is not None:
            return TriageResult(
                urgency=parsed["urgency"],
                category=parsed["category"],
                summary=parsed["summary"],
                raw_llm_response=raw,
                used_fallback=False,
            )
        attempts += 1

    # All LLM attempts failed — use keyword fallback
    return _keyword_fallback(text, cats)


def cluster_complaints(
    complaints: Sequence[Dict[str, str]],
    similarity_threshold: float = 0.8,
    text_key: str = "text",
    id_key: str = "id",
) -> List[ComplaintCluster]:
    """
    Group near‑duplicate complaints using TF‑IDF cosine similarity.

    Uses single‑linkage clustering: two complaints are in the same cluster
    if their cosine similarity exceeds *similarity_threshold*.  Transitive
    links are followed, so A‑B and B‑C produce one cluster {A, B, C}.

    Args:
        complaints: Sequence of dicts, each containing at least
            ``text_key`` and ``id_key``.
        similarity_threshold: Cosine similarity threshold for linking
            two complaints (default 0.8).
        text_key: Key for complaint text in each dict.
        id_key: Key for complaint ID in each dict.

    Raises:
        InsufficientDataError: if fewer than 2 complaints are provided.
    """
    if len(complaints) < 2:
        raise InsufficientDataError(
            MODULE_NAME,
            f"Need at least 2 complaints for clustering, got "
            f"{len(complaints)}.",
        )

    # Lazy import to avoid hard dependency at module level
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity

    texts = [c[text_key] for c in complaints]
    ids = [c[id_key] for c in complaints]

    vectorizer = TfidfVectorizer(stop_words="english")
    tfidf_matrix = vectorizer.fit_transform(texts)
    sim_matrix = cosine_similarity(tfidf_matrix)

    # --- Single‑linkage clustering via union‑find ---
    n = len(complaints)
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(n):
        for j in range(i + 1, n):
            if sim_matrix[i, j] >= similarity_threshold:
                union(i, j)

    # Group by root
    from collections import defaultdict
    clusters_map: Dict[int, List[int]] = defaultdict(list)
    for idx in range(n):
        clusters_map[find(idx)].append(idx)

    # Only return clusters with > 1 member (actual duplicates)
    results: List[ComplaintCluster] = []
    cluster_id = 0
    for root, members in clusters_map.items():
        if len(members) < 2:
            continue
        member_ids = [ids[m] for m in members]
        scores = [
            float(sim_matrix[members[0], m]) for m in members
        ]
        results.append(ComplaintCluster(
            cluster_id=cluster_id,
            representative_text=texts[members[0]],
            complaint_ids=member_ids,
            similarity_scores=scores,
        ))
        cluster_id += 1

    return results


def to_risk_signals(
    triage_results: List[TriageResult],
    clusters: Optional[List[ComplaintCluster]] = None,
) -> List[RiskSignal]:
    """Convert triage and clustering results into ``RiskSignal`` objects."""
    signals: List[RiskSignal] = []

    for t in triage_results:
        if t.urgency == "HIGH":
            signals.append(RiskSignal(
                signal_type="HIGH_URGENCY_COMPLAINT",
                severity=0.9,
                reason=f"High-urgency complaint: {t.summary}",
                metadata={
                    "category": t.category,
                    "urgency": t.urgency,
                    "used_fallback": t.used_fallback,
                },
            ))

    if clusters:
        for cl in clusters:
            signals.append(RiskSignal(
                signal_type="DUPLICATE_COMPLAINTS",
                severity=min(0.8, 0.3 + 0.1 * len(cl.complaint_ids)),
                reason=(
                    f"{len(cl.complaint_ids)} near-duplicate complaints "
                    f"detected about: {cl.representative_text[:80]}…"
                ),
                metadata={
                    "cluster_id": cl.cluster_id,
                    "complaint_ids": cl.complaint_ids,
                    "count": len(cl.complaint_ids),
                },
            ))

    return signals
