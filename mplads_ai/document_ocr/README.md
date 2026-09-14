# Document OCR

## What it does

Extracts text from scanned invoices and utilization certificates using Tesseract OCR, then parses three key financial fields — amount, date, and vendor name — using regex patterns tuned for Indian financial document conventions. Extracted values are compared against sanctioned figures to flag discrepancies.

### Capabilities

| Function | Purpose |
|---|---|
| `extract_text()` | Tesseract OCR wrapper — image → raw text |
| `parse_invoice_fields()` | Regex-based extraction of amount (₹/Rs/lakh/crore), date, vendor name |
| `diff_against_sanction()` | Compare extracted vs. sanctioned values with configurable tolerance |
| `to_risk_signals()` | Convert diffs into uniform `RiskSignal` objects |

## Known false-positive / false-negative failure modes

| Mode | Description |
|---|---|
| **False positive (amount)** | A line-item amount may be mistakenly extracted as the total when the actual total is in a different format or position |
| **False positive (vendor)** | A witness name or certifying officer name may match the vendor-name regex pattern |
| **False negative (amount)** | Handwritten amounts or non-standard notation (e.g., "Five Lakhs only") are not captured by regex |
| **False negative (date)** | Dates in regional-language scripts or non-standard formats (e.g., fiscal year "FY 2024-25") are missed |
| **Blind spot** | Low-resolution scans, skewed images, and multi-column layouts produce poor OCR text, cascading into extraction failures |

## v1 → v2 migration path

| Change | Details |
|---|---|
| **OCR engine** | Add pre-processing pipeline (deskew, binarisation, noise removal) and evaluate cloud OCR APIs (Google Document AI, Azure Form Recognizer) for higher accuracy on poor-quality scans |
| **Field extraction** | Replace regex with a fine-tuned layout-aware model (LayoutLM or Donut) trained on labelled MPLADS invoices |
| **Amount disambiguation** | Train a classifier to distinguish total amount from line-item amounts based on position and context |
| **Multi-language** | Add support for Hindi, Tamil, and other regional-language documents via language-specific Tesseract models |
