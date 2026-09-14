"""
Pre‑sanction risk scoring for MPLADS work proposals.

Scores a new work proposal's delay / anomaly probability *before* funds
are released, using an explainable weighted rule‑based model.  Every
contributing factor produces a human‑readable reason string — not just a
number — so that reviewing officials can understand and challenge the
score.

Scoring factors (v1, all configurable via ``weights`` and ``thresholds``):

| Factor                   | Default weight |
|--------------------------|---------------|
| Vendor delay history     | 0.25          |
| Vendor anomaly history   | 0.20          |
| Amount vs. benchmark     | 0.20          |
| New‑vendor flag          | 0.15          |
| Seasonal risk            | 0.10          |
| Region risk              | 0.10          |

Known limitations (v1):
- Weights and thresholds are hand‑tuned defaults; they should be
  calibrated against historical outcomes in v2.
- Seasonal risk is hard‑coded to Indian monsoon months (Jun–Sep) for
  outdoor construction; indoor projects may need different calendars.
- The model is purely additive — it cannot capture non‑linear
  interactions (e.g., new vendor + monsoon + high amount).

Dependencies: none beyond the Python standard library.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from mplads_ai.common.types import InsufficientDataError, RiskLevel, RiskSignal

MODULE_NAME = "presanction_scoring"

# ---------------------------------------------------------------------------
# Defaults (never hardcoded magic numbers — callers can override)
# ---------------------------------------------------------------------------

DEFAULT_WEIGHTS: Dict[str, float] = {
    "vendor_delay_history": 0.25,
    "vendor_anomaly_history": 0.20,
    "amount_vs_benchmark": 0.20,
    "new_vendor": 0.15,
    "seasonal_risk": 0.10,
    "region_risk": 0.10,
}

DEFAULT_THRESHOLDS: Dict[str, float] = {
    "delay_ratio_concern": 0.30,       # flag if > 30 % past projects delayed
    "anomaly_ratio_concern": 0.20,     # flag if > 20 % past projects anomalous
    "amount_overshoot_pct": 20.0,      # flag if > 20 % above benchmark
}

# Monsoon months for seasonal risk factor (Jun through Sep)
_MONSOON_MONTHS = {6, 7, 8, 9}


# ---------------------------------------------------------------------------
# Data‑transfer objects
# ---------------------------------------------------------------------------

@dataclass
class ProposalInput:
    """All inputs for scoring a new work proposal."""
    sanction_amount: float
    category: str
    region: str
    season_month: int                          # 1‑12
    vendor_id: str
    vendor_past_delays: int = 0
    vendor_past_anomalies: int = 0
    vendor_total_projects: int = 0
    category_benchmark_amount: Optional[float] = None
    region_risk_score: Optional[float] = None  # 0‑1, caller‑supplied


@dataclass
class RiskFactor:
    """One explainable scoring factor."""
    factor_name: str
    raw_value: Optional[float]
    weight: float
    contribution: float   # weighted contribution to overall score (0‑1)
    reason: str           # human‑readable explanation


@dataclass
class PreSanctionScore:
    """Complete pre‑sanction risk assessment."""
    overall_score: float           # 0‑1
    risk_level: str                # HIGH | MEDIUM | LOW | INSUFFICIENT_DATA
    factors: List[RiskFactor] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Internal factor evaluators
# ---------------------------------------------------------------------------

def _eval_vendor_delay(
    proposal: ProposalInput,
    weight: float,
    concern_threshold: float,
) -> RiskFactor:
    if proposal.vendor_total_projects == 0:
        return RiskFactor(
            factor_name="vendor_delay_history",
            raw_value=None,
            weight=weight,
            contribution=0.0,
            reason="No prior projects on record for this vendor; "
                   "delay history unavailable.",
        )
    ratio = proposal.vendor_past_delays / proposal.vendor_total_projects
    contrib = min(1.0, ratio / 1.0) * weight  # linear scale to weight
    if ratio > concern_threshold:
        reason = (
            f"Vendor has delayed {proposal.vendor_past_delays} of "
            f"{proposal.vendor_total_projects} past projects "
            f"({ratio:.0%}). This exceeds the {concern_threshold:.0%} "
            f"concern threshold."
        )
    else:
        reason = (
            f"Vendor delay rate is {ratio:.0%} "
            f"({proposal.vendor_past_delays}/{proposal.vendor_total_projects}), "
            f"within acceptable range."
        )
    return RiskFactor(
        factor_name="vendor_delay_history",
        raw_value=round(ratio, 3),
        weight=weight,
        contribution=round(contrib, 4),
        reason=reason,
    )


def _eval_vendor_anomaly(
    proposal: ProposalInput,
    weight: float,
    concern_threshold: float,
) -> RiskFactor:
    if proposal.vendor_total_projects == 0:
        return RiskFactor(
            factor_name="vendor_anomaly_history",
            raw_value=None,
            weight=weight,
            contribution=0.0,
            reason="No prior projects on record; anomaly history unavailable.",
        )
    ratio = proposal.vendor_past_anomalies / proposal.vendor_total_projects
    contrib = min(1.0, ratio / 1.0) * weight
    if ratio > concern_threshold:
        reason = (
            f"Vendor has had anomalies in {proposal.vendor_past_anomalies} of "
            f"{proposal.vendor_total_projects} past projects "
            f"({ratio:.0%}). This exceeds the {concern_threshold:.0%} "
            f"concern threshold."
        )
    else:
        reason = (
            f"Vendor anomaly rate is {ratio:.0%} "
            f"({proposal.vendor_past_anomalies}/{proposal.vendor_total_projects}), "
            f"within acceptable range."
        )
    return RiskFactor(
        factor_name="vendor_anomaly_history",
        raw_value=round(ratio, 3),
        weight=weight,
        contribution=round(contrib, 4),
        reason=reason,
    )


def _eval_amount_vs_benchmark(
    proposal: ProposalInput,
    weight: float,
    overshoot_pct: float,
) -> RiskFactor:
    if proposal.category_benchmark_amount is None:
        return RiskFactor(
            factor_name="amount_vs_benchmark",
            raw_value=None,
            weight=weight,
            contribution=0.0,
            reason="No category benchmark amount provided; "
                   "cannot evaluate amount reasonableness.",
        )
    if proposal.category_benchmark_amount == 0:
        return RiskFactor(
            factor_name="amount_vs_benchmark",
            raw_value=None,
            weight=weight,
            contribution=0.0,
            reason="Category benchmark is zero; cannot compute overshoot.",
        )
    pct = (
        (proposal.sanction_amount - proposal.category_benchmark_amount)
        / proposal.category_benchmark_amount
        * 100
    )
    if pct > overshoot_pct:
        contrib = min(1.0, pct / 100.0) * weight
        reason = (
            f"Proposed amount ₹{proposal.sanction_amount:,.0f} is "
            f"{pct:+.1f}% above the category benchmark of "
            f"₹{proposal.category_benchmark_amount:,.0f}. "
            f"This exceeds the {overshoot_pct:.0f}% concern threshold."
        )
    elif pct > 0:
        contrib = (pct / overshoot_pct) * 0.3 * weight  # mild concern
        reason = (
            f"Proposed amount is {pct:+.1f}% above benchmark, "
            f"within acceptable range."
        )
    else:
        contrib = 0.0
        reason = (
            f"Proposed amount is at or below the category benchmark "
            f"({pct:+.1f}%)."
        )
    return RiskFactor(
        factor_name="amount_vs_benchmark",
        raw_value=round(pct, 2),
        weight=weight,
        contribution=round(max(0, contrib), 4),
        reason=reason,
    )


def _eval_new_vendor(
    proposal: ProposalInput,
    weight: float,
) -> RiskFactor:
    if proposal.vendor_total_projects == 0:
        return RiskFactor(
            factor_name="new_vendor",
            raw_value=1.0,
            weight=weight,
            contribution=round(weight * 0.7, 4),  # inherent risk
            reason="This is a new vendor with no prior MPLADS projects; "
                   "performance track record is unknown.",
        )
    return RiskFactor(
        factor_name="new_vendor",
        raw_value=0.0,
        weight=weight,
        contribution=0.0,
        reason=(
            f"Vendor has {proposal.vendor_total_projects} prior project(s) "
            f"on record."
        ),
    )


def _eval_seasonal_risk(
    proposal: ProposalInput,
    weight: float,
) -> RiskFactor:
    if proposal.season_month in _MONSOON_MONTHS:
        return RiskFactor(
            factor_name="seasonal_risk",
            raw_value=1.0,
            weight=weight,
            contribution=round(weight * 0.8, 4),
            reason=(
                f"Proposal targets month {proposal.season_month} "
                f"(monsoon season, Jun–Sep). Outdoor construction "
                f"projects face higher delay risk."
            ),
        )
    return RiskFactor(
        factor_name="seasonal_risk",
        raw_value=0.0,
        weight=weight,
        contribution=0.0,
        reason=f"Month {proposal.season_month} is outside monsoon season.",
    )


def _eval_region_risk(
    proposal: ProposalInput,
    weight: float,
) -> RiskFactor:
    if proposal.region_risk_score is None:
        return RiskFactor(
            factor_name="region_risk",
            raw_value=None,
            weight=weight,
            contribution=0.0,
            reason="No region risk score supplied; factor not evaluated.",
        )
    contrib = proposal.region_risk_score * weight
    if proposal.region_risk_score > 0.6:
        reason = (
            f"Region '{proposal.region}' has a historical risk score of "
            f"{proposal.region_risk_score:.2f} (elevated)."
        )
    else:
        reason = (
            f"Region '{proposal.region}' risk score is "
            f"{proposal.region_risk_score:.2f} (within normal range)."
        )
    return RiskFactor(
        factor_name="region_risk",
        raw_value=proposal.region_risk_score,
        weight=weight,
        contribution=round(contrib, 4),
        reason=reason,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def score_proposal(
    proposal: ProposalInput,
    weights: Optional[Dict[str, float]] = None,
    thresholds: Optional[Dict[str, float]] = None,
) -> PreSanctionScore:
    """
    Compute a pre‑sanction risk score for a new work proposal using an
    explainable weighted rule‑based model.

    Each factor is evaluated independently, producing a ``RiskFactor``
    with a human‑readable ``reason`` string.  The overall score is the
    sum of weighted contributions, clipped to [0, 1].

    When critical data is missing (zero vendor history *and* no benchmark),
    the score is returned with ``risk_level="INSUFFICIENT_DATA"`` so the
    caller knows not to rely on it blindly.

    Args:
        proposal: ``ProposalInput`` with all available data.
        weights: Override default factor weights.  Keys must match
            ``DEFAULT_WEIGHTS``.
        thresholds: Override default concern thresholds.

    Returns:
        ``PreSanctionScore`` with overall score, risk level, and
        per‑factor explanations.
    """
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    t = {**DEFAULT_THRESHOLDS, **(thresholds or {})}

    factors: List[RiskFactor] = [
        _eval_vendor_delay(proposal, w["vendor_delay_history"],
                           t["delay_ratio_concern"]),
        _eval_vendor_anomaly(proposal, w["vendor_anomaly_history"],
                             t["anomaly_ratio_concern"]),
        _eval_amount_vs_benchmark(proposal, w["amount_vs_benchmark"],
                                  t["amount_overshoot_pct"]),
        _eval_new_vendor(proposal, w["new_vendor"]),
        _eval_seasonal_risk(proposal, w["seasonal_risk"]),
        _eval_region_risk(proposal, w["region_risk"]),
    ]

    overall = sum(f.contribution for f in factors)
    overall = round(min(1.0, max(0.0, overall)), 4)

    # Determine risk level
    warnings: List[str] = []
    null_factors = [f for f in factors if f.raw_value is None]
    if len(null_factors) >= 3:
        risk_level = RiskLevel.INSUFFICIENT_DATA.value
        warnings.append(
            f"{len(null_factors)} of {len(factors)} factors could not be "
            f"evaluated due to missing data. The score may not be reliable."
        )
    elif overall >= 0.6:
        risk_level = RiskLevel.HIGH.value
    elif overall >= 0.3:
        risk_level = RiskLevel.MEDIUM.value
    else:
        risk_level = RiskLevel.LOW.value

    return PreSanctionScore(
        overall_score=overall,
        risk_level=risk_level,
        factors=factors,
        warnings=warnings,
    )


def to_risk_signals(score: PreSanctionScore) -> List[RiskSignal]:
    """Convert a pre‑sanction score into uniform ``RiskSignal`` objects."""
    signals: List[RiskSignal] = []

    if score.risk_level in (RiskLevel.HIGH.value, RiskLevel.MEDIUM.value):
        high_factors = [
            f for f in score.factors if f.contribution > 0.05
        ]
        combined_reason = "; ".join(f.reason for f in high_factors[:3])
        signals.append(RiskSignal(
            signal_type="PRE_SANCTION_RISK",
            severity=score.overall_score,
            reason=(
                f"Pre-sanction risk score is {score.overall_score:.2f} "
                f"({score.risk_level}). Key factors: {combined_reason}"
            ),
            metadata={
                "overall_score": score.overall_score,
                "risk_level": score.risk_level,
                "factor_count": len(score.factors),
            },
        ))

    if score.risk_level == RiskLevel.INSUFFICIENT_DATA.value:
        signals.append(RiskSignal(
            signal_type="INSUFFICIENT_SCORING_DATA",
            severity=0.4,
            reason=score.warnings[0] if score.warnings else
                   "Insufficient data for reliable scoring.",
            metadata={"risk_level": score.risk_level},
        ))

    return signals
