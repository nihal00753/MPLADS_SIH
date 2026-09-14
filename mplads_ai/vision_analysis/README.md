# Vision Analysis

## What it does

Detects duplicate/reused progress photos across MPLADS projects using perceptual hashing (pHash), and verifies that photo EXIF geotags are consistent with claimed project coordinates using the Haversine formula.

### Capabilities

| Function | Purpose |
|---|---|
| `fingerprint_image()` | Compute pHash + extract GPS from a single image |
| `detect_duplicates()` | Pairwise Hamming-distance comparison with configurable threshold |
| `verify_geotag()` | Haversine distance check: EXIF GPS vs. claimed coordinates |
| `to_risk_signals()` | Convert results into uniform `RiskSignal` objects |

## Known false-positive / false-negative failure modes

| Mode | Description |
|---|---|
| **False positive** | Two genuinely different photos of similar-looking construction stages (e.g., concrete foundations) may hash closely and be flagged as duplicates |
| **False positive** | Photos taken near a project boundary (within GPS tolerance) may be wrongly cleared as valid |
| **False negative** | A significantly cropped or rotated (>90°) duplicate may not be detected by pHash |
| **False negative** | EXIF GPS data can be stripped or spoofed; a photo with spoofed coordinates will pass geoverification |
| **Blind spot** | Images without EXIF data (screenshots, WhatsApp forwards) produce `MISSING_GEOTAG` warnings but no location verdict |

## v1 → v2 migration path

| Change | Details |
|---|---|
| **Duplicate detection** | Replace pHash with a CNN-based embedding model (e.g., ResNet features + cosine similarity) for robustness to cropping, rotation, and overlay text |
| **Geotag verification** | Add reverse-geocoding to verify the EXIF location is plausible (e.g., not in the ocean) and cross-reference with mobile network cell tower data |
| **Construction-stage classification** | Train a multi-class image classifier (concrete/framing/roofing/finished) on labelled progress photos; add as a new function alongside existing ones |
| **Scale** | Replace O(n²) pairwise comparison with locality-sensitive hashing (LSH) for datasets > 10k images |
