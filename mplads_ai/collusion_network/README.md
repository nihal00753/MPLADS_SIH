# Collusion / Network Analysis

## What it does

Detects potential vendor–official collusion in the MPLADS system through a two-phase approach:

1. **Entity resolution** — merges vendor records that represent the same real-world organisation registered differently across districts (exact PAN/GSTIN match → fuzzy name matching).
2. **Co-occurrence analysis** — builds a bipartite vendor–official graph and flags clusters where the same vendor–official pairs co-occur at rates significantly above a random-assignment baseline.

Phase 1 is a **mandatory prerequisite** for Phase 2. Running graph analysis on unresolved duplicate entities produces false positives that are artifacts of bad matching.

### Capabilities

| Function | Purpose |
|---|---|
| `resolve_entities()` | Merge duplicate vendor records (PAN → GSTIN → fuzzy name) |
| `build_cooccurrence_graph()` | Build vendor–official co-occurrence edges with scoring |
| `detect_collusion_clusters()` | Connected-component clustering on high-score edges |
| `to_risk_signals()` | Convert clusters into uniform `RiskSignal` objects |

## Known false-positive / false-negative failure modes

| Mode | Description |
|---|---|
| **False positive (entity resolution)** | Two genuinely different vendors with similar names (e.g., "Sharma Constructions" and "Sharma Construction Co.") may be incorrectly merged |
| **False positive (collusion)** | In small districts with few officials, all vendors naturally share the same approving officer — co-occurrence is high but benign |
| **False negative (entity resolution)** | Vendors with completely different names but the same beneficial owner (shell companies) will not be detected without ownership data |
| **False negative (collusion)** | Sophisticated collusion rings that rotate officials or use intermediaries won't produce co-occurrence spikes |
| **Blind spot** | Missing or incorrect PAN/GSTIN data reduces entity resolution accuracy; the module assumes these identifiers are valid when present |

## v1 → v2 migration path

| Change | Details |
|---|---|
| **Entity resolution** | Replace `difflib.SequenceMatcher` with a phonetic matcher (Soundex/Metaphone) for transliteration variants, and add address similarity |
| **Graph analysis** | Use `networkx` or a graph database for PageRank-based centrality scoring and community detection (Louvain) |
| **Ownership data** | Integrate MCA (Ministry of Corporate Affairs) director data to detect shell-company networks sharing directors |
| **Temporal patterns** | Add time-series analysis: flag vendors that always win contracts just before elections or budget deadlines |
| **Scale** | Move from O(n²) pairwise resolution to blocking/indexing strategies for large vendor registries |
