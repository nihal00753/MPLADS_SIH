"""
Document OCR for MPLADS invoices and utilization certificates.

Extracts text from scanned document images using Tesseract OCR, then
applies regex‑based rules to identify three key financial fields:
amount, date, and vendor name.  Extracted values are compared against
sanctioned figures to flag discrepancies.

The regex patterns are tuned for Indian financial‑document conventions:
₹ / Rs. currency prefixes, lakh/crore notation, dd/mm/yyyy and
dd‑MMM‑yyyy date formats, and "M/s" vendor‑name prefixes.

Known limitations (v1):
- Tesseract accuracy drops sharply on low‑resolution scans, skewed
  images, and handwritten text.  Pre‑processing (deskew, binarisation)
  is not included in v1.
- The amount regex cannot reliably distinguish the *total* amount from
  line‑item amounts when multiple figures appear on the same document.
- Vendor‑name extraction is heuristic (looks for "M/s", "Vendor:",
  "Contractor:" prefixes) and will miss names in non‑standard layouts.
- This module assumes Tesseract is installed on the host OS.

Dependencies: pytesseract >= 0.3.10, Pillow >= 10.0.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple

from PIL import Image
import pytesseract

from mplads_ai.common.types import InsufficientDataError, RiskSignal

MODULE_NAME = "document_ocr"


# ---------------------------------------------------------------------------
# Data‑transfer objects
# ---------------------------------------------------------------------------

@dataclass
class ExtractedFields:
    """Fields parsed from an invoice or utilization certificate."""
    raw_text: str
    amount: Optional[float] = None
    date: Optional[str] = None
    vendor_name: Optional[str] = None
    confidence_notes: List[str] = field(default_factory=list)


@dataclass
class FieldDiffResult:
    """One field‑level comparison between extracted and sanctioned values."""
    field_name: str
    extracted_value: Optional[object]
    sanctioned_value: Optional[object]
    discrepancy: Optional[float]  # relative or absolute diff, depends on field
    reason: str


# ---------------------------------------------------------------------------
# Internal helpers — regex patterns
# ---------------------------------------------------------------------------

# Matches amounts like: ₹ 1,23,456.78  |  Rs. 12,34,567  |  Rs 500
_AMOUNT_PATTERN = re.compile(
    r"(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)",
    re.IGNORECASE,
)

# Matches lakh/crore notation: 1.5 Lakh, 2.3 Crore
_LAKH_CRORE_PATTERN = re.compile(
    r"([\d,.]+)\s*(lakh|lac|crore|cr)\b",
    re.IGNORECASE,
)

# Matches dates: dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, dd-MMM-yyyy, yyyy/mm/dd, yyyy-mm-dd
_DATE_PATTERNS = [
    re.compile(r"\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{4})\b"),
    re.compile(r"\b(\d{1,2}[/\-\.](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[/\-\.]\d{4})\b", re.IGNORECASE),
    re.compile(r"\b(\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2})\b"),  # YYYY/MM/DD, YYYY-MM-DD
]

# Matches vendor/contractor name prefixed by common labels
_VENDOR_PATTERNS = [
    re.compile(r"(?:M/s\.?|Vendor\s*:|Contractor\s*:|Supplier\s*:|Name\s+of\s+(?:the\s+)?(?:firm|vendor|contractor)\s*:)\s*(.+)", re.IGNORECASE),
]


def _parse_indian_amount(raw: str) -> float:
    """
    Parse an Indian‑format number string into a float.

    Handles the Indian comma convention (1,23,456) by simply stripping
    all commas.
    """
    cleaned = raw.replace(",", "").strip()
    return float(cleaned)


def _extract_amounts(text: str) -> Tuple[List[float], List[str]]:
    """Return all currency amounts found and any notes about ambiguity."""
    amounts: List[float] = []
    notes: List[str] = []

    for m in _AMOUNT_PATTERN.finditer(text):
        try:
            amounts.append(_parse_indian_amount(m.group(1)))
        except ValueError:
            notes.append(f"Could not parse amount: '{m.group(0)}'")

    for m in _LAKH_CRORE_PATTERN.finditer(text):
        try:
            value = float(m.group(1).replace(",", ""))
            unit = m.group(2).lower()
            if unit in ("lakh", "lac"):
                value *= 100_000
            elif unit in ("crore", "cr"):
                value *= 10_000_000
            amounts.append(value)
        except ValueError:
            notes.append(f"Could not parse lakh/crore amount: '{m.group(0)}'")

    if len(amounts) > 1:
        notes.append(
            f"Multiple amounts found ({len(amounts)}); using the largest "
            f"as the likely total."
        )

    return amounts, notes


def _extract_date(text: str) -> Tuple[Optional[str], List[str]]:
    """Return the first date found, or None."""
    notes: List[str] = []
    all_dates: List[str] = []
    for pattern in _DATE_PATTERNS:
        for m in pattern.finditer(text):
            all_dates.append(m.group(1))

    if not all_dates:
        notes.append("No date found in document text.")
        return None, notes

    if len(all_dates) > 1:
        notes.append(
            f"Multiple dates found ({len(all_dates)}); using the first one."
        )

    return all_dates[0], notes


def _extract_vendor_name(text: str) -> Tuple[Optional[str], List[str]]:
    """Return vendor/contractor name, or None."""
    notes: List[str] = []
    for pattern in _VENDOR_PATTERNS:
        m = pattern.search(text)
        if m:
            name = m.group(1).strip().rstrip(".,;:")
            # Take only the first line of the match
            name = name.split("\n")[0].strip()
            if len(name) > 2:
                return name, notes

    notes.append(
        "Vendor name not found; expected a prefix like 'M/s', 'Vendor:', "
        "or 'Contractor:'."
    )
    return None, notes


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_text(image_path: str) -> str:
    """
    Extract text from a document image using Tesseract OCR.

    This is a thin wrapper around ``pytesseract.image_to_string``.  It
    assumes Tesseract is installed on the host OS and accessible on PATH.

    Raises:
        InsufficientDataError: if the file does not exist or Tesseract
            returns empty / whitespace‑only text.
    """
    path = Path(image_path)
    if not path.is_file():
        raise InsufficientDataError(
            MODULE_NAME,
            f"Document image does not exist: {image_path}",
        )

    try:
        img = Image.open(path)
        text = pytesseract.image_to_string(img)
    except Exception as exc:
        raise InsufficientDataError(
            MODULE_NAME,
            f"OCR failed for '{image_path}': {exc}",
        )

    if not text or not text.strip():
        raise InsufficientDataError(
            MODULE_NAME,
            f"OCR returned empty text for '{image_path}'. The image may "
            f"be blank, too low‑resolution, or not a document.",
        )

    return text


def parse_invoice_fields(raw_text: str) -> ExtractedFields:
    """
    Extract amount, date, and vendor name from OCR'd document text
    using regex / rule‑based patterns tuned for Indian financial documents.

    Fields that cannot be extracted are set to ``None`` with an
    explanatory note in ``confidence_notes`` — the function never
    guesses a value.

    Args:
        raw_text: OCR output text from ``extract_text``.

    Raises:
        InsufficientDataError: if *raw_text* is empty or whitespace.
    """
    if not raw_text or not raw_text.strip():
        raise InsufficientDataError(
            MODULE_NAME,
            "Cannot parse fields from empty text.",
        )

    notes: List[str] = []

    # --- Amount ---
    amounts, amount_notes = _extract_amounts(raw_text)
    notes.extend(amount_notes)
    amount = max(amounts) if amounts else None
    if amount is None:
        notes.append("No currency amount found in document text.")

    # --- Date ---
    date, date_notes = _extract_date(raw_text)
    notes.extend(date_notes)

    # --- Vendor name ---
    vendor_name, vendor_notes = _extract_vendor_name(raw_text)
    notes.extend(vendor_notes)

    return ExtractedFields(
        raw_text=raw_text,
        amount=amount,
        date=date,
        vendor_name=vendor_name,
        confidence_notes=notes,
    )


def diff_against_sanction(
    extracted: ExtractedFields,
    sanctioned_amount: Optional[float] = None,
    sanctioned_date: Optional[str] = None,
    sanctioned_vendor: Optional[str] = None,
    amount_tolerance_pct: float = 5.0,
) -> List[FieldDiffResult]:
    """
    Compare extracted invoice/UC fields against sanctioned values and
    flag discrepancies.

    Args:
        extracted: Output of ``parse_invoice_fields``.
        sanctioned_amount: Expected amount (₹).  Pass ``None`` to skip.
        sanctioned_date: Expected date string.  Pass ``None`` to skip.
        sanctioned_vendor: Expected vendor name.  Pass ``None`` to skip.
        amount_tolerance_pct: Percentage tolerance for amount comparison
            (default 5%).  Discrepancies below this are not flagged.

    Returns:
        List of ``FieldDiffResult`` — one per field where a comparison
        was possible.
    """
    results: List[FieldDiffResult] = []

    # --- Amount ---
    if sanctioned_amount is not None:
        if extracted.amount is not None:
            diff_pct = (
                (extracted.amount - sanctioned_amount) / sanctioned_amount * 100
                if sanctioned_amount != 0
                else None
            )
            flagged = (
                diff_pct is not None and abs(diff_pct) > amount_tolerance_pct
            )
            reason = (
                f"Extracted amount ₹{extracted.amount:,.2f} differs from "
                f"sanctioned ₹{sanctioned_amount:,.2f} by "
                f"{diff_pct:+.1f}%."
                if diff_pct is not None
                else "Sanctioned amount is zero; cannot compute percentage."
            ) if flagged else "Amount is within tolerance."
            results.append(FieldDiffResult(
                field_name="amount",
                extracted_value=extracted.amount,
                sanctioned_value=sanctioned_amount,
                discrepancy=round(diff_pct, 2) if diff_pct is not None else None,
                reason=reason,
            ))
        else:
            results.append(FieldDiffResult(
                field_name="amount",
                extracted_value=None,
                sanctioned_value=sanctioned_amount,
                discrepancy=None,
                reason="Amount could not be extracted from the document.",
            ))

    # --- Date ---
    if sanctioned_date is not None:
        if extracted.date is not None:
            match = extracted.date.strip() == sanctioned_date.strip()
            results.append(FieldDiffResult(
                field_name="date",
                extracted_value=extracted.date,
                sanctioned_value=sanctioned_date,
                discrepancy=0.0 if match else 1.0,
                reason=(
                    "Dates match."
                    if match
                    else f"Extracted date '{extracted.date}' differs from "
                         f"sanctioned '{sanctioned_date}'."
                ),
            ))
        else:
            results.append(FieldDiffResult(
                field_name="date",
                extracted_value=None,
                sanctioned_value=sanctioned_date,
                discrepancy=None,
                reason="Date could not be extracted from the document.",
            ))

    # --- Vendor name ---
    if sanctioned_vendor is not None:
        if extracted.vendor_name is not None:
            # Case-insensitive comparison; strip whitespace
            match = (
                extracted.vendor_name.strip().lower()
                == sanctioned_vendor.strip().lower()
            )
            results.append(FieldDiffResult(
                field_name="vendor_name",
                extracted_value=extracted.vendor_name,
                sanctioned_value=sanctioned_vendor,
                discrepancy=0.0 if match else 1.0,
                reason=(
                    "Vendor names match."
                    if match
                    else f"Extracted vendor '{extracted.vendor_name}' differs "
                         f"from sanctioned '{sanctioned_vendor}'."
                ),
            ))
        else:
            results.append(FieldDiffResult(
                field_name="vendor_name",
                extracted_value=None,
                sanctioned_value=sanctioned_vendor,
                discrepancy=None,
                reason="Vendor name could not be extracted from the document.",
            ))

    return results


def to_risk_signals(diffs: List[FieldDiffResult]) -> List[RiskSignal]:
    """Convert field‑diff results into uniform ``RiskSignal`` objects."""
    signals: List[RiskSignal] = []
    for diff in diffs:
        if diff.discrepancy is None:
            # Field could not be extracted — mild warning
            signals.append(RiskSignal(
                signal_type="OCR_FIELD_MISSING",
                severity=0.3,
                reason=diff.reason,
                metadata={"field": diff.field_name},
            ))
        elif diff.field_name == "amount" and diff.discrepancy is not None:
            if abs(diff.discrepancy) > 5.0:
                severity = min(1.0, abs(diff.discrepancy) / 100.0)
                signals.append(RiskSignal(
                    signal_type="AMOUNT_MISMATCH",
                    severity=round(severity, 3),
                    reason=diff.reason,
                    metadata={
                        "extracted": diff.extracted_value,
                        "sanctioned": diff.sanctioned_value,
                        "diff_pct": diff.discrepancy,
                    },
                ))
        elif diff.discrepancy == 1.0:
            signals.append(RiskSignal(
                signal_type=f"{diff.field_name.upper()}_MISMATCH",
                severity=0.5,
                reason=diff.reason,
                metadata={
                    "extracted": diff.extracted_value,
                    "sanctioned": diff.sanctioned_value,
                },
            ))
    return signals
