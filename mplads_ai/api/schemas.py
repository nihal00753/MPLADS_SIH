"""
Pydantic schemas for the MPLADS AI/ML REST API.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Common Schemas
# ---------------------------------------------------------------------------

class RiskSignalSchema(BaseModel):
    """Uniform risk signal representation across all modules."""
    signal_type: str = Field(..., description="E.g., PRE_SANCTION_RISK, AMOUNT_MISMATCH, etc.")
    severity: float = Field(..., ge=0.0, le=1.0, description="Normalized severity 0.0 to 1.0")
    reason: str = Field(..., description="Human-readable explanation of the signal")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Context-specific details")


class HealthResponse(BaseModel):
    """System health and diagnostic status."""
    status: str = "healthy"
    version: str = "1.0.0"
    modules: Dict[str, bool] = Field(default_factory=dict)
    dataset_records: Dict[str, int] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Module 1: Pre-Sanction Scoring
# ---------------------------------------------------------------------------

class ProposalScoreRequest(BaseModel):
    """Input payload for scoring a new MPLADS work proposal."""
    sanction_amount: float = Field(..., gt=0, description="Proposed sanction amount in INR")
    category: str = Field(..., description="Work category, e.g., 'Drinking Water Facility'")
    region: str = Field(..., description="State or region name")
    season_month: Optional[int] = Field(None, ge=1, le=12, description="Proposal month (1-12)")
    vendor_id: Optional[str] = Field(None, description="Proposed vendor ID")
    vendor_past_delays: int = Field(0, ge=0, description="Number of stalled/delayed projects by vendor")
    vendor_past_anomalies: int = Field(0, ge=0, description="Number of past anomalies associated with vendor")
    vendor_total_projects: int = Field(0, ge=0, description="Total past projects completed by vendor")
    category_benchmark_amount: Optional[float] = Field(None, description="Expected median benchmark cost for category")
    region_risk_score: Optional[float] = Field(None, ge=0.0, le=1.0, description="Historical risk index of region")


class FactorContributionSchema(BaseModel):
    factor_name: str
    raw_value: Optional[float]
    weight: float
    contribution: float
    reason: str


class ProposalScoreResponse(BaseModel):
    overall_score: float
    risk_level: str
    factors: List[FactorContributionSchema]
    warnings: List[str] = Field(default_factory=list)
    recommendation: str
    risk_signals: List[RiskSignalSchema]


# ---------------------------------------------------------------------------
# Module 2: Document OCR
# ---------------------------------------------------------------------------

class InvoiceParseRequest(BaseModel):
    """Parse text extracted from an invoice or utilization certificate."""
    raw_text: str = Field(..., description="OCR text from invoice or utilization certificate")
    sanctioned_amount: Optional[float] = Field(None, description="Approved sanction amount in INR")
    sanctioned_date: Optional[str] = Field(None, description="Approved sanction date string")
    sanctioned_vendor: Optional[str] = Field(None, description="Approved vendor name")


class ExtractedFieldSchema(BaseModel):
    value: Any
    confidence: float
    raw_match: Optional[str] = None


class FieldDiffSchema(BaseModel):
    field_name: str
    extracted_value: Any
    sanctioned_value: Any
    discrepancy: Optional[float] = None
    reason: str


class InvoiceParseResponse(BaseModel):
    amount: ExtractedFieldSchema
    date: ExtractedFieldSchema
    vendor_name: ExtractedFieldSchema
    diffs: List[FieldDiffSchema]
    risk_signals: List[RiskSignalSchema]


# ---------------------------------------------------------------------------
# Module 3: Complaint NLP
# ---------------------------------------------------------------------------

class ComplaintTriageRequest(BaseModel):
    """Citizen complaint triage payload."""
    complaint_id: str
    text: str = Field(..., min_length=1, description="Raw complaint description")
    complainant_id: Optional[str] = None
    location: Optional[str] = None


class ComplaintTriageResponse(BaseModel):
    complaint_id: str
    urgency_score: float
    urgency_level: str
    category: str
    is_safety_hazard: bool
    summary: str
    key_concerns: List[str]
    used_fallback: bool
    risk_signals: List[RiskSignalSchema]


class ComplaintItem(BaseModel):
    complaint_id: str
    text: str


class ComplaintClusterRequest(BaseModel):
    complaints: List[ComplaintItem]
    distance_threshold: float = 0.6


class ClusterResultSchema(BaseModel):
    cluster_id: int
    complaint_ids: List[str]
    size: int
    representative_keywords: List[str]


class ComplaintClusterResponse(BaseModel):
    total_complaints: int
    num_clusters: int
    clusters: List[ClusterResultSchema]


# ---------------------------------------------------------------------------
# Module 4: Collusion Network Analysis
# ---------------------------------------------------------------------------

class VendorRecordSchema(BaseModel):
    vendor_id: str
    name: str
    pan: Optional[str] = None
    gstin: Optional[str] = None
    district: Optional[str] = None


class ResolveEntitiesRequest(BaseModel):
    vendors: List[VendorRecordSchema]
    name_similarity_threshold: float = 0.85


class ResolvedEntitySchema(BaseModel):
    canonical_id: str
    member_ids: List[str]
    match_reasons: List[str]


class ResolveEntitiesResponse(BaseModel):
    total_input: int
    total_resolved: int
    merged_groups_count: int
    entities: List[ResolvedEntitySchema]


class CollusionClusterSchema(BaseModel):
    cluster_id: int
    entity_ids: List[str]
    official_ids: List[str]
    risk_score: float
    reasons: List[str]


class CollusionDetectionResponse(BaseModel):
    total_edges: int
    num_clusters: int
    clusters: List[CollusionClusterSchema]
    risk_signals: List[RiskSignalSchema]


class HubVendorSchema(BaseModel):
    vendor_id: str
    vendor_name: str
    state: str
    project_count: int
    total_sanction_amount: float
    is_hub: bool


# ---------------------------------------------------------------------------
# Module 5: Vision Analysis
# ---------------------------------------------------------------------------

class FingerprintRequest(BaseModel):
    image_path: str
    image_id: str


class FingerprintResponse(BaseModel):
    image_id: str
    phash: str
    gps_lat: Optional[float] = None
    gps_lon: Optional[float] = None
    source_path: str


class ImageFingerprintSchema(BaseModel):
    image_id: str
    phash: str
    gps_lat: Optional[float] = None
    gps_lon: Optional[float] = None
    source_path: str = ""


class DetectDuplicatesRequest(BaseModel):
    fingerprints: List[ImageFingerprintSchema]
    hamming_threshold: int = 10


class DuplicateResultSchema(BaseModel):
    image_a_id: str
    image_b_id: str
    hamming_distance: int
    is_duplicate: bool


class GeoverifyRequest(BaseModel):
    fingerprint: ImageFingerprintSchema
    claimed_lat: float
    claimed_lon: float
    radius_km: float = 1.0


class GeoverifyResponse(BaseModel):
    image_id: str
    exif_lat: Optional[float] = None
    exif_lon: Optional[float] = None
    claimed_lat: float
    claimed_lon: float
    distance_km: Optional[float] = None
    is_within_threshold: Optional[bool] = None
    risk_signals: List[RiskSignalSchema] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Module 6: NL Query Assistant
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1, description="Question in plain English")
    custom_summary: Optional[str] = Field(None, description="Optional custom data context override")


class QueryResponse(BaseModel):
    question: str
    answer: str
    confidence: str
    data_used: str = ""
    warnings: List[str]
    used_fallback: bool
    risk_signals: List[RiskSignalSchema]
    sources: List[Dict[str, Any]] = []
    model: str = ""


# ---------------------------------------------------------------------------
# Role-Based Dashboard Schemas
# ---------------------------------------------------------------------------

class MPDashboardResponse(BaseModel):
    mp_name: str
    constituency: str
    state: str
    allocated_limit_cr: float
    total_works: int
    total_sanctioned_cr: float
    completed_works: int
    stalled_works: int
    anomaly_works_count: int
    top_anomalous_works: List[Dict[str, Any]]
    work_categories_distribution: Dict[str, int]


class DistrictDashboardResponse(BaseModel):
    district_name: str
    state: str
    total_works: int
    total_sanctioned_cr: float
    anomalous_works_count: int
    contractors_active: int
    top_hub_contractors: List[Dict[str, Any]]
    flagged_works: List[Dict[str, Any]]


class StateDashboardResponse(BaseModel):
    state_name: str
    total_works: int
    total_sanctioned_cr: float
    total_anomalies: int
    anomaly_rate_pct: float
    stalled_works: int
    top_districts_by_risk: List[Dict[str, Any]]
    collusion_clusters_detected: int


class MinistryDashboardResponse(BaseModel):
    national_total_works: int
    national_total_sanctioned_cr: float
    national_total_mps: int
    national_anomalies_count: int
    national_anomaly_rate_pct: float
    anomaly_type_breakdown: Dict[str, int]
    top_risk_states: List[Dict[str, Any]]
    high_risk_contractor_count: int


# ---------------------------------------------------------------------------
# Module 7: Data Engineering & Ingestion Pipeline
# ---------------------------------------------------------------------------

class IngestionUploadResponse(BaseModel):
    task_id: str = Field(..., description="Unique task identifier for tracking progress")
    status: str = Field("accepted", description="Task status: accepted")
    message: str = Field(..., description="Status message")


class IngestionStatusResponse(BaseModel):
    task_id: str = Field(..., description="Unique task identifier")
    status: str = Field(..., description="Task status: pending | running | completed | failed")
    report: Optional[Dict[str, Any]] = Field(None, description="Ingestion report once completed")
    error: Optional[str] = Field(None, description="Error message if task failed")


class QuarantineRecordSchema(BaseModel):
    row_index: int
    errors: List[str]
    reason: str
    original_row: Optional[Dict[str, Any]] = None
