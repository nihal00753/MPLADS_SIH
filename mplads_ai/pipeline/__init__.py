"""
MPLADS Data Engineering & Ingestion Pipeline.

Automated, fault-tolerant pipeline for ingesting, cleaning, normalizing,
and validating unorganized MPLADS data from government portals.

Usage::

    from mplads_ai.pipeline import ingest_unorganized_dataset

    report = ingest_unorganized_dataset("path/to/messy_data.csv")
    print(f"Ingested {report.rows_validated} rows, quarantined {report.rows_quarantined}")
"""

from mplads_ai.pipeline.orchestrator import (
    IngestionReport,
    ingest_unorganized_dataset,
    refresh_app_datastore,
)
from mplads_ai.pipeline.normalizer import (
    normalize_currency,
    normalize_date,
    normalize_geography,
    build_reference_lists_from_mp_master,
)
from mplads_ai.pipeline.harmonizer import (
    harmonize_columns,
    read_raw_file,
    CANONICAL_COLUMN_MAP,
)
from mplads_ai.pipeline.validator import (
    validate_batch,
    validate_row,
    ValidationResult,
    QuarantineRecord,
    WorkRecordSchema,
    persist_quarantine_to_disk,
)

__all__ = [
    "ingest_unorganized_dataset",
    "refresh_app_datastore",
    "IngestionReport",
    "normalize_currency",
    "normalize_date",
    "normalize_geography",
    "build_reference_lists_from_mp_master",
    "harmonize_columns",
    "read_raw_file",
    "CANONICAL_COLUMN_MAP",
    "validate_batch",
    "validate_row",
    "ValidationResult",
    "QuarantineRecord",
    "WorkRecordSchema",
    "persist_quarantine_to_disk",
]
