"""
Vision analysis for MPLADS project progress photos.

Provides three capabilities:
1. **Perceptual fingerprinting** — computes a pHash for each image so that
   visually similar photos (resized, recompressed, or lightly edited) can be
   detected even when their file hashes differ.
2. **Duplicate detection** — pairwise Hamming-distance comparison across a set
   of fingerprints with a configurable threshold (default 10 bits out of 64).
3. **Geotag verification** — compares EXIF GPS coordinates against claimed
   project coordinates using the Haversine formula.

Known limitations (v1):
- pHash is robust to resizing and JPEG compression but can miss duplicates
  where the image has been significantly cropped or rotated beyond 90°.
- EXIF GPS data can be trivially stripped or spoofed; this module detects
  *missing* geotags but cannot prove *present* ones are authentic.
- Construction-stage classification is a v2 stretch goal and is not
  implemented here.

Dependencies: Pillow >= 10.0, imagehash >= 4.3.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
import imagehash

from mplads_ai.common.types import InsufficientDataError, RiskSignal

MODULE_NAME = "vision_analysis"


# ---------------------------------------------------------------------------
# Data‑transfer objects
# ---------------------------------------------------------------------------

@dataclass
class ImageFingerprint:
    """Intermediate representation of one progress photo."""
    image_id: str
    phash: str                    # hex string of the perceptual hash
    gps_lat: Optional[float]     # decimal degrees, None if missing
    gps_lon: Optional[float]
    source_path: str


@dataclass
class DuplicateResult:
    """Result of comparing two image fingerprints."""
    image_a_id: str
    image_b_id: str
    hamming_distance: int
    is_duplicate: bool


@dataclass
class GeoverifyResult:
    """Result of checking an image's EXIF GPS against claimed coordinates."""
    image_id: str
    exif_lat: Optional[float]
    exif_lon: Optional[float]
    claimed_lat: float
    claimed_lon: float
    distance_km: Optional[float]  # None when EXIF GPS is missing
    is_within_threshold: Optional[bool]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _dms_to_decimal(dms: Tuple, ref: str) -> float:
    """Convert EXIF GPS degrees/minutes/seconds to decimal degrees."""
    degrees = float(dms[0])
    minutes = float(dms[1])
    seconds = float(dms[2])
    decimal = degrees + minutes / 60.0 + seconds / 3600.0
    if ref in ("S", "W"):
        decimal = -decimal
    return decimal


def _extract_gps(image: Image.Image) -> Tuple[Optional[float], Optional[float]]:
    """
    Extract GPS latitude and longitude from an image's EXIF data.

    Returns (None, None) when EXIF is absent or GPS tags are missing —
    never fabricates coordinates.
    """
    try:
        exif_data = image._getexif()
    except (AttributeError, Exception):
        return None, None

    if exif_data is None:
        return None, None

    gps_info = {}
    for tag_id, value in exif_data.items():
        tag_name = TAGS.get(tag_id, tag_id)
        if tag_name == "GPSInfo":
            for gps_tag_id, gps_value in value.items():
                gps_tag_name = GPSTAGS.get(gps_tag_id, gps_tag_id)
                gps_info[gps_tag_name] = gps_value

    if not gps_info:
        return None, None

    try:
        lat = _dms_to_decimal(
            gps_info["GPSLatitude"], gps_info["GPSLatitudeRef"]
        )
        lon = _dms_to_decimal(
            gps_info["GPSLongitude"], gps_info["GPSLongitudeRef"]
        )
        return lat, lon
    except (KeyError, TypeError, ValueError, ZeroDivisionError):
        return None, None


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great‑circle distance in kilometres between two points."""
    R = 6_371.0  # Earth radius in km
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def fingerprint_image(image_path: str, image_id: str) -> ImageFingerprint:
    """
    Compute the perceptual hash and extract GPS from a single image.

    Uses the pHash algorithm via ``imagehash.phash`` which is robust to
    JPEG recompression and moderate resizing.  GPS is extracted from EXIF
    GPSInfo tags; if the image has no EXIF or no GPS tags the lat/lon
    fields are set to ``None``.

    Raises:
        InsufficientDataError: if *image_path* does not exist or cannot
            be opened as an image.
    """
    path = Path(image_path)
    if not path.is_file():
        raise InsufficientDataError(
            MODULE_NAME,
            f"Image file does not exist: {image_path}",
        )

    try:
        img = Image.open(path)
    except Exception as exc:
        raise InsufficientDataError(
            MODULE_NAME,
            f"Cannot open image '{image_path}': {exc}",
        )

    phash = str(imagehash.phash(img))
    gps_lat, gps_lon = _extract_gps(img)

    return ImageFingerprint(
        image_id=image_id,
        phash=phash,
        gps_lat=gps_lat,
        gps_lon=gps_lon,
        source_path=image_path,
    )


def detect_duplicates(
    fingerprints: Sequence[ImageFingerprint],
    hamming_threshold: int = 10,
) -> List[DuplicateResult]:
    """
    Pairwise duplicate detection across a collection of image fingerprints.

    Two images are flagged as duplicates when their pHash Hamming distance
    is ≤ *hamming_threshold* (default 10 out of 64 bits).  Lower thresholds
    are stricter; a threshold of 0 means pixel‑identical after normalisation.

    Args:
        fingerprints: Sequence of ``ImageFingerprint`` objects.
        hamming_threshold: Maximum Hamming distance to consider a pair
            as duplicates.  Sensible range is 5–15; the default of 10
            balances recall against false positives.

    Returns:
        List of ``DuplicateResult`` for every pair where
        ``hamming_distance <= hamming_threshold``.

    Raises:
        InsufficientDataError: if fewer than 2 fingerprints are provided.
    """
    if len(fingerprints) < 2:
        raise InsufficientDataError(
            MODULE_NAME,
            f"Need at least 2 fingerprints for duplicate detection, "
            f"got {len(fingerprints)}.",
        )

    results: List[DuplicateResult] = []
    for i in range(len(fingerprints)):
        hash_i = imagehash.hex_to_hash(fingerprints[i].phash)
        for j in range(i + 1, len(fingerprints)):
            hash_j = imagehash.hex_to_hash(fingerprints[j].phash)
            dist = hash_i - hash_j  # Hamming distance
            if dist <= hamming_threshold:
                results.append(DuplicateResult(
                    image_a_id=fingerprints[i].image_id,
                    image_b_id=fingerprints[j].image_id,
                    hamming_distance=dist,
                    is_duplicate=True,
                ))

    return results


def verify_geotag(
    fingerprint: ImageFingerprint,
    claimed_lat: float,
    claimed_lon: float,
    radius_km: float = 1.0,
) -> GeoverifyResult:
    """
    Check whether an image's EXIF GPS location is within *radius_km* of
    the claimed project coordinates.

    When the image has no EXIF GPS data, the result's ``distance_km`` and
    ``is_within_threshold`` are ``None`` — the module never assumes a
    location.

    Args:
        fingerprint: The image fingerprint (must have been produced by
            ``fingerprint_image``).
        claimed_lat: Latitude of the project site (decimal degrees).
        claimed_lon: Longitude of the project site (decimal degrees).
        radius_km: Acceptable radius in kilometres (default 1.0 km).
    """
    if fingerprint.gps_lat is None or fingerprint.gps_lon is None:
        return GeoverifyResult(
            image_id=fingerprint.image_id,
            exif_lat=None,
            exif_lon=None,
            claimed_lat=claimed_lat,
            claimed_lon=claimed_lon,
            distance_km=None,
            is_within_threshold=None,
        )

    dist = _haversine_km(
        fingerprint.gps_lat, fingerprint.gps_lon, claimed_lat, claimed_lon
    )
    return GeoverifyResult(
        image_id=fingerprint.image_id,
        exif_lat=fingerprint.gps_lat,
        exif_lon=fingerprint.gps_lon,
        claimed_lat=claimed_lat,
        claimed_lon=claimed_lon,
        distance_km=round(dist, 3),
        is_within_threshold=dist <= radius_km,
    )


def to_risk_signals(
    duplicates: List[DuplicateResult],
    geoverify_results: List[GeoverifyResult],
) -> List[RiskSignal]:
    """
    Convert vision‑analysis results into uniform ``RiskSignal`` objects
    for the downstream risk‑scoring pipeline.
    """
    signals: List[RiskSignal] = []

    for dup in duplicates:
        severity = max(0.0, min(1.0, 1.0 - dup.hamming_distance / 64.0))
        signals.append(RiskSignal(
            signal_type="DUPLICATE_PHOTO",
            severity=round(severity, 3),
            reason=(
                f"Images '{dup.image_a_id}' and '{dup.image_b_id}' appear "
                f"visually identical (Hamming distance {dup.hamming_distance}/64)."
            ),
            metadata={
                "image_a_id": dup.image_a_id,
                "image_b_id": dup.image_b_id,
                "hamming_distance": dup.hamming_distance,
            },
        ))

    for geo in geoverify_results:
        if geo.is_within_threshold is False:
            severity = min(1.0, (geo.distance_km or 0) / 50.0)
            signals.append(RiskSignal(
                signal_type="GEOTAG_MISMATCH",
                severity=round(severity, 3),
                reason=(
                    f"Image '{geo.image_id}' was taken {geo.distance_km} km "
                    f"from the claimed project site."
                ),
                metadata={
                    "image_id": geo.image_id,
                    "exif_lat": geo.exif_lat,
                    "exif_lon": geo.exif_lon,
                    "claimed_lat": geo.claimed_lat,
                    "claimed_lon": geo.claimed_lon,
                    "distance_km": geo.distance_km,
                },
            ))
        elif geo.is_within_threshold is None:
            signals.append(RiskSignal(
                signal_type="MISSING_GEOTAG",
                severity=0.3,
                reason=(
                    f"Image '{geo.image_id}' has no EXIF GPS data; "
                    f"location cannot be verified."
                ),
                metadata={"image_id": geo.image_id},
            ))

    return signals
