"""
Shared types and exceptions for the MPLADS AI/ML pipeline.

Every module in the platform emits `RiskSignal` objects so the downstream
risk-scoring engine has a single, uniform interface to consume.  Modules
raise `InsufficientDataError` instead of silently returning confident
results from empty or malformed inputs.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class Severity(Enum):
    """Discrete severity levels that map onto the 0‑1 continuous score."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class RiskLevel(Enum):
    """Risk classification returned by scoring modules."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


# ---------------------------------------------------------------------------
# Core data‑transfer objects
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RiskSignal:
    """
    Standard output emitted by every AI/ML module.

    Attributes:
        signal_type: Machine-readable tag, e.g. ``"DUPLICATE_PHOTO"``,
            ``"AMOUNT_MISMATCH"``, ``"HIGH_URGENCY_COMPLAINT"``.
        severity: Continuous score in [0, 1] where 1 = most severe.
        reason: One‑sentence human-readable explanation suitable for
            display in a dashboard tooltip.
        metadata: Arbitrary key‑value pairs carrying module‑specific
            detail (image IDs, hamming distance, vendor IDs, …).
    """
    signal_type: str
    severity: float
    reason: str
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not 0.0 <= self.severity <= 1.0:
            raise ValueError(
                f"severity must be in [0, 1], got {self.severity}"
            )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to a plain dict (JSON‑safe)."""
        return asdict(self)


# ---------------------------------------------------------------------------
# Custom exception
# ---------------------------------------------------------------------------

class InsufficientDataError(Exception):
    """
    Raised when a module receives input that is empty, malformed, or
    otherwise insufficient to produce a meaningful result.

    Callers should catch this and surface a clear message rather than
    propagating an opaque traceback to the end user.
    """

    def __init__(self, module: str, reason: str) -> None:
        self.module = module
        self.reason = reason
        super().__init__(f"[{module}] Insufficient data: {reason}")
