# Pre-Sanction Risk Scoring

## What it does

Scores a new MPLADS work proposal's delay/anomaly probability *before* funds are released, using a 6-factor explainable weighted rule-based model. Every contributing factor produces a human-readable reason string, not just a number, so reviewing officials can understand and challenge the assessment.

### Capabilities

| Function | Purpose |
|---|---|
| `score_proposal()` | Compute weighted risk score with per-factor explanations |
| `to_risk_signals()` | Convert score into uniform `RiskSignal` objects |

### Scoring factors

| Factor | Default weight | What it checks |
|---|---|---|
| Vendor delay history | 0.25 | `past_delays / total_projects` ratio |
| Vendor anomaly history | 0.20 | `past_anomalies / total_projects` ratio |
| Amount vs. category benchmark | 0.20 | % overshoot above category average |
| New vendor flag | 0.15 | First-time vendor → elevated risk |
| Seasonal risk | 0.10 | Monsoon months (Jun–Sep) for construction |
| Region risk | 0.10 | Caller-supplied regional risk score |

All weights and thresholds are configurable function parameters with sensible defaults documented in the docstrings.

## Known false-positive / false-negative failure modes

| Mode | Description |
|---|---|
| **False positive** | A genuinely good vendor working in a high-risk region during monsoon on a large project may be scored HIGH purely due to additive factor stacking |
| **False positive** | New vendors (zero history) always receive the new-vendor risk premium even if they are well-established firms new to MPLADS specifically |
| **False negative** | A vendor with a clean history who is about to commit fraud for the first time will score LOW (the model is backward-looking) |
| **False negative** | Seasonal risk is hardcoded to Indian monsoon; indoor projects incorrectly receive the monsoon penalty |
| **Blind spot** | The model is purely additive — it cannot capture non-linear interactions (e.g., new vendor × monsoon × high amount should be more than the sum) |

## v1 → v2 migration path

| Change | Details |
|---|---|
| **Model type** | Train a gradient-boosted classifier (XGBoost / LightGBM) on historical project outcomes, using the v1 factors as features |
| **Feature engineering** | Add features: district-level completion rate, MP tenure, project complexity index, historical fund-utilisation ratio |
| **Calibration** | Calibrate weights and thresholds against actual delay/anomaly outcomes instead of hand-tuning |
| **Non-linearity** | Replace additive scoring with a model that captures feature interactions |
| **Explainability** | Use SHAP values for per-prediction explanations to replace the rule-based reason strings |
