"""
End-to-end data ingestion orchestrator for the MPLADS AI/ML pipeline.

Chains together:
  harmonizer → normalizer → validator → datastore refresh

Produces an ``IngestionReport`` summarizing what was ingested, cleaned,
validated, quarantined, and what risk signals were emitted.
"""

from __future__ import annotations

import csv
import logging
import time
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, BinaryIO, Dict, List, Optional, Union

from mplads_ai.common.types import RiskSignal
from mplads_ai.pipeline.harmonizer import harmonize_columns, read_raw_file
from mplads_ai.pipeline.normalizer import (
    build_reference_lists_from_mp_master,
    normalize_currency,
    normalize_date,
    normalize_geography,
)
from mplads_ai.pipeline.validator import (
    QuarantineRecord,
    ValidationResult,
    persist_quarantine_to_disk,
    validate_batch,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data Directory (same as app.py)
# ---------------------------------------------------------------------------

DATA_DIR = Path(r"d:\MPLADS AIML\test_data")

# Columns that hold currency values
_CURRENCY_COLUMNS = {
    "sanction_amount",
    "payment_amount",
    "category_benchmark_min",
    "category_benchmark_max",
}

# Columns that hold date values
_DATE_COLUMNS = {
    "date_of_receipt_of_work_proposal_from_mp",
    "date_of_administrative_approval",
    "payment_date",
}

# Columns that hold percentage values (0-100)
_PCT_COLUMNS = {
    "physical_progress_pct",
    "financial_progress_pct",
}


# ---------------------------------------------------------------------------
# Ingestion Report
# ---------------------------------------------------------------------------

@dataclass
class IngestionReport:
    """Summary of an ingestion run."""
    task_id: str
    total_rows_read: int = 0
    rows_harmonized: int = 0
    rows_normalized: int = 0
    rows_validated: int = 0
    rows_quarantined: int = 0
    valid_rows: List[Dict[str, Any]] = field(default_factory=list, repr=False)
    quarantine_records: List[QuarantineRecord] = field(default_factory=list)
    quarantine_file_path: Optional[str] = None
    warnings: List[str] = field(default_factory=list)
    benchmarks_computed: Dict[str, Dict[str, float]] = field(default_factory=dict)
    risk_signals_emitted: List[RiskSignal] = field(default_factory=list)
    duration_seconds: float = 0.0
    status: str = "pending"  # pending | running | completed | completed_with_warnings | failed
    error_message: Optional[str] = None

    def to_dict(self, include_valid_rows: bool = False) -> Dict[str, Any]:
        d = asdict(self)
        if not include_valid_rows:
            d.pop("valid_rows", None)
        # Convert RiskSignal dataclasses to dicts
        d["risk_signals_emitted"] = [
            s.to_dict() if hasattr(s, "to_dict") else s
            for s in self.risk_signals_emitted
        ]
        return d


# ---------------------------------------------------------------------------
# Reference Data Loader
# ---------------------------------------------------------------------------

def _load_mp_master(data_dir: Path) -> List[Dict[str, str]]:
    """Load the MP master CSV for geography reference lists."""
    mp_path = data_dir / "mplads_mp_master_real.csv"
    if not mp_path.exists():
        logger.warning("MP master file not found at %s", mp_path)
        return []
    with open(mp_path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


# ---------------------------------------------------------------------------
# Normalization Stage
# ---------------------------------------------------------------------------

def _normalize_rows(
    rows: List[Dict[str, str]],
    ref_lists: Dict[str, List[str]],
) -> List[Dict[str, str]]:
    """
    Apply currency, date, geography, and percentage normalization
    to all rows in place (returns the same list, mutated).
    """
    for row in rows:
        # --- Currency normalization ---
        for col in _CURRENCY_COLUMNS:
            if col in row and row[col]:
                normalized = normalize_currency(row[col])
                if normalized is not None:
                    row[col] = str(normalized)

        # --- Date normalization ---
        for col in _DATE_COLUMNS:
            if col in row and row[col]:
                normalized = normalize_date(row[col])
                if normalized is not None:
                    row[col] = normalized

        # --- Percentage coercion (ensure string-to-float-to-string) ---
        for col in _PCT_COLUMNS:
            if col in row and row[col]:
                try:
                    cleaned_pct = str(row[col]).rstrip("%").strip()
                    val = float(cleaned_pct)
                    row[col] = str(val)
                except (ValueError, TypeError):
                    pass

        # --- Geography normalization ---
        if "state" in row and row["state"] and ref_lists.get("states"):
            matched = normalize_geography(
                row["state"], ref_lists["states"], threshold=0.80
            )
            if matched:
                row["state"] = matched

        if "nodal_district" in row and row["nodal_district"] and ref_lists.get("districts"):
            matched = normalize_geography(
                row["nodal_district"], ref_lists["districts"], threshold=0.80
            )
            if matched:
                row["nodal_district"] = matched

        if "implementing_district" in row and row["implementing_district"] and ref_lists.get("districts"):
            matched = normalize_geography(
                row["implementing_district"], ref_lists["districts"], threshold=0.80
            )
            if matched:
                row["implementing_district"] = matched

        if "constituency" in row and row["constituency"] and ref_lists.get("constituencies"):
            matched = normalize_geography(
                row["constituency"], ref_lists["constituencies"], threshold=0.80
            )
            if matched:
                row["constituency"] = matched

    return rows


# ---------------------------------------------------------------------------
# Benchmark Computation
# ---------------------------------------------------------------------------

def _compute_benchmarks(
    valid_rows: List[Dict[str, Any]],
) -> Dict[str, Dict[str, float]]:
    """
    Compute category cost benchmarks from validated rows.

    If rows already have ``category_benchmark_min`` / ``category_benchmark_max``,
    those are used.  Otherwise, benchmarks are computed from the distribution
    of ``sanction_amount`` per ``work_category``.
    """
    benchmarks: Dict[str, Dict[str, float]] = {}

    # First pass: use explicit benchmark columns if available
    for row in valid_rows:
        cat = row.get("work_category") or ""
        if not cat or cat in benchmarks:
            continue
        b_min = row.get("category_benchmark_min")
        b_max = row.get("category_benchmark_max")
        if b_min is not None and b_max is not None:
            try:
                b_min_f = float(b_min)
                b_max_f = float(b_max)
                benchmarks[cat] = {
                    "min": b_min_f,
                    "max": b_max_f,
                    "median": (b_min_f + b_max_f) / 2.0,
                }
            except (ValueError, TypeError):
                pass

    # Second pass: compute from sanction_amount distribution for missing categories
    cat_amounts: Dict[str, List[float]] = defaultdict(list)
    for row in valid_rows:
        cat = row.get("work_category") or ""
        if cat and cat not in benchmarks:
            amt = row.get("sanction_amount")
            if amt is not None:
                try:
                    cat_amounts[cat].append(float(amt))
                except (ValueError, TypeError):
                    pass

    for cat, amounts in cat_amounts.items():
        if amounts:
            amounts_sorted = sorted(amounts)
            n = len(amounts_sorted)
            median = amounts_sorted[n // 2]
            benchmarks[cat] = {
                "min": amounts_sorted[0],
                "max": amounts_sorted[-1],
                "median": median,
            }

    return benchmarks


# ---------------------------------------------------------------------------
# Auto-generate Vendor IDs
# ---------------------------------------------------------------------------

_VENDOR_ID_COUNTER = 0


def _auto_generate_vendor_ids(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    For rows that have a ``vendor_name`` but no ``vendor_id``, generate a
    deterministic ID based on the vendor name.
    """
    global _VENDOR_ID_COUNTER
    name_to_id: Dict[str, str] = {}

    for row in rows:
        vid = row.get("vendor_id") or ""
        vname = row.get("vendor_name") or ""
        if vid and vid.strip():
            name_to_id[vname.lower().strip()] = vid.strip()

    for row in rows:
        vid = row.get("vendor_id") or ""
        vname = row.get("vendor_name") or ""
        if (not vid or not vid.strip()) and vname.strip():
            key = vname.lower().strip()
            if key not in name_to_id:
                _VENDOR_ID_COUNTER += 1
                name_to_id[key] = f"V_AUTO_{_VENDOR_ID_COUNTER:05d}"
            row["vendor_id"] = name_to_id[key]

    return rows


# ---------------------------------------------------------------------------
# Main Pipeline Entry Point
# ---------------------------------------------------------------------------

def ingest_unorganized_dataset(
    file_path_or_buffer: Union[str, Path, BinaryIO],
    file_type: str = "auto",
    reference_data_dir: Optional[Path] = None,
    task_id: Optional[str] = None,
    quarantine_dir: Optional[Path] = None,
) -> IngestionReport:
    """
    End-to-end ingestion pipeline for unorganized MPLADS data.

    Stages:
        1. Read raw file (CSV / TSV / XLSX / JSON)
        2. Harmonize column names to canonical schema
        3. Normalize currency, dates, geography
        4. Validate and split into valid + quarantined
        5. Compute category benchmarks
        6. Auto-generate missing vendor IDs
        7. Persist quarantine to disk

    Args:
        file_path_or_buffer: Path to a file or a file-like buffer.
        file_type: ``"auto"`` | ``"csv"`` | ``"tsv"`` | ``"xlsx"`` | ``"json"``.
        reference_data_dir: Directory containing ``mplads_mp_master_real.csv``
            for geography normalization.  Defaults to ``test_data/``.
        task_id: Optional task ID for tracking.  Auto-generated if not provided.
        quarantine_dir: Directory to persist quarantine records.
            Defaults to ``test_data/quarantine/``.

    Returns:
        An ``IngestionReport`` with full pipeline statistics.
    """
    if task_id is None:
        task_id = str(uuid.uuid4())[:8]

    report = IngestionReport(task_id=task_id, status="running")
    start = time.time()

    try:
        # --- Stage 1: Read raw file ---
        logger.info("[%s] Stage 1: Reading raw file...", task_id)
        raw_rows = read_raw_file(file_path_or_buffer, file_type=file_type)
        report.total_rows_read = len(raw_rows)
        logger.info("[%s] Read %d raw rows", task_id, len(raw_rows))

        if not raw_rows:
            report.status = "completed"
            report.duration_seconds = round(time.time() - start, 3)
            return report

        # --- Stage 2: Harmonize columns ---
        logger.info("[%s] Stage 2: Harmonizing column names...", task_id)
        harmonized_rows = harmonize_columns(raw_rows)
        report.rows_harmonized = len(harmonized_rows)

        # --- Stage 3: Normalize values ---
        logger.info("[%s] Stage 3: Normalizing values...", task_id)
        data_dir = reference_data_dir or DATA_DIR
        mp_master = _load_mp_master(data_dir)
        ref_lists = build_reference_lists_from_mp_master(mp_master) if mp_master else {}
        normalized_rows = _normalize_rows(harmonized_rows, ref_lists)
        report.rows_normalized = len(normalized_rows)

        # --- Stage 4: Validate ---
        logger.info("[%s] Stage 4: Validating rows...", task_id)
        validation_result: ValidationResult = validate_batch(normalized_rows)
        report.rows_validated = len(validation_result.valid_rows)
        report.rows_quarantined = len(validation_result.quarantined)
        report.valid_rows = validation_result.valid_rows
        report.quarantine_records = validation_result.quarantined
        report.warnings = validation_result.warnings

        # --- Stage 5: Compute benchmarks ---
        logger.info("[%s] Stage 5: Computing category benchmarks...", task_id)
        benchmarks = _compute_benchmarks(validation_result.valid_rows)
        report.benchmarks_computed = benchmarks

        # --- Stage 6: Auto-generate vendor IDs ---
        logger.info("[%s] Stage 6: Auto-generating vendor IDs...", task_id)
        _auto_generate_vendor_ids(validation_result.valid_rows)

        # --- Stage 7: Persist quarantine to disk ---
        if validation_result.quarantined:
            logger.info("[%s] Stage 7: Persisting quarantine to disk...", task_id)
            q_path = persist_quarantine_to_disk(
                validation_result.quarantined,
                task_id=task_id,
                quarantine_dir=quarantine_dir,
            )
            report.quarantine_file_path = str(q_path)

        # --- Final status ---
        if report.warnings or report.rows_quarantined > 0:
            report.status = "completed_with_warnings"
        else:
            report.status = "completed"

    except Exception as e:
        logger.exception("[%s] Pipeline failed: %s", task_id, e)
        report.status = "failed"
        report.error_message = str(e)

    report.duration_seconds = round(time.time() - start, 3)
    logger.info(
        "[%s] Pipeline %s in %.2fs — %d valid, %d quarantined",
        task_id,
        report.status,
        report.duration_seconds,
        report.rows_validated,
        report.rows_quarantined,
    )
    return report


# ---------------------------------------------------------------------------
# Datastore Refresh — Merges validated rows into app.py's live `db`
# ---------------------------------------------------------------------------

def refresh_app_datastore(
    valid_rows_or_report: Union[List[Dict[str, Any]], IngestionReport],
    benchmarks: Optional[Dict[str, Dict[str, float]]] = None,
) -> Dict[str, Any]:
    """
    Merge validated rows into the live in-memory ``db`` dict used by
    ``mplads_ai.api.app``.

    This performs an **additive merge**: existing data is preserved unless
    overwritten by a matching ``unique_work_number``.

    Args:
        valid_rows_or_report: Either an IngestionReport or a list of valid row dicts.
        benchmarks: Category cost benchmarks (optional if IngestionReport passed).

    Returns:
        Summary dict with counts of added/updated records.
    """
    if isinstance(valid_rows_or_report, IngestionReport):
        valid_rows = valid_rows_or_report.valid_rows
        if benchmarks is None:
            benchmarks = valid_rows_or_report.benchmarks_computed
    else:
        valid_rows = valid_rows_or_report
        benchmarks = benchmarks or {}

    # Import the live db — this is the same dict object used by app.py
    from mplads_ai.api.app import db
    from mplads_ai.api.schemas import HubVendorSchema

    added = 0
    updated = 0

    for row in valid_rows:
        # Convert validated dict to string-valued dict (matching CSV loader format)
        str_row: Dict[str, str] = {
            k: str(v) if v is not None else ""
            for k, v in row.items()
        }

        wid = str_row.get("unique_work_number", "")
        if not wid:
            continue

        existing = db["works_by_id"].get(wid)

        if existing is not None:
            # Update existing work
            existing.update(str_row)
            updated += 1
        else:
            # Add new work
            db["works"].append(str_row)
            db["works_by_id"][wid] = str_row

            mp = str_row.get("mp_name", "")
            if mp:
                db["works_by_mp"][mp].append(str_row)

            nd = str_row.get("nodal_district", "")
            if nd:
                db["works_by_district"][nd].append(str_row)

            impl_d = str_row.get("implementing_district", "")
            if impl_d:
                db["works_by_district"][impl_d].append(str_row)

            state = str_row.get("state", "")
            if state:
                db["works_by_state"][state].append(str_row)

            added += 1

        # Update vendor stats
        vid = str_row.get("vendor_id", "")
        if vid:
            vs = db["vendor_stats"][vid]
            vs["total"] += 1
            vs["amount"] += float(str_row.get("sanction_amount", 0) or 0)
            if str_row.get("work_status") == "Stalled":
                vs["delays"] += 1
            if str_row.get("is_anomaly") == "1":
                vs["anomalies"] += 1

    # Merge benchmarks
    for cat, bench in benchmarks.items():
        if cat not in db["benchmarks_by_category"]:
            db["benchmarks_by_category"][cat] = bench

    # Refresh data summary text
    works = db["works"]
    total_anomalies = sum(1 for w in works if w.get("is_anomaly") == "1")
    total_stalled = sum(1 for w in works if w.get("work_status") == "Stalled")
    total_amt = sum(float(w.get("sanction_amount", 0) or 0) for w in works)
    mps = db["mp_master"]
    vendors = db["vendors"]
    hub_count = len([v for v in vendors if v.get("is_hub") == "True"])

    db["data_summary_text"] = (
        f"MPLADS Dataset Overview:\n"
        f"- Total works: {len(works)}\n"
        f"- Total sanctioned amount: ₹{total_amt/1e7:.2f} Crore\n"
        f"- Total MPs covered: {len(mps)}\n"
        f"- Total vendors: {len(vendors)} (Hub vendors: {hub_count})\n"
        f"- Total anomalous works: {total_anomalies} (Rate: {total_anomalies/len(works)*100:.1f}%)\n"
        f"- Total stalled works: {total_stalled}\n"
    )

    logger.info(
        "Datastore refreshed: %d added, %d updated, total works now %d",
        added, updated, len(works),
    )

    return {
        "added": added,
        "updated": updated,
        "total_works": len(works),
    }
