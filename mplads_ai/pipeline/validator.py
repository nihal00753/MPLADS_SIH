"""
Pydantic-based row validation and Dead-Letter Queue (DLQ) for MPLADS data.

Records failing critical validation are diverted to a quarantine queue
(both in-memory and persisted to disk) rather than crashing the pipeline.
Valid records proceed unimpeded.

Dependencies: ``pydantic`` (already a FastAPI transitive dependency).
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Quarantine Record
# ---------------------------------------------------------------------------

@dataclass
class QuarantineRecord:
    """A record that failed validation and was diverted to the DLQ."""
    row_index: int
    original_row: Dict[str, Any]
    errors: List[str]
    reason: str
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# Validation Result
# ---------------------------------------------------------------------------

@dataclass
class ValidationResult:
    """Aggregated result of batch validation."""
    valid_rows: List[Dict[str, Any]]
    quarantined: List[QuarantineRecord]
    warnings: List[str]
    stats: Dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Pydantic Schema for Work Records
# ---------------------------------------------------------------------------

class WorkRecordSchema(BaseModel):
    """
    Strict validation schema for a canonical MPLADS work record.

    Required fields will cause quarantine if missing or invalid.
    Optional fields default to ``None`` and do not trigger quarantine.
    """
    unique_work_number: str = Field(..., min_length=1)
    state: str = Field(..., min_length=1)
    nodal_district: str = Field(..., min_length=1)
    sanction_amount: float = Field(..., gt=0)

    # Optional fields — missing values are acceptable
    implementing_district: Optional[str] = None
    house_name: Optional[str] = None
    member_type: Optional[str] = None
    mp_name: Optional[str] = None
    constituency: Optional[str] = None
    work_category: Optional[str] = None
    work_name: Optional[str] = None
    date_of_receipt_of_work_proposal_from_mp: Optional[str] = None
    date_of_administrative_approval: Optional[str] = None
    implementing_agency_name: Optional[str] = None
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None
    work_status: Optional[str] = None
    physical_progress_pct: Optional[float] = Field(default=None, ge=0, le=100)
    financial_progress_pct: Optional[float] = Field(default=None, ge=0, le=100)
    unit: Optional[str] = None
    note: Optional[str] = None

    # Ground truth columns (may or may not be present)
    category_benchmark_min: Optional[float] = None
    category_benchmark_max: Optional[float] = None
    is_anomaly: Optional[str] = None
    anomaly_type: Optional[str] = None

    @field_validator("unique_work_number", "state", "nodal_district", mode="before")
    @classmethod
    def strip_whitespace(cls, v: Any) -> Any:
        if isinstance(v, str):
            v = v.strip()
            return v if v else None
        return v

    @field_validator("sanction_amount", mode="before")
    @classmethod
    def coerce_amount(cls, v: Any) -> Any:
        if v is None or v == "":
            return None
        try:
            return float(v)
        except (ValueError, TypeError):
            return None

    @field_validator(
        "physical_progress_pct", "financial_progress_pct",
        "category_benchmark_min", "category_benchmark_max",
        mode="before",
    )
    @classmethod
    def coerce_optional_float(cls, v: Any) -> Any:
        if v is None or v == "":
            return None
        try:
            return float(v)
        except (ValueError, TypeError):
            return None


# ---------------------------------------------------------------------------
# Quality Warning Checks (non-fatal)
# ---------------------------------------------------------------------------

_MAX_MPLADS_AMOUNT = 5e8  # ₹50 Crore — unusually large for a single MPLADS work


def _check_quality_warnings(row: Dict[str, Any]) -> List[str]:
    """
    Check a validated row for quality concerns that do NOT warrant
    quarantine but should be flagged for review.
    """
    warnings: List[str] = []

    # Unusually large amount
    amt = row.get("sanction_amount")
    if amt is not None and isinstance(amt, (int, float)) and amt > _MAX_MPLADS_AMOUNT:
        warnings.append(
            f"Unusually large sanction amount: ₹{amt:,.0f} "
            f"(>{_MAX_MPLADS_AMOUNT/1e7:.0f} Cr threshold)"
        )

    # Future approval date
    approval_date = row.get("date_of_administrative_approval")
    if approval_date and isinstance(approval_date, str):
        try:
            dt = datetime.strptime(approval_date, "%Y-%m-%d")
            if dt > datetime.utcnow():
                warnings.append(
                    f"Administrative approval date is in the future: {approval_date}"
                )
        except ValueError:
            pass

    # Ghost work indicator: high financial progress, zero physical progress
    phys = row.get("physical_progress_pct")
    fin = row.get("financial_progress_pct")
    if (
        phys is not None and fin is not None
        and isinstance(phys, (int, float)) and isinstance(fin, (int, float))
        and phys <= 5.0 and fin >= 50.0
    ):
        warnings.append(
            f"Possible ghost work: physical progress {phys}% "
            f"but financial progress {fin}%"
        )

    return warnings


# ---------------------------------------------------------------------------
# Core Validation Functions
# ---------------------------------------------------------------------------

def validate_row(
    row: Dict[str, str],
    row_index: int = 0,
) -> Tuple[Optional[Dict[str, Any]], Optional[QuarantineRecord]]:
    """
    Validate a single row against the ``WorkRecordSchema``.

    Returns:
        A tuple of (validated_dict, quarantine_record).
        On success: ``(dict, None)``.
        On failure: ``(None, QuarantineRecord(...))``.
    """
    try:
        validated = WorkRecordSchema(**row)
        return (validated.model_dump(), None)
    except Exception as e:
        error_msgs = []
        if hasattr(e, "errors") and callable(e.errors):
            for err in e.errors():
                loc = " → ".join(str(l) for l in err.get("loc", []))
                msg = err.get("msg", str(err))
                error_msgs.append(f"{loc}: {msg}")
        else:
            error_msgs.append(str(e))

        return (
            None,
            QuarantineRecord(
                row_index=row_index,
                original_row=dict(row),
                errors=error_msgs,
                reason="Pydantic validation failure",
            ),
        )


def validate_batch(
    rows: List[Dict[str, str]],
) -> ValidationResult:
    """
    Validate a batch of rows, separating valid records from quarantined ones.

    Returns:
        A ``ValidationResult`` containing valid rows, quarantined records,
        quality warnings, and summary statistics.
    """
    valid_rows: List[Dict[str, Any]] = []
    quarantined: List[QuarantineRecord] = []
    warnings: List[str] = []

    for i, row in enumerate(rows):
        validated, quarantine = validate_row(row, row_index=i)

        if validated is not None:
            # Run quality checks on valid rows
            row_warnings = _check_quality_warnings(validated)
            for w in row_warnings:
                warnings.append(f"Row {i} ({validated.get('unique_work_number', '?')}): {w}")
            valid_rows.append(validated)
        else:
            quarantined.append(quarantine)  # type: ignore[arg-type]

    total = len(rows)
    stats = {
        "total_rows": total,
        "valid_count": len(valid_rows),
        "quarantined_count": len(quarantined),
        "warning_count": len(warnings),
        "valid_rate_pct": round(len(valid_rows) / total * 100, 2) if total else 0.0,
        "quarantine_rate_pct": round(len(quarantined) / total * 100, 2) if total else 0.0,
    }

    if quarantined:
        logger.warning(
            "Validation: %d/%d rows quarantined (%.1f%%)",
            len(quarantined), total, stats["quarantine_rate_pct"],
        )

    return ValidationResult(
        valid_rows=valid_rows,
        quarantined=quarantined,
        warnings=warnings,
        stats=stats,
    )


# ---------------------------------------------------------------------------
# DLQ Persistence (Disk)
# ---------------------------------------------------------------------------

_DEFAULT_QUARANTINE_DIR = Path(r"d:\MPLADS AIML\test_data\quarantine")


def persist_quarantine_to_disk(
    quarantined: List[QuarantineRecord],
    task_id: str,
    quarantine_dir: Optional[Path] = None,
) -> Path:
    """
    Write quarantined records to a JSON file on disk for audit trail.

    Args:
        quarantined: List of quarantine records.
        task_id: Unique task identifier (used in the filename).
        quarantine_dir: Directory to write to. Defaults to
            ``test_data/quarantine/``.

    Returns:
        Path to the written file.
    """
    out_dir = quarantine_dir or _DEFAULT_QUARANTINE_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    filename = f"quarantine_{task_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    out_path = out_dir / filename

    records = [q.to_dict() for q in quarantined]
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, default=str, ensure_ascii=False)

    logger.info("Persisted %d quarantine records to %s", len(records), out_path)
    return out_path
