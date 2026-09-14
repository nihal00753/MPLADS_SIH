"""
FAISS Index Builder for MPLADS RAG Pipeline.

Loads CSV datasets, converts rows into searchable text chunks,
embeds them with sentence-transformers, and stores in a FAISS index.
"""

from __future__ import annotations

import csv
import json
import os
import pickle
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "test_data"
INDEX_DIR = Path(__file__).resolve().parent / "_index"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"  # 22MB, runs fast on CPU
CHUNK_BATCH_SIZE = 256  # batch size for embedding

# ---------------------------------------------------------------------------
# Chunking Strategy
# ---------------------------------------------------------------------------

def _format_work_chunk(row: Dict[str, str]) -> str:
    """Convert a single works CSV row into a human-readable text chunk."""
    amt = float(row.get("sanction_amount", 0) or 0)
    phys = row.get("physical_progress_pct", "0")
    fin = row.get("financial_progress_pct", "0")
    return (
        f"Work {row['unique_work_number']}: {row.get('work_name', 'N/A')} "
        f"in {row.get('implementing_district', 'N/A')}, {row.get('state', 'N/A')}. "
        f"MP: {row.get('mp_name', 'N/A')} ({row.get('constituency', 'N/A')}). "
        f"Category: {row.get('work_category', 'N/A')}. "
        f"Sanction Amount: ₹{amt:,.0f}. Status: {row.get('work_status', 'N/A')}. "
        f"Physical Progress: {phys}%, Financial Progress: {fin}%. "
        f"Vendor: {row.get('vendor_name', 'N/A')} ({row.get('vendor_id', 'N/A')}). "
        f"Agency: {row.get('implementing_agency_name', 'N/A')}. "
        f"Anomaly: {'Yes — ' + row.get('anomaly_type', '') if row.get('is_anomaly') == '1' else 'No'}."
    )


def _format_vendor_chunk(row: Dict[str, str]) -> str:
    """Convert a vendor CSV row into a text chunk."""
    return (
        f"Vendor {row.get('vendor_id', 'N/A')}: {row.get('vendor_name', 'N/A')} "
        f"in {row.get('state', 'N/A')}. "
        f"Hub Vendor: {'Yes' if row.get('is_hub') == 'True' else 'No'}. "
        f"PAN: {row.get('pan', 'N/A')}, GSTIN: {row.get('gstin', 'N/A')}."
    )


def _format_mp_chunk(row: Dict[str, str]) -> str:
    """Convert an MP master CSV row into a text chunk."""
    return (
        f"MP: {row.get('mp_name', 'N/A')}, "
        f"Constituency: {row.get('constituency', 'N/A')}, "
        f"State: {row.get('state', 'N/A')}, "
        f"House: {row.get('house_name', 'N/A')}, "
        f"Party: {row.get('party', 'N/A')}."
    )


def _format_payment_chunk(row: Dict[str, str]) -> str:
    """Convert a payment CSV row into a text chunk."""
    amt = float(row.get("payment_amount", 0) or 0)
    return (
        f"Payment for work {row.get('unique_work_number', 'N/A')}: "
        f"₹{amt:,.0f} on {row.get('payment_date', 'N/A')}. "
        f"Type: {row.get('payment_type', 'N/A')}. "
        f"Vendor: {row.get('vendor_id', 'N/A')}."
    )


def _build_summary_chunks(works: List[Dict], vendors: List[Dict], mps: List[Dict]) -> List[Tuple[str, Dict]]:
    """
    Build aggregate summary chunks so the RAG can answer 'how many', 'total', etc.
    These are high-value chunks that will match broad statistical queries.
    """
    from collections import Counter, defaultdict

    total_amt = sum(float(w.get("sanction_amount", 0) or 0) for w in works)
    anomalies = sum(1 for w in works if w.get("is_anomaly") == "1")
    stalled = sum(1 for w in works if w.get("work_status") == "Stalled")
    completed = sum(1 for w in works if w.get("work_status") == "Completed")
    in_progress = sum(1 for w in works if w.get("work_status") == "Work in Progress")
    recommended = sum(1 for w in works if w.get("work_status") == "Recommended")

    hub_count = sum(1 for v in vendors if v.get("is_hub") == "True")

    # State-level aggregation
    state_stats = defaultdict(lambda: {"count": 0, "amount": 0.0, "anomalies": 0, "stalled": 0})
    for w in works:
        st = w.get("state", "Unknown")
        state_stats[st]["count"] += 1
        state_stats[st]["amount"] += float(w.get("sanction_amount", 0) or 0)
        if w.get("is_anomaly") == "1":
            state_stats[st]["anomalies"] += 1
        if w.get("work_status") == "Stalled":
            state_stats[st]["stalled"] += 1

    # Category aggregation
    cat_stats = defaultdict(lambda: {"count": 0, "amount": 0.0})
    for w in works:
        cat = w.get("work_category", "Other")
        cat_stats[cat]["count"] += 1
        cat_stats[cat]["amount"] += float(w.get("sanction_amount", 0) or 0)

    # MP aggregation
    mp_stats = defaultdict(lambda: {"count": 0, "amount": 0.0, "anomalies": 0})
    for w in works:
        mp = w.get("mp_name", "Unknown")
        mp_stats[mp]["count"] += 1
        mp_stats[mp]["amount"] += float(w.get("sanction_amount", 0) or 0)
        if w.get("is_anomaly") == "1":
            mp_stats[mp]["anomalies"] += 1

    # Anomaly type breakdown
    anom_types = Counter(w.get("anomaly_type") for w in works if w.get("is_anomaly") == "1" and w.get("anomaly_type"))

    chunks = []

    # Official Scheme Guidelines & Policies
    chunks.append((
        "MPLADS Scheme Guidelines — Annual Entitlement & Release Mechanism: "
        "The annual entitlement of each Member of Parliament (both Lok Sabha and Rajya Sabha) is ₹5.00 Crore per annum (₹500 Lakh). "
        "The Ministry of Statistics and Programme Implementation (MoSPI) releases funds directly to the designated Nodal District Authority "
        "in two equal installments of ₹2.50 Crore each per financial year. Funds released under MPLADS are non-lapsable. "
        "The District Authority is responsible for overall coordination, technical sanction, and execution of works.",
        {"type": "guidelines", "topic": "annual_entitlement"}
    ))
    chunks.append((
        "MPLADS Guidelines — Work Splitting & Split-Invoicing Rules: "
        "Under the General Financial Rules (GFR) and MPLADS operational guidelines, work splitting is strictly prohibited. "
        "A single large project cannot be fragmented or split into multiple smaller estimates or invoices (such as below ₹25 Lakh or ₹50 Lakh) "
        "to avoid open competitive e-tendering or circumvent administrative/technical approval limits. "
        "When identical or contiguous works in the same location are awarded to the same contractor under separate sub-₹25L sanctions, "
        "the AI auditing system raises a High Severity Split-Invoicing Anomaly flag.",
        {"type": "guidelines", "topic": "split_invoicing"}
    ))
    chunks.append((
        "MPLADS Guidelines — Eligible and Ineligible Works: "
        "Permissible works under MPLADS must create durable community assets of public utility in sectors such as: "
        "drinking water facilities, public healthcare infrastructure, government schools and libraries, sanitation/public toilets, "
        "rural roads, culverts, and crematoriums. Prohibited works include: private properties, commercial enterprises, "
        "religious places, purchase of movable inventory, grants/loans to individuals, and recurring administrative expenditure.",
        {"type": "guidelines", "topic": "eligible_works"}
    ))
    chunks.append((
        "MPLADS Guidelines — SC/ST Mandatory Allocation: "
        "To ensure inclusive development, every MP must recommend works costing at least 15% of the total annual entitlement (₹75 Lakh) "
        "for areas inhabited by Scheduled Caste (SC) population and at least 7.5% (₹37.5 Lakh) for areas inhabited by Scheduled Tribe (ST) population. "
        "The District Authority enforces compliance with these mandatory statutory thresholds.",
        {"type": "guidelines", "topic": "sc_st_allocation"}
    ))

    # Global overview
    chunks.append((
        f"MPLADS Platform Global Overview: "
        f"Total works: {len(works)}. Total sanctioned amount: ₹{total_amt/1e7:.2f} Crore (₹{total_amt:,.0f}). "
        f"Total MPs tracked: {len(mps)}. Total vendors: {len(vendors)} (Hub vendors: {hub_count}). "
        f"Total anomalous works: {anomalies} (Anomaly rate: {anomalies/len(works)*100:.1f}%). "
        f"Stalled works: {stalled}. Completed works: {completed}. "
        f"In-progress works: {in_progress}. Recommended works: {recommended}.",
        {"type": "summary", "scope": "global"}
    ))

    # Status distribution
    status_counts = Counter(w.get("work_status", "Unknown") for w in works)
    status_text = ", ".join(f"{s}: {c}" for s, c in status_counts.most_common())
    chunks.append((
        f"Work Status Distribution: {status_text}.",
        {"type": "summary", "scope": "status"}
    ))

    # Anomaly types
    if anom_types:
        anom_text = ", ".join(f"{t}: {c}" for t, c in anom_types.most_common())
        chunks.append((
            f"Anomaly Type Breakdown across all works: {anom_text}. "
            f"Total anomalous works: {anomalies} out of {len(works)} ({anomalies/len(works)*100:.1f}%).",
            {"type": "summary", "scope": "anomaly_types"}
        ))

    # Per-state summaries
    for state, stats in sorted(state_stats.items(), key=lambda x: x[1]["count"], reverse=True):
        chunks.append((
            f"State: {state} — Works: {stats['count']}, "
            f"Total Sanctioned: ₹{stats['amount']/1e7:.2f} Crore, "
            f"Anomalies: {stats['anomalies']} ({stats['anomalies']/stats['count']*100:.1f}% rate), "
            f"Stalled: {stats['stalled']}.",
            {"type": "summary", "scope": "state", "state": state}
        ))

    # Per-category summaries
    for cat, stats in sorted(cat_stats.items(), key=lambda x: x[1]["count"], reverse=True):
        chunks.append((
            f"Work Category: {cat} — Total works: {stats['count']}, "
            f"Total sanctioned: ₹{stats['amount']/1e7:.2f} Crore.",
            {"type": "summary", "scope": "category", "category": cat}
        ))

    # Top MPs by works
    top_mps = sorted(mp_stats.items(), key=lambda x: x[1]["count"], reverse=True)[:30]
    for mp, stats in top_mps:
        chunks.append((
            f"MP: {mp} — Total works: {stats['count']}, "
            f"Total sanctioned: ₹{stats['amount']/1e7:.2f} Crore, "
            f"Anomalies: {stats['anomalies']}.",
            {"type": "summary", "scope": "mp", "mp_name": mp}
        ))

    return chunks


# ---------------------------------------------------------------------------
# Index Builder
# ---------------------------------------------------------------------------

def _load_csv(filename: str) -> List[Dict[str, str]]:
    """Load a CSV file from the data directory."""
    p = DATA_DIR / filename
    if not p.exists():
        return []
    with open(p, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def build_index(force_rebuild: bool = False) -> Tuple[Any, List[str], List[Dict]]:
    """
    Build or load the FAISS index.

    Returns:
        (faiss_index, chunks_text_list, chunks_metadata_list)
    """
    import faiss

    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    index_path = INDEX_DIR / "faiss.index"
    chunks_path = INDEX_DIR / "chunks.pkl"
    meta_path = INDEX_DIR / "metadata.pkl"

    # Check if cached index exists
    if not force_rebuild and index_path.exists() and chunks_path.exists() and meta_path.exists():
        print("[RAG Indexer] Loading cached FAISS index...")
        index = faiss.read_index(str(index_path))
        with open(chunks_path, "rb") as f:
            chunks_text = pickle.load(f)
        with open(meta_path, "rb") as f:
            chunks_meta = pickle.load(f)
        print(f"[RAG Indexer] Loaded {index.ntotal} vectors from cache.")
        return index, chunks_text, chunks_meta

    print("[RAG Indexer] Building new FAISS index from CSV data...")
    t0 = time.time()

    # Load datasets
    works = _load_csv("mplads_synthetic_works.csv")
    vendors = _load_csv("mplads_synthetic_vendors.csv")
    mps = _load_csv("mplads_mp_master_real.csv")
    payments = _load_csv("mplads_synthetic_payments.csv")

    print(f"[RAG Indexer] Loaded: {len(works)} works, {len(vendors)} vendors, {len(mps)} MPs, {len(payments)} payments")

    # Build chunks
    chunks_text: List[str] = []
    chunks_meta: List[Dict] = []

    # Summary chunks (highest priority)
    for text, meta in _build_summary_chunks(works, vendors, mps):
        chunks_text.append(text)
        chunks_meta.append(meta)

    # Individual work chunks
    for w in works:
        chunks_text.append(_format_work_chunk(w))
        chunks_meta.append({
            "type": "work",
            "work_id": w.get("unique_work_number", ""),
            "state": w.get("state", ""),
            "mp_name": w.get("mp_name", ""),
            "category": w.get("work_category", ""),
            "is_anomaly": w.get("is_anomaly", "0"),
        })

    # Vendor chunks
    for v in vendors:
        chunks_text.append(_format_vendor_chunk(v))
        chunks_meta.append({
            "type": "vendor",
            "vendor_id": v.get("vendor_id", ""),
            "state": v.get("state", ""),
        })

    # MP chunks
    for m in mps:
        chunks_text.append(_format_mp_chunk(m))
        chunks_meta.append({
            "type": "mp",
            "mp_name": m.get("mp_name", ""),
            "state": m.get("state", ""),
        })

    print(f"[RAG Indexer] Created {len(chunks_text)} text chunks. Embedding...")

    # Embed with sentence-transformers
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(EMBEDDING_MODEL)
    embeddings = model.encode(
        chunks_text,
        batch_size=CHUNK_BATCH_SIZE,
        show_progress_bar=True,
        normalize_embeddings=True,
    )
    embeddings = np.array(embeddings, dtype=np.float32)

    # Build FAISS index (Inner Product since embeddings are normalized = cosine)
    dim = embeddings.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(embeddings)

    # Save to disk
    faiss.write_index(index, str(index_path))
    with open(chunks_path, "wb") as f:
        pickle.dump(chunks_text, f)
    with open(meta_path, "wb") as f:
        pickle.dump(chunks_meta, f)

    elapsed = time.time() - t0
    print(f"[RAG Indexer] Index built: {index.ntotal} vectors, dim={dim}, took {elapsed:.1f}s")

    return index, chunks_text, chunks_meta


# ---------------------------------------------------------------------------
# Entry point for standalone build
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    build_index(force_rebuild=True)
    print("[RAG Indexer] Done.")
