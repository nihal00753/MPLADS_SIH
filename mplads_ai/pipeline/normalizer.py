"""
Indian financial, date, and geography normalization for messy MPLADS data.

All functions are **pure**, **stateless**, and accept ``None`` gracefully.
They use only the Python standard library (``re``, ``datetime``, ``difflib``,
``logging``) — zero external dependencies.
"""

from __future__ import annotations

import difflib
import logging
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 1. Indian Currency Normalizer
# ---------------------------------------------------------------------------

# Multiplier keywords (case-insensitive)
_MULTIPLIER_MAP: Dict[str, float] = {
    "crore": 1e7,
    "crores": 1e7,
    "cr": 1e7,
    "c": 1e7,
    "lakh": 1e5,
    "lakhs": 1e5,
    "l": 1e5,
    "thousand": 1e3,
    "k": 1e3,
}

# Regex: optional currency prefix → number → optional multiplier suffix
_CURRENCY_PREFIX_RE = re.compile(
    r"^[\s₹]*(?:Rs\.?|INR|rupees?)?[\s.:₹]*",
    re.IGNORECASE,
)
_CURRENCY_SUFFIX_RE = re.compile(r"[\s/\-]*$")
_TRAILING_DASH_RE = re.compile(r"/\-?\s*$")

# Match a multiplier word at the end (possibly preceded by whitespace)
_MULTIPLIER_RE = re.compile(
    r"\s*(crores?|cr|lakhs?|l|thousand|k|c)\s*$",
    re.IGNORECASE,
)

# Indian-style commas: 1,25,00,000  or  25,00,000  or  2,500
_INDIAN_COMMA_RE = re.compile(r"^(\d{1,2}(?:,\d{2})*(?:,\d{3}))$")


def normalize_currency(raw: object) -> Optional[float]:
    """
    Parse an Indian currency string into a canonical ``float``.

    Handles formats including:
    - ``"₹ 25.5 Lakhs"``, ``"Rs. 25,00,000/-"``, ``"1.4 Cr"``
    - ``"2500000"``, ``"2.5 L"``, ``"INR 14,00,000"``
    - Bare numbers as ``int`` or ``float``

    Returns ``None`` and logs a warning for unparseable input.
    Never raises.
    """
    if raw is None:
        return None

    # Pass through numeric types directly
    if isinstance(raw, (int, float)):
        return float(raw)

    text = str(raw).strip()
    if not text:
        return None

    # Strip currency prefix  (₹, Rs., INR, etc.)
    text = _CURRENCY_PREFIX_RE.sub("", text)
    # Strip trailing /- or -
    text = _TRAILING_DASH_RE.sub("", text)
    text = _CURRENCY_SUFFIX_RE.sub("", text)
    text = text.replace("₹", "").strip()

    if not text:
        return None

    # Extract multiplier if present
    multiplier = 1.0
    m = _MULTIPLIER_RE.search(text)
    if m:
        key = m.group(1).lower().strip()
        # Disambiguate single 'c' vs 'cr' vs 'crore'
        if key in _MULTIPLIER_MAP:
            multiplier = _MULTIPLIER_MAP[key]
        text = text[: m.start()].strip()

    if not text:
        return None

    # Remove Indian-style commas (works for both 25,00,000 and 2,500,000)
    text = text.replace(",", "")

    # Try to parse as float
    try:
        value = float(text) * multiplier
        return value
    except (ValueError, OverflowError):
        logger.warning("Could not parse currency value: %r", raw)
        return None


# ---------------------------------------------------------------------------
# 2. Indian Date Normalizer
# ---------------------------------------------------------------------------

_MONTH_NAMES: Dict[str, int] = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}

# DD/MM/YYYY  or  DD-MM-YYYY  or  DD.MM.YYYY
_DMY_RE = re.compile(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$")
# DD-MMM-YYYY  or  DD MMM YYYY  (e.g. 15-Mar-2024, 15 March 2024)
_DMMMY_RE = re.compile(
    r"^(\d{1,2})[/\-.\s]+([A-Za-z]{3,9})[/\-.\s]+(\d{4})$"
)
# YYYY/MM/DD  or  YYYY-MM-DD
_YMD_RE = re.compile(r"^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$")
# MMM DD, YYYY  (e.g. March 15, 2024)
_MDY_NAMED_RE = re.compile(
    r"^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$"
)

# Excel epoch: 1900-01-01 is serial 1, but Excel incorrectly treats 1900 as
# a leap year, so the effective epoch for serials > 60 is 1899-12-30.
_EXCEL_EPOCH = datetime(1899, 12, 30)


def normalize_date(raw: object) -> Optional[str]:
    """
    Convert a date in any common Indian/government format to ISO 8601
    (``YYYY-MM-DD``).

    Supported formats:
    - ``"2024-03-15"`` (ISO passthrough)
    - ``"15/03/2024"``, ``"15-03-2024"``  (DD/MM/YYYY)
    - ``"15-Mar-2024"``, ``"15 March 2024"``  (DD-MMM-YYYY)
    - ``"March 15, 2024"``  (MMM DD, YYYY)
    - ``"2024/03/15"``  (YYYY/MM/DD)
    - ``45366``  (Excel serial number)

    Returns ``None`` and logs a warning for unparseable input.
    """
    if raw is None:
        return None

    # Excel serial number (int or float)
    if isinstance(raw, (int, float)):
        try:
            serial = int(raw)
            if 1 <= serial <= 200000:  # sane range for dates
                dt = _EXCEL_EPOCH + timedelta(days=serial)
                return dt.strftime("%Y-%m-%d")
        except (ValueError, OverflowError):
            pass
        return None

    text = str(raw).strip()
    if not text:
        return None

    # Try Excel serial as string (e.g. "45366")
    if text.isdigit():
        serial = int(text)
        if 1 <= serial <= 200000:
            dt = _EXCEL_EPOCH + timedelta(days=serial)
            return dt.strftime("%Y-%m-%d")

    # YYYY-MM-DD or YYYY/MM/DD
    m = _YMD_RE.match(text)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return _safe_date(y, mo, d, raw)

    # DD/MM/YYYY or DD-MM-YYYY
    m = _DMY_RE.match(text)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return _safe_date(y, mo, d, raw)

    # DD-MMM-YYYY or DD MMM YYYY
    m = _DMMMY_RE.match(text)
    if m:
        d = int(m.group(1))
        mo = _MONTH_NAMES.get(m.group(2).lower().strip()[:3])
        y = int(m.group(3))
        if mo:
            return _safe_date(y, mo, d, raw)

    # MMM DD, YYYY
    m = _MDY_NAMED_RE.match(text)
    if m:
        mo = _MONTH_NAMES.get(m.group(1).lower().strip()[:3])
        d = int(m.group(2))
        y = int(m.group(3))
        if mo:
            return _safe_date(y, mo, d, raw)

    logger.warning("Could not parse date: %r", raw)
    return None


def _safe_date(y: int, m: int, d: int, raw: object) -> Optional[str]:
    """Attempt to construct a valid date; return None on failure."""
    try:
        return datetime(y, m, d).strftime("%Y-%m-%d")
    except (ValueError, OverflowError):
        logger.warning("Invalid date components y=%d m=%d d=%d from %r", y, m, d, raw)
        return None


# ---------------------------------------------------------------------------
# 3. Administrative & Geography Normalizer
# ---------------------------------------------------------------------------

_COMMON_GEO_ALIASES: Dict[str, str] = {
    "j & k": "Jammu And Kashmir",
    "j&k": "Jammu And Kashmir",
    "jammu & kashmir": "Jammu And Kashmir",
    "up": "Uttar Pradesh",
    "u.p.": "Uttar Pradesh",
    "mp": "Madhya Pradesh",
    "m.p.": "Madhya Pradesh",
    "ap": "Andhra Pradesh",
    "a.p.": "Andhra Pradesh",
    "tn": "Tamil Nadu",
    "t.n.": "Tamil Nadu",
    "wb": "West Bengal",
    "w.b.": "West Bengal",
    "hp": "Himachal Pradesh",
    "h.p.": "Himachal Pradesh",
    "uk": "Uttarakhand",
    "u.k.": "Uttarakhand",
    "delhi": "NCT of Delhi",
    "nct of delhi": "Delhi",
}


def normalize_geography(
    raw_name: object,
    reference_list: List[str],
    threshold: float = 0.80,
) -> Optional[str]:
    """
    Fuzzy-match a raw state/district/constituency name against a canonical
    reference list.

    Uses ``difflib.get_close_matches()`` with a configurable cutoff.

    Args:
        raw_name: The raw (potentially misspelled) name.
        reference_list: Canonical names to match against.
        threshold: Minimum similarity ratio (0–1, default 0.80).

    Returns:
        The best canonical match, or ``None`` if no match above threshold.
    """
    if raw_name is None:
        return None

    name = str(raw_name).strip()
    if not name:
        return None

    # Exact match first (case-insensitive)
    name_lower = name.lower()
    for ref in reference_list:
        if ref.lower() == name_lower:
            return ref

    # Check common state abbreviations/aliases
    alias_target = _COMMON_GEO_ALIASES.get(name_lower)
    if alias_target:
        for ref in reference_list:
            if ref.lower() == alias_target.lower():
                return ref
        for ref in reference_list:
            if difflib.SequenceMatcher(None, alias_target.lower(), ref.lower()).ratio() >= 0.75:
                return ref
        return alias_target

    # Fuzzy match
    matches = difflib.get_close_matches(
        name, reference_list, n=1, cutoff=threshold
    )
    if matches:
        logger.info("Geography fuzzy match: %r → %r", name, matches[0])
        return matches[0]

    logger.warning(
        "No geography match for %r (threshold=%.2f, %d candidates)",
        name, threshold, len(reference_list),
    )
    return None


def build_reference_lists_from_mp_master(
    mp_master_rows: List[Dict[str, str]],
) -> Dict[str, List[str]]:
    """
    Extract unique, deduplicated canonical name lists from the MP master
    CSV (``mplads_mp_master_real.csv``) for use with ``normalize_geography``.

    Returns:
        Dict with keys ``"states"``, ``"districts"``, ``"constituencies"``.
    """
    states: set[str] = set()
    districts: set[str] = set()
    constituencies: set[str] = set()

    for row in mp_master_rows:
        s = (row.get("state") or "").strip()
        d = (row.get("district") or "").strip()
        c = (row.get("constituency") or "").strip()
        if s:
            states.add(s)
        if d:
            districts.add(d)
        if c:
            constituencies.add(c)

    return {
        "states": sorted(states),
        "districts": sorted(districts),
        "constituencies": sorted(constituencies),
    }
