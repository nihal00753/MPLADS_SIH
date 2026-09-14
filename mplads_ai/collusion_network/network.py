"""
Vendor/collusion network analysis for the MPLADS platform.

Provides two sequential phases:

1. **Entity resolution** — merges vendor records that represent the same
   real‑world organization registered under different names or in different
   districts.  Resolution uses exact PAN / GSTIN matching first (high
   confidence), then falls back to fuzzy name matching via
   ``difflib.SequenceMatcher`` for remaining unmatched records.

2. **Co‑occurrence / collusion detection** — builds a bipartite graph of
   resolved vendor entities and approving officials, then flags clusters
   where the same vendor–official pairs co‑occur at rates significantly
   above the random‑assignment baseline.

Phase 1 is a *mandatory prerequisite* for Phase 2.  Running graph analysis
on unresolved duplicate entities produces false positives that are
artifacts of bad matching, not genuine collusion signals.

Known limitations (v1):
- Fuzzy name matching with ``SequenceMatcher`` is adequate for typos and
  transliteration variants but misses phonetic similarities across
  scripts (e.g. Hindi ↔ English transliterations).
- The co‑occurrence baseline assumes uniform random assignment of vendors
  to officials, which may over‑flag in small districts with few officials.
- The graph uses Python dict‑based adjacency lists, not ``networkx``, to
  avoid an external dependency.  This is fine for thousands of nodes but
  would need replacing for very large datasets.

Dependencies: none beyond the Python standard library.
"""

from __future__ import annotations

import difflib
import re
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from mplads_ai.common.types import InsufficientDataError, RiskSignal

MODULE_NAME = "collusion_network"


# ---------------------------------------------------------------------------
# Data‑transfer objects
# ---------------------------------------------------------------------------

@dataclass
class VendorRecord:
    """Raw vendor registration record."""
    vendor_id: str
    name: str
    pan: Optional[str] = None
    gstin: Optional[str] = None
    district: Optional[str] = None
    registration_date: Optional[str] = None


@dataclass
class ResolvedEntity:
    """Group of vendor records resolved to the same real‑world entity."""
    canonical_id: str
    member_ids: List[str]
    match_reasons: List[str]


@dataclass
class ProjectAssignment:
    """Records which resolved vendor entity worked on which project,
    approved by which official."""
    project_id: str
    entity_id: str       # resolved (canonical) entity ID
    official_id: str     # approving official


@dataclass
class CooccurrenceEdge:
    """One edge in the vendor–official co‑occurrence graph."""
    entity_a_id: str     # vendor entity
    entity_b_id: str     # another vendor entity
    shared_official_ids: List[str]
    project_count: int
    cooccurrence_score: float


@dataclass
class CollusionCluster:
    """A flagged cluster of vendors and officials co‑occurring at unusual rates."""
    cluster_id: int
    entity_ids: List[str]
    official_ids: List[str]
    risk_score: float
    reasons: List[str]


# ---------------------------------------------------------------------------
# Phase 1 — Entity Resolution
# ---------------------------------------------------------------------------

def _normalise(value: Optional[str]) -> Optional[str]:
    """Strip, uppercase, remove common noise characters."""
    if value is None:
        return None
    cleaned = value.strip().upper().replace(" ", "").replace("-", "")
    return cleaned if cleaned else None


_LEGAL_SUFFIXES_RE = re.compile(
    r"\b(pvt\.?\s*ltd\.?|private\s+limited|ltd\.?|limited|llp|inc\.?|corp(\.|oration)?|co\.?)\b",
    re.IGNORECASE,
)


def _clean_company_name(name: str) -> str:
    """
    Strip common legal-form suffixes and punctuation for robust fuzzy matching.
    Prevents false merges between unrelated companies sharing generic corporate forms.
    """
    cleaned = _LEGAL_SUFFIXES_RE.sub("", name)
    cleaned = re.sub(r"[^\w\s]", " ", cleaned)
    return " ".join(cleaned.lower().split())


def resolve_entities(
    vendors: Sequence[VendorRecord],
    name_similarity_threshold: float = 0.85,
) -> List[ResolvedEntity]:
    """
    Merge vendor records that represent the same real‑world organisation.

    Resolution strategy (in priority order):
    1. **Exact PAN match** — two records with the same PAN (ignoring
       whitespace/case) are merged unconditionally.
    2. **Exact GSTIN match** — same logic for GSTIN.
    3. **Fuzzy name match** — ``difflib.SequenceMatcher`` ratio ≥
       *name_similarity_threshold* (default 0.85).

    Steps 1‑2 run first to create high‑confidence clusters.  Step 3
    only compares records that are still unmerged, to avoid doubling
    up on already‑resolved pairs.

    Args:
        vendors: Raw vendor records.
        name_similarity_threshold: SequenceMatcher ratio threshold
            (0‑1, default 0.85).  Higher = stricter.

    Raises:
        InsufficientDataError: if fewer than 2 vendors are provided.
    """
    if len(vendors) < 2:
        raise InsufficientDataError(
            MODULE_NAME,
            f"Need at least 2 vendor records for entity resolution, "
            f"got {len(vendors)}.",
        )

    n = len(vendors)

    # Union‑find
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

    # Track match reasons per pair
    match_reasons: Dict[Tuple[int, int], List[str]] = defaultdict(list)

    # --- Pass 1: exact PAN ---
    pan_index: Dict[str, List[int]] = defaultdict(list)
    for i, v in enumerate(vendors):
        norm_pan = _normalise(v.pan)
        if norm_pan and len(norm_pan) == 10:  # valid PAN is 10 chars
            pan_index[norm_pan].append(i)

    for pan, indices in pan_index.items():
        for k in range(1, len(indices)):
            pair = (min(indices[0], indices[k]), max(indices[0], indices[k]))
            match_reasons[pair].append(f"Exact PAN match: {pan}")
            union(indices[0], indices[k])

    # --- Pass 2: exact GSTIN ---
    gstin_index: Dict[str, List[int]] = defaultdict(list)
    for i, v in enumerate(vendors):
        norm_gstin = _normalise(v.gstin)
        if norm_gstin and len(norm_gstin) == 15:  # valid GSTIN is 15 chars
            gstin_index[norm_gstin].append(i)

    for gstin, indices in gstin_index.items():
        for k in range(1, len(indices)):
            pair = (min(indices[0], indices[k]), max(indices[0], indices[k]))
            match_reasons[pair].append(f"Exact GSTIN match: {gstin}")
            union(indices[0], indices[k])

    # --- Pass 3: fuzzy name matching (only for still-unmerged pairs) ---
    for i in range(n):
        for j in range(i + 1, n):
            if find(i) == find(j):
                continue  # already merged
            clean_i = _clean_company_name(vendors[i].name)
            clean_j = _clean_company_name(vendors[j].name)
            ratio_clean = (
                difflib.SequenceMatcher(None, clean_i, clean_j).ratio()
                if (clean_i and clean_j) else 0.0
            )
            ratio_raw = difflib.SequenceMatcher(
                None,
                vendors[i].name.lower().strip(),
                vendors[j].name.lower().strip(),
            ).ratio()
            # If cleaned names exist, require high similarity on both or cleaned
            ratio = ratio_clean if (clean_i and clean_j) else ratio_raw
            if ratio >= name_similarity_threshold:
                pair = (i, j)
                match_reasons[pair].append(
                    f"Fuzzy name match: '{vendors[i].name}' ↔ "
                    f"'{vendors[j].name}' (similarity {ratio:.2f})"
                )
                union(i, j)

    # Build resolved entities
    groups: Dict[int, List[int]] = defaultdict(list)
    for i in range(n):
        groups[find(i)].append(i)

    results: List[ResolvedEntity] = []
    for root, members in groups.items():
        member_ids = [vendors[m].vendor_id for m in members]

        # Collect all match reasons for this group
        reasons: List[str] = []
        for i_idx in range(len(members)):
            for j_idx in range(i_idx + 1, len(members)):
                pair = (
                    min(members[i_idx], members[j_idx]),
                    max(members[i_idx], members[j_idx]),
                )
                reasons.extend(match_reasons.get(pair, []))

        if len(members) == 1:
            reasons = ["No match found; unique entity."]

        results.append(ResolvedEntity(
            canonical_id=vendors[root].vendor_id,
            member_ids=member_ids,
            match_reasons=reasons,
        ))

    return results


# ---------------------------------------------------------------------------
# Phase 2 — Co‑occurrence / Collusion Detection
# ---------------------------------------------------------------------------

def build_cooccurrence_graph(
    resolved_entities: List[ResolvedEntity],
    assignments: Sequence[ProjectAssignment],
    min_shared_projects: int = 2,
) -> List[CooccurrenceEdge]:
    """
    Build a co‑occurrence graph between resolved vendor entities based
    on shared approving officials.

    Two vendor entities are linked when they share the same approving
    official across *min_shared_projects* or more projects.  The
    co‑occurrence score is the observed co‑occurrence rate relative to
    a baseline that assumes random official assignment.

    Args:
        resolved_entities: Output of ``resolve_entities``.
        assignments: List of project→entity→official mappings.
        min_shared_projects: Minimum shared-official project count to
            create an edge (default 2).

    Returns:
        List of ``CooccurrenceEdge`` objects.

    Raises:
        InsufficientDataError: if fewer than 2 assignments are provided.
    """
    if len(assignments) < 2:
        raise InsufficientDataError(
            MODULE_NAME,
            f"Need at least 2 project assignments for co-occurrence "
            f"analysis, got {len(assignments)}.",
        )

    # Map: official_id → set of entity_ids they approved
    official_to_entities: Dict[str, Set[str]] = defaultdict(set)
    # Map: (entity_id, official_id) → project count
    entity_official_projects: Dict[Tuple[str, str], int] = defaultdict(int)

    total_projects = len(assignments)
    entity_project_count: Dict[str, int] = defaultdict(int)

    for a in assignments:
        official_to_entities[a.official_id].add(a.entity_id)
        entity_official_projects[(a.entity_id, a.official_id)] += 1
        entity_project_count[a.entity_id] += 1

    # Build edges: for each pair of entities sharing an official
    edge_map: Dict[Tuple[str, str], Dict] = {}

    for official_id, entity_set in official_to_entities.items():
        entities = sorted(entity_set)
        for i in range(len(entities)):
            for j in range(i + 1, len(entities)):
                pair = (entities[i], entities[j])
                if pair not in edge_map:
                    edge_map[pair] = {
                        "shared_officials": set(),
                        "project_count": 0,
                    }
                edge_map[pair]["shared_officials"].add(official_id)
                # Count shared projects via this official
                shared = min(
                    entity_official_projects[(entities[i], official_id)],
                    entity_official_projects[(entities[j], official_id)],
                )
                edge_map[pair]["project_count"] += shared

    # Compute co-occurrence score
    total_officials = len(official_to_entities)
    edges: List[CooccurrenceEdge] = []

    for (ent_a, ent_b), data in edge_map.items():
        if data["project_count"] < min_shared_projects:
            continue

        # Baseline: probability of sharing an official if random
        # P(share) ≈ projects_a * projects_b / (total * total_officials)
        pa = entity_project_count.get(ent_a, 1)
        pb = entity_project_count.get(ent_b, 1)
        expected = (pa * pb) / max(total_projects * max(total_officials, 1), 1)
        observed = data["project_count"]
        score = min(1.0, observed / max(expected, 0.01))

        edges.append(CooccurrenceEdge(
            entity_a_id=ent_a,
            entity_b_id=ent_b,
            shared_official_ids=sorted(data["shared_officials"]),
            project_count=observed,
            cooccurrence_score=round(score, 4),
        ))

    return edges


def detect_collusion_clusters(
    edges: List[CooccurrenceEdge],
    min_score: float = 0.7,
) -> List[CollusionCluster]:
    """
    Identify connected components of high‑scoring co‑occurrence edges
    as potential collusion clusters.

    Uses a simple union‑find on edges with ``cooccurrence_score >= min_score``.

    Args:
        edges: Output of ``build_cooccurrence_graph``.
        min_score: Minimum co‑occurrence score to include an edge
            (default 0.7).

    Returns:
        List of ``CollusionCluster`` objects.  Empty if no edges
        meet the threshold.
    """
    if not edges:
        return []

    # Filter edges
    high_edges = [e for e in edges if e.cooccurrence_score >= min_score]
    if not high_edges:
        return []

    # Collect all entity IDs
    all_entities: List[str] = sorted(set(
        eid for e in high_edges for eid in (e.entity_a_id, e.entity_b_id)
    ))
    idx = {eid: i for i, eid in enumerate(all_entities)}
    n = len(all_entities)

    # Union‑find
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

    # Aggregate officials per edge
    cluster_officials: Dict[int, Set[str]] = defaultdict(set)
    cluster_reasons: Dict[int, List[str]] = defaultdict(list)

    for e in high_edges:
        ia, ib = idx[e.entity_a_id], idx[e.entity_b_id]
        union(ia, ib)

    # Rebuild groups after all unions
    groups: Dict[int, List[int]] = defaultdict(list)
    for i in range(n):
        groups[find(i)].append(i)

    # Collect officials and reasons per group
    for e in high_edges:
        root = find(idx[e.entity_a_id])
        cluster_officials[root].update(e.shared_official_ids)
        cluster_reasons[root].append(
            f"Vendors '{e.entity_a_id}' and '{e.entity_b_id}' share "
            f"{len(e.shared_official_ids)} official(s) across "
            f"{e.project_count} project(s) "
            f"(score: {e.cooccurrence_score:.2f})."
        )

    results: List[CollusionCluster] = []
    cluster_id = 0
    for root, members in groups.items():
        if len(members) < 2:
            continue
        entity_ids = [all_entities[m] for m in members]
        officials = sorted(cluster_officials.get(root, set()))
        reasons = cluster_reasons.get(root, [])

        # Average score of edges in this cluster
        cluster_edge_scores = [
            e.cooccurrence_score for e in high_edges
            if find(idx[e.entity_a_id]) == root
        ]
        avg_score = (
            sum(cluster_edge_scores) / len(cluster_edge_scores)
            if cluster_edge_scores else 0.0
        )

        results.append(CollusionCluster(
            cluster_id=cluster_id,
            entity_ids=entity_ids,
            official_ids=officials,
            risk_score=round(min(1.0, avg_score), 3),
            reasons=reasons,
        ))
        cluster_id += 1

    return results


def to_risk_signals(
    clusters: List[CollusionCluster],
) -> List[RiskSignal]:
    """Convert collusion clusters into uniform ``RiskSignal`` objects."""
    signals: List[RiskSignal] = []
    for cl in clusters:
        signals.append(RiskSignal(
            signal_type="COLLUSION_CLUSTER",
            severity=cl.risk_score,
            reason=(
                f"Potential collusion cluster: {len(cl.entity_ids)} vendor "
                f"entities and {len(cl.official_ids)} official(s) co-occur "
                f"at unusual rates (risk score {cl.risk_score:.2f})."
            ),
            metadata={
                "cluster_id": cl.cluster_id,
                "entity_ids": cl.entity_ids,
                "official_ids": cl.official_ids,
                "reasons": cl.reasons,
            },
        ))
    return signals
