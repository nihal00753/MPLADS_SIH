# MPLADS AI Platform — AI/ML Feature Modules

Six pure-logic AI/ML modules that feed into the shared risk-scoring pipeline for the MPLADS (Member of Parliament Local Area Development Scheme) fund-monitoring system.

## Architecture

```
API Layer (FastAPI / Django / etc.)
        │
        ▼
┌──────────────────────────────────────┐
│         mplads_ai modules            │
│                                      │
│  vision_analysis ──┐                 │
│  document_ocr ─────┤                 │
│  complaint_nlp ────┤   RiskSignal    │
│  presanction ──────┼──► objects ──►  │  Risk-Scoring Engine
│  collusion ────────┤                 │
│  nl_query ─────────┘                 │
│                                      │
│  common/types.py (shared types)      │
└──────────────────────────────────────┘
```

Every module emits `RiskSignal` objects — the uniform interface consumed by the downstream risk-scoring engine.

## Modules

| Module | Directory | Purpose |
|---|---|---|
| **Vision Analysis** | `vision_analysis/` | Duplicate photo detection (pHash), geotag verification (Haversine) |
| **Document OCR** | `document_ocr/` | Invoice/UC text extraction (Tesseract) + regex field parsing |
| **Complaint NLP** | `complaint_nlp/` | Complaint triage (LLM + keyword fallback) + near-duplicate clustering (TF-IDF) |
| **Pre-Sanction Scoring** | `presanction_scoring/` | Explainable 6-factor weighted risk score for new proposals |
| **Collusion Network** | `collusion_network/` | Vendor entity resolution (PAN/GSTIN/name) + co-occurrence analysis |
| **NL Query Assistant** | `nl_query/` | Data-grounded natural-language Q&A with hallucination validation |

## Design principles

- **Pure functions / classes** — no framework code mixed in; independently unit-testable
- **Plain dicts / dataclasses** — not tied to any database or ORM
- **Explicit insufficient-data handling** — `InsufficientDataError` raised instead of silently returning confident answers
- **No trained models in v1** — every module has a working rule-based or off-the-shelf baseline
- **No hardcoded magic numbers** — thresholds and weights are function parameters with documented defaults
- **Dependency-injected LLM** — modules that use an LLM accept a `(system_prompt, user_prompt) -> str` callable

## Quick start

```bash
# Install dependencies
pip install -r requirements.txt

# Import any module
from mplads_ai.vision_analysis.vision import fingerprint_image, detect_duplicates
from mplads_ai.presanction_scoring.scoring import score_proposal, ProposalInput
from mplads_ai.common.types import RiskSignal, InsufficientDataError
```

## Dependencies

| Package | Used by | Purpose |
|---|---|---|
| `Pillow` | vision_analysis, document_ocr | Image I/O, EXIF extraction |
| `imagehash` | vision_analysis | Perceptual hashing (pHash) |
| `pytesseract` | document_ocr | OCR text extraction |
| `scikit-learn` | complaint_nlp | TF-IDF vectorizer for complaint clustering |

All other modules use only the Python standard library.

> **Note**: `pytesseract` requires Tesseract to be installed on the host OS.
> On Ubuntu: `sudo apt install tesseract-ocr`
> On macOS: `brew install tesseract`
> On Windows: Download from [UB Mannheim](https://github.com/UB-Mannheim/tesseract/wiki)

## Per-module documentation

Each module directory contains its own `README.md` with:
- Detailed capability list
- Known false-positive / false-negative failure modes
- v1 → v2 migration path (rule-based → trained model)
