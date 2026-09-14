"""
FastAPI Application — Unified API layer for MPLADS AI/ML Platform.
Exposes endpoints for all 6 AI/ML modules and provides role-based data views.
"""

from __future__ import annotations

import csv
import io
import json
import os
import uuid
from collections import Counter, defaultdict
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from mplads_ai.common.types import InsufficientDataError, RiskSignal
from mplads_ai.presanction_scoring.scoring import (
    ProposalInput,
    score_proposal,
    to_risk_signals as scoring_signals,
)
from mplads_ai.document_ocr.ocr import (
    diff_against_sanction,
    parse_invoice_fields,
    to_risk_signals as ocr_signals,
)
from mplads_ai.complaint_nlp.nlp import (
    cluster_complaints,
    triage_complaint,
    to_risk_signals as nlp_signals,
)
from mplads_ai.collusion_network.network import (
    ProjectAssignment,
    VendorRecord,
    build_cooccurrence_graph,
    detect_collusion_clusters,
    resolve_entities,
    to_risk_signals as collusion_signals,
)
from mplads_ai.vision_analysis.vision import (
    ImageFingerprint,
    detect_duplicates,
    fingerprint_image,
    verify_geotag,
    to_risk_signals as vision_signals,
)
from mplads_ai.nl_query.query import (
    QueryContext,
    answer_query,
    to_risk_signals as nl_signals,
)

from mplads_ai.api.schemas import (
    ClusterResultSchema,
    CollusionClusterSchema,
    CollusionDetectionResponse,
    ComplaintClusterRequest,
    ComplaintClusterResponse,
    ComplaintTriageRequest,
    ComplaintTriageResponse,
    DetectDuplicatesRequest,
    DistrictDashboardResponse,
    DuplicateResultSchema,
    ExtractedFieldSchema,
    FactorContributionSchema,
    FieldDiffSchema,
    FingerprintRequest,
    FingerprintResponse,
    GeoverifyRequest,
    GeoverifyResponse,
    HealthResponse,
    HubVendorSchema,
    IngestionStatusResponse,
    IngestionUploadResponse,
    InvoiceParseRequest,
    InvoiceParseResponse,
    MinistryDashboardResponse,
    MPDashboardResponse,
    ProposalScoreRequest,
    ProposalScoreResponse,
    QuarantineRecordSchema,
    QueryRequest,
    QueryResponse,
    ResolveEntitiesRequest,
    ResolveEntitiesResponse,
    ResolvedEntitySchema,
    RiskSignalSchema,
    StateDashboardResponse,
    VendorRecordSchema,
)
from mplads_ai.pipeline import ingest_unorganized_dataset, refresh_app_datastore

# ---------------------------------------------------------------------------
# Global In-Memory Datastore & Cache
# ---------------------------------------------------------------------------

DATA_DIR = Path(r"d:\MPLADS AIML\test_data")

db: Dict[str, Any] = {
    "works": [],
    "vendors": [],
    "payments": [],
    "mp_master": [],
    "works_by_id": {},
    "works_by_mp": defaultdict(list),
    "works_by_district": defaultdict(list),
    "works_by_state": defaultdict(list),
    "vendor_stats": defaultdict(lambda: {"total": 0, "delays": 0, "anomalies": 0, "amount": 0.0}),
    "benchmarks_by_category": {},
    "hub_vendors": [],
    "data_summary_text": "",
}


def _load_dataset() -> None:
    """Load and index synthetic datasets on startup."""
    if not DATA_DIR.exists():
        return

    def load_csv(filename: str) -> List[Dict[str, str]]:
        p = DATA_DIR / filename
        if not p.exists():
            return []
        with open(p, encoding="utf-8") as f:
            return list(csv.DictReader(f))

    works = load_csv("mplads_synthetic_works.csv")
    vendors = load_csv("mplads_synthetic_vendors.csv")
    payments = load_csv("mplads_synthetic_payments.csv")
    mps = load_csv("mplads_mp_master_real.csv")

    db["works"] = works
    db["vendors"] = vendors
    db["payments"] = payments
    db["mp_master"] = mps

    # Indexes
    works_by_id = {}
    works_by_mp = defaultdict(list)
    works_by_district = defaultdict(list)
    works_by_state = defaultdict(list)
    vendor_stats = defaultdict(lambda: {"total": 0, "delays": 0, "anomalies": 0, "amount": 0.0})
    benchmarks: Dict[str, Dict[str, float]] = {}

    for w in works:
        wid = w["unique_work_number"]
        works_by_id[wid] = w
        works_by_mp[w["mp_name"]].append(w)
        works_by_district[w["nodal_district"]].append(w)
        works_by_district[w["implementing_district"]].append(w)
        works_by_state[w["state"]].append(w)

        # Vendor statistics
        vid = w.get("vendor_id", "")
        if vid:
            vs = vendor_stats[vid]
            vs["total"] += 1
            vs["amount"] += float(w.get("sanction_amount", 0) or 0)
            if w.get("work_status") == "Stalled":
                vs["delays"] += 1
            if w.get("is_anomaly") == "1":
                vs["anomalies"] += 1

        # Category benchmarks
        cat = w.get("work_category", "")
        if cat and cat not in benchmarks:
            try:
                b_min = float(w["category_benchmark_min"])
                b_max = float(w["category_benchmark_max"])
                benchmarks[cat] = {"min": b_min, "max": b_max, "median": (b_min + b_max) / 2.0}
            except (ValueError, KeyError):
                pass

    db["works_by_id"] = works_by_id
    db["works_by_mp"] = works_by_mp
    db["works_by_district"] = works_by_district
    db["works_by_state"] = works_by_state
    db["vendor_stats"] = vendor_stats
    db["benchmarks_by_category"] = benchmarks

    # Hub vendors
    hub_vids = {v["vendor_id"] for v in vendors if v.get("is_hub") == "True"}
    hub_list = []
    for v in vendors:
        vid = v["vendor_id"]
        vs = vendor_stats[vid]
        hub_list.append(HubVendorSchema(
            vendor_id=vid,
            vendor_name=v.get("vendor_name", ""),
            state=v.get("state", ""),
            project_count=vs["total"],
            total_sanction_amount=vs["amount"],
            is_hub=(vid in hub_vids),
        ))
    db["hub_vendors"] = sorted(hub_list, key=lambda x: x.project_count, reverse=True)

    # Build data summary text for natural language query assistant
    total_anomalies = sum(1 for w in works if w.get("is_anomaly") == "1")
    total_stalled = sum(1 for w in works if w.get("work_status") == "Stalled")
    total_amt = sum(float(w.get("sanction_amount", 0) or 0) for w in works)
    db["data_summary_text"] = (
        f"MPLADS Dataset Overview:\n"
        f"- Total works: {len(works)}\n"
        f"- Total sanctioned amount: ₹{total_amt/1e7:.2f} Crore\n"
        f"- Total MPs covered: {len(mps)}\n"
        f"- Total vendors: {len(vendors)} (Hub vendors: {len(hub_vids)})\n"
        f"- Total anomalous works: {total_anomalies} (Rate: {total_anomalies/len(works)*100:.1f}%)\n"
        f"- Total stalled works: {total_stalled}\n"
    )


# ---------------------------------------------------------------------------
# Lifespan Context Manager
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_dataset()

    # Initialize RAG pipeline
    try:
        from mplads_ai.rag.indexer import build_index
        from mplads_ai.rag.retriever import init_retriever

        faiss_index, chunks_text, chunks_meta = build_index()
        init_retriever(faiss_index, chunks_text, chunks_meta)
        print(f"[RAG] Pipeline ready: {len(chunks_text)} chunks indexed")
    except Exception as e:
        print(f"[RAG] Failed to initialize RAG pipeline: {e}")
        import traceback
        traceback.print_exc()

    yield


# ---------------------------------------------------------------------------
# App Initialization
# ---------------------------------------------------------------------------

app = FastAPI(
    title="MPLADS AI/ML Intelligence Platform API",
    description="Unified API service connecting 6 AI/ML feature modules to backend systems and role-based frontend dashboards.",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for any frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static folder for interactive dashboard
STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ---------------------------------------------------------------------------
# Exception Handlers
# ---------------------------------------------------------------------------

@app.exception_handler(InsufficientDataError)
async def insufficient_data_handler(request: Request, exc: InsufficientDataError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error_type": "InsufficientDataError",
            "module": exc.module,
            "detail": exc.reason,
        },
    )


# ---------------------------------------------------------------------------
# Core & Health Endpoints
# ---------------------------------------------------------------------------

@app.get("/", include_in_schema=False)
async def root():
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {
        "title": "MPLADS AI/ML Intelligence Platform",
        "documentation": "/docs",
        "dashboard": "/dashboard",
        "health": "/api/health",
    }


@app.get("/dashboard", include_in_schema=False)
async def dashboard_page():
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="Dashboard UI not found")


@app.get("/api/health", response_model=HealthResponse, tags=["Diagnostics"])
def health_check():
    """System health check and loaded dataset telemetry."""
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        modules={
            "vision_analysis": True,
            "document_ocr": True,
            "complaint_nlp": True,
            "presanction_scoring": True,
            "collusion_network": True,
            "nl_query": True,
        },
        dataset_records={
            "works": len(db["works"]),
            "vendors": len(db["vendors"]),
            "payments": len(db["payments"]),
            "mps": len(db["mp_master"]),
        },
    )


# ---------------------------------------------------------------------------
# Module 1: Pre-Sanction Scoring
# ---------------------------------------------------------------------------

@app.post("/api/scoring/score", response_model=ProposalScoreResponse, tags=["Pre-Sanction Scoring"])
def score_work_proposal(req: ProposalScoreRequest):
    """
    Score a proposed MPLADS work across 6 explainable risk factors.
    Returns composite score, risk level, factor contributions, and RiskSignals.
    """
    # Auto-fill benchmark and vendor history if available from datastore
    category_benchmark = req.category_benchmark_amount
    if category_benchmark is None and req.category in db["benchmarks_by_category"]:
        category_benchmark = db["benchmarks_by_category"][req.category]["median"]

    past_delays = req.vendor_past_delays
    past_anomalies = req.vendor_past_anomalies
    total_projects = req.vendor_total_projects

    if req.vendor_id and total_projects == 0 and req.vendor_id in db["vendor_stats"]:
        v = db["vendor_stats"][req.vendor_id]
        past_delays = v["delays"]
        past_anomalies = v["anomalies"]
        total_projects = v["total"]

    proposal = ProposalInput(
        sanction_amount=req.sanction_amount,
        category=req.category,
        region=req.region,
        season_month=req.season_month,
        vendor_id=req.vendor_id,
        vendor_past_delays=past_delays,
        vendor_past_anomalies=past_anomalies,
        vendor_total_projects=total_projects,
        category_benchmark_amount=category_benchmark,
        region_risk_score=req.region_risk_score,
    )

    result = score_proposal(proposal)
    signals = scoring_signals(result)

    recommendation = (
        "Flag for scrutiny: high risk detected across historical factors."
        if result.risk_level == "HIGH"
        else "Review recommended: moderate risk signals present."
        if result.risk_level == "MEDIUM"
        else "Proceed to sanction: low risk profile."
        if result.risk_level == "LOW"
        else "Hold proposal: insufficient data for reliable scoring."
    )

    return ProposalScoreResponse(
        overall_score=result.overall_score,
        risk_level=result.risk_level,
        factors=[
            FactorContributionSchema(
                factor_name=fc.factor_name,
                raw_value=fc.raw_value,
                weight=fc.weight,
                contribution=fc.contribution,
                reason=fc.reason,
            )
            for fc in result.factors
        ],
        warnings=result.warnings,
        recommendation=recommendation,
        risk_signals=[
            RiskSignalSchema(
                signal_type=s.signal_type,
                severity=s.severity,
                reason=s.reason,
                metadata=s.metadata,
            )
            for s in signals
        ],
    )


@app.get("/api/scoring/benchmarks", tags=["Pre-Sanction Scoring"])
def get_category_benchmarks():
    """Retrieve cost benchmarks across all recognized MPLADS work categories."""
    return db.get("benchmarks_by_category", {})


# ---------------------------------------------------------------------------
# Module 2: Document OCR
# ---------------------------------------------------------------------------

@app.post("/api/ocr/parse", response_model=InvoiceParseResponse, tags=["Document OCR"])
def parse_invoice_text(req: InvoiceParseRequest):
    """
    Parse invoice / utilization certificate text, extract amount/date/vendor,
    and diff against sanctioned parameters.
    """
    fields = parse_invoice_fields(req.raw_text)
    diffs = diff_against_sanction(
        fields,
        sanctioned_amount=req.sanctioned_amount,
        sanctioned_date=req.sanctioned_date,
        sanctioned_vendor=req.sanctioned_vendor,
    )
    signals = ocr_signals(diffs)

    return InvoiceParseResponse(
        amount=ExtractedFieldSchema(
            value=fields.amount,
            confidence=0.9 if fields.amount is not None else 0.0,
            raw_match=str(fields.amount) if fields.amount is not None else None,
        ),
        date=ExtractedFieldSchema(
            value=fields.date,
            confidence=0.85 if fields.date is not None else 0.0,
            raw_match=fields.date,
        ),
        vendor_name=ExtractedFieldSchema(
            value=fields.vendor_name,
            confidence=0.80 if fields.vendor_name is not None else 0.0,
            raw_match=fields.vendor_name,
        ),
        diffs=[
            FieldDiffSchema(
                field_name=d.field_name,
                extracted_value=d.extracted_value,
                sanctioned_value=d.sanctioned_value,
                discrepancy=d.discrepancy,
                reason=d.reason,
            )
            for d in diffs
        ],
        risk_signals=[
            RiskSignalSchema(
                signal_type=s.signal_type,
                severity=s.severity,
                reason=s.reason,
                metadata=s.metadata,
            )
            for s in signals
        ],
    )


# ---------------------------------------------------------------------------
# Module 3: Complaint NLP
# ---------------------------------------------------------------------------

@app.post("/api/complaints/triage", response_model=ComplaintTriageResponse, tags=["Complaint NLP"])
def triage_citizen_complaint(req: ComplaintTriageRequest):
    """
    Triage citizen grievance: assesses urgency level, detects safety hazards,
    and categorizes the issue.
    """
    def default_llm(sp: str, up: str) -> str:
        text_lower = up.lower()
        if any(w in text_lower for w in ["collapse", "collapsed", "danger", "death", "emergency", "flood", "hazard"]):
            return json.dumps({
                "urgency": "HIGH",
                "category": "Road" if ("road" in text_lower or "culvert" in text_lower) else "Infrastructure",
                "summary": up[:100],
            })
        elif any(w in text_lower for w in ["delay", "pending", "broken", "leak", "stalled"]):
            return json.dumps({
                "urgency": "MEDIUM",
                "category": "Water Supply" if "water" in text_lower else "Infrastructure",
                "summary": up[:100],
            })
        else:
            return json.dumps({
                "urgency": "LOW",
                "category": "Other",
                "summary": up[:100],
            })

    result = triage_complaint(req.text, default_llm)
    signals = nlp_signals([result])
    urg_score = 1.0 if result.urgency == "HIGH" else 0.5 if result.urgency == "MEDIUM" else 0.1

    return ComplaintTriageResponse(
        complaint_id=req.complaint_id,
        urgency_score=urg_score,
        urgency_level=result.urgency,
        category=result.category,
        is_safety_hazard=(result.urgency == "HIGH"),
        summary=result.summary,
        key_concerns=[result.summary] if result.summary else [],
        used_fallback=result.used_fallback,
        risk_signals=[
            RiskSignalSchema(
                signal_type=s.signal_type,
                severity=s.severity,
                reason=s.reason,
                metadata=s.metadata,
            )
            for s in signals
        ],
    )


@app.post("/api/complaints/cluster", response_model=ComplaintClusterResponse, tags=["Complaint NLP"])
def cluster_citizen_complaints(req: ComplaintClusterRequest):
    """Cluster near-duplicate citizen complaints using TF-IDF and agglomerative clustering."""
    input_dicts = [{"id": c.complaint_id, "text": c.text} for c in req.complaints]
    clusters = cluster_complaints(input_dicts, similarity_threshold=max(0.1, 1.0 - req.distance_threshold))

    return ComplaintClusterResponse(
        total_complaints=len(req.complaints),
        num_clusters=len(clusters),
        clusters=[
            ClusterResultSchema(
                cluster_id=cl.cluster_id,
                complaint_ids=cl.complaint_ids,
                size=len(cl.complaint_ids),
                representative_keywords=cl.representative_text.split()[:5],
            )
            for cl in clusters
        ],
    )


# ---------------------------------------------------------------------------
# Module 4: Collusion Network Analysis
# ---------------------------------------------------------------------------

@app.post("/api/network/resolve-entities", response_model=ResolveEntitiesResponse, tags=["Collusion Network"])
def run_entity_resolution(req: ResolveEntitiesRequest):
    """
    Resolve and merge duplicate vendor identities via exact PAN, GSTIN,
    and legal-suffix-cleaned fuzzy matching.
    """
    records = [
        VendorRecord(
            vendor_id=v.vendor_id,
            name=v.name,
            pan=v.pan,
            gstin=v.gstin,
            district=v.district,
        )
        for v in req.vendors
    ]
    resolved = resolve_entities(records, name_similarity_threshold=req.name_similarity_threshold)
    merged_count = sum(1 for e in resolved if len(e.member_ids) > 1)

    return ResolveEntitiesResponse(
        total_input=len(req.vendors),
        total_resolved=len(resolved),
        merged_groups_count=merged_count,
        entities=[
            ResolvedEntitySchema(
                canonical_id=e.canonical_id,
                member_ids=e.member_ids,
                match_reasons=e.match_reasons,
            )
            for e in resolved
        ],
    )


@app.post("/api/network/detect-clusters", response_model=CollusionDetectionResponse, tags=["Collusion Network"])
def run_collusion_detection(min_score: float = 0.5):
    """
    Run bipartite graph co-occurrence analysis on project assignments
    to detect vendor-agency collusion clusters.
    """
    # Use real project assignments from works dataset
    assignments = [
        ProjectAssignment(
            project_id=w["unique_work_number"],
            entity_id=w["vendor_id"],
            official_id=w["implementing_agency_name"],
        )
        for w in db["works"][:2500]
        if w.get("vendor_id") and w.get("implementing_agency_name")
    ]

    if len(assignments) < 2:
        raise HTTPException(status_code=400, detail="Insufficient assignments loaded")

    # Group unique vendors
    unique_vids = list(set(a.entity_id for a in assignments))[:60]
    vendor_records = [VendorRecord(vendor_id=vid, name=vid) for vid in unique_vids]
    resolved = resolve_entities(vendor_records, name_similarity_threshold=0.90)

    edges = build_cooccurrence_graph(
        resolved_entities=resolved,
        assignments=assignments,
        min_shared_projects=2,
    )
    clusters = detect_collusion_clusters(edges, min_score=min_score)
    signals = collusion_signals(clusters)

    return CollusionDetectionResponse(
        total_edges=len(edges),
        num_clusters=len(clusters),
        clusters=[
            CollusionClusterSchema(
                cluster_id=cl.cluster_id,
                entity_ids=cl.entity_ids,
                official_ids=cl.official_ids,
                risk_score=cl.risk_score,
                reasons=cl.reasons,
            )
            for cl in clusters
        ],
        risk_signals=[
            RiskSignalSchema(
                signal_type=s.signal_type,
                severity=s.severity,
                reason=s.reason,
                metadata=s.metadata,
            )
            for s in signals
        ],
    )


@app.get("/api/network/hubs", response_model=List[HubVendorSchema], tags=["Collusion Network"])
def get_hub_vendors(limit: int = 25):
    """Retrieve top contractor concentration hubs."""
    return db["hub_vendors"][:limit]


# ---------------------------------------------------------------------------
# Module 5: Vision Analysis
# ---------------------------------------------------------------------------

@app.post("/api/vision/fingerprint", response_model=FingerprintResponse, tags=["Vision Analysis"])
def fingerprint_photo(req: FingerprintRequest):
    """Generate perceptual hash and extract EXIF GPS coordinates from a progress photo."""
    fp = fingerprint_image(req.image_path, req.image_id)
    return FingerprintResponse(
        image_id=fp.image_id,
        phash=fp.phash,
        gps_lat=fp.gps_lat,
        gps_lon=fp.gps_lon,
        source_path=fp.source_path,
    )


@app.post("/api/vision/detect-duplicates", response_model=List[DuplicateResultSchema], tags=["Vision Analysis"])
def detect_duplicate_photos(req: DetectDuplicatesRequest):
    """Detect duplicate or reused progress photos across projects."""
    fps = [
        ImageFingerprint(
            image_id=f.image_id,
            phash=f.phash,
            gps_lat=f.gps_lat,
            gps_lon=f.gps_lon,
            source_path=f.source_path,
        )
        for f in req.fingerprints
    ]
    dups = detect_duplicates(fps, hamming_threshold=req.hamming_threshold)
    return [
        DuplicateResultSchema(
            image_a_id=d.image_a_id,
            image_b_id=d.image_b_id,
            hamming_distance=d.hamming_distance,
            is_duplicate=d.is_duplicate,
        )
        for d in dups
    ]


@app.post("/api/vision/geoverify", response_model=GeoverifyResponse, tags=["Vision Analysis"])
def verify_photo_geotag(req: GeoverifyRequest):
    """Verify photo EXIF coordinates against claimed project site coordinates."""
    fp = ImageFingerprint(
        image_id=req.fingerprint.image_id,
        phash=req.fingerprint.phash,
        gps_lat=req.fingerprint.gps_lat,
        gps_lon=req.fingerprint.gps_lon,
        source_path=req.fingerprint.source_path,
    )
    res = verify_geotag(fp, req.claimed_lat, req.claimed_lon, radius_km=req.radius_km)
    signals = vision_signals([], [res])

    return GeoverifyResponse(
        image_id=res.image_id,
        exif_lat=res.exif_lat,
        exif_lon=res.exif_lon,
        claimed_lat=res.claimed_lat,
        claimed_lon=res.claimed_lon,
        distance_km=res.distance_km,
        is_within_threshold=res.is_within_threshold,
        risk_signals=[
            RiskSignalSchema(
                signal_type=s.signal_type,
                severity=s.severity,
                reason=s.reason,
                metadata=s.metadata,
            )
            for s in signals
        ],
    )


# ---------------------------------------------------------------------------
# Module 6: Natural Language Query Assistant
# ---------------------------------------------------------------------------

@app.post("/api/query/ask", response_model=QueryResponse, tags=["NL Query Assistant"])
def ask_platform_query(req: QueryRequest):
    """
    Ask questions in plain English grounded in actual MPLADS fund data.
    Uses RAG pipeline: FAISS vector search + Gemini 2.0 Flash generation.
    """
    from mplads_ai.rag.retriever import is_ready as rag_ready, retrieve
    from mplads_ai.rag.generator import generate

    # Use RAG pipeline if available
    if rag_ready():
        retrieved = retrieve(req.question, top_k=10)
        result = generate(req.question, retrieved)

        return QueryResponse(
            question=req.question,
            answer=result["answer"],
            confidence=str(result["confidence"]),
            data_used=result["data_used"],
            warnings=result.get("warnings", []),
            used_fallback=result.get("used_fallback", False),
            risk_signals=[],
            sources=result.get("sources", []),
            model=result.get("model", "gemini-3.6-flash"),
        )

    # Fallback to deterministic handler if RAG not ready
    summary = req.custom_summary or db.get("data_summary_text", "")

    context = QueryContext(
        data_summary=summary,
        available_metrics=["total_works", "total_sanctioned", "anomalies", "stalled_works", "mps"],
        time_range="18th Lok Sabha (FY 2024-2026)",
        raw_data_snippet=summary,
    )

    def local_llm_runner(system_prompt: str, user_prompt: str) -> str:
        q_lower = req.question.lower()
        if "how many works" in q_lower or "total works" in q_lower:
            return f"According to the records, there are {len(db['works'])} total works sanctioned under the program."
        elif "anomaly" in q_lower or "anomalies" in q_lower or "fraud" in q_lower:
            anom_count = sum(1 for w in db["works"] if w.get("is_anomaly") == "1")
            return f"There are {anom_count} anomalous works flagged across all states and categories."
        elif "mp" in q_lower or "members" in q_lower:
            return f"There are {len(db['mp_master'])} Member of Parliament records tracked."
        else:
            return f"Based on the official data summary:\n{summary}"

    result = answer_query(req.question, context, local_llm_runner)
    signals = nl_signals(result)

    return QueryResponse(
        question=req.question,
        answer=result.answer,
        confidence=result.confidence,
        data_used=result.data_used,
        warnings=result.warnings,
        used_fallback=result.used_fallback,
        risk_signals=[
            RiskSignalSchema(
                signal_type=s.signal_type,
                severity=s.severity,
                reason=s.reason,
                metadata=s.metadata,
            )
            for s in signals
        ],
    )


@app.get("/api/query/rag-status", tags=["NL Query Assistant"])
def get_rag_status():
    """Check the health and statistics of the RAG pipeline."""
    try:
        from mplads_ai.rag.retriever import get_stats
        return get_stats()
    except Exception:
        return {"status": "not_initialized", "total_chunks": 0}


# ---------------------------------------------------------------------------
# Aggregated Cross-Module Work Risk Profile
# ---------------------------------------------------------------------------

@app.get("/api/works/{work_id}/risk-profile", tags=["Cross-Module Pipeline"])
def get_work_risk_profile(work_id: str):
    """
    Retrieve comprehensive multi-module risk profile and all active RiskSignals
    for a specific project.
    """
    work = db["works_by_id"].get(work_id)
    if not work:
        raise HTTPException(status_code=404, detail=f"Work '{work_id}' not found")

    signals: List[RiskSignal] = []

    # 1. Cost-overrun check
    amt = float(work.get("sanction_amount", 0) or 0)
    cat = work.get("work_category", "")
    bm = db["benchmarks_by_category"].get(cat, {})
    if bm and amt > bm.get("max", 0) * 1.5:
        signals.append(RiskSignal(
            signal_type="COST_OVERRUN_ANOMALY",
            severity=min(1.0, amt / (bm.get("max", 1) * 2.5)),
            reason=f"Sanction amount ₹{amt:,.2f} exceeds benchmark maximum ₹{bm.get('max'):,.2f} by >50%",
            metadata={"sanction_amount": amt, "benchmark_max": bm.get("max")},
        ))

    # 2. Ghost project progress mismatch
    phys = float(work.get("physical_progress_pct", 0) or 0)
    fin = float(work.get("financial_progress_pct", 0) or 0)
    if fin >= 80 and phys <= 20:
        signals.append(RiskSignal(
            signal_type="GHOST_PROJECT_SUSPECT",
            severity=0.95,
            reason=f"Extreme progress divergence: financial progress is {fin:.0f}% but physical completion is only {phys:.0f}%",
            metadata={"financial_progress_pct": fin, "physical_progress_pct": phys},
        ))

    # 3. Work status stalled check
    if work.get("work_status") == "Stalled":
        signals.append(RiskSignal(
            signal_type="WORK_STALLED",
            severity=0.70,
            reason="Work has been officially flagged as Stalled with halted execution.",
            metadata={"work_status": "Stalled"},
        ))

    # 4. Hub vendor check
    vid = work.get("vendor_id", "")
    hub_vids = {h.vendor_id for h in db["hub_vendors"] if h.is_hub}
    if vid in hub_vids:
        signals.append(RiskSignal(
            signal_type="HUB_VENDOR_CONCENTRATION",
            severity=0.65,
            reason=f"Assigned vendor '{work.get('vendor_name')}' ({vid}) is flagged as a high-concentration hub contractor.",
            metadata={"vendor_id": vid},
        ))

    return {
        "work_details": work,
        "total_risk_signals": len(signals),
        "composite_risk_score": max([s.severity for s in signals], default=0.1),
        "risk_signals": [
            RiskSignalSchema(
                signal_type=s.signal_type,
                severity=s.severity,
                reason=s.reason,
                metadata=s.metadata,
            )
            for s in signals
        ],
    }


# ---------------------------------------------------------------------------
# Role-Based Dashboard Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/dashboard/overview", tags=["Dashboards"])
def get_platform_overview():
    """National-level KPI metrics across works, funds, anomalies, and contractors."""
    works = db["works"]
    mps = db["mp_master"]
    anomalies = sum(1 for w in works if w.get("is_anomaly") == "1")
    total_amt = sum(float(w.get("sanction_amount", 0) or 0) for w in works)
    stalled = sum(1 for w in works if w.get("work_status") == "Stalled")

    return {
        "total_works": len(works),
        "total_sanctioned_cr": round(total_amt / 1e7, 2),
        "total_mps": len(mps),
        "total_anomalies": anomalies,
        "anomaly_rate_pct": round(anomalies / len(works) * 100, 2) if works else 0.0,
        "stalled_works": stalled,
        "hub_contractors_count": len([h for h in db["hub_vendors"] if h.is_hub]),
    }


@app.get("/api/dashboard/mp/{mp_name}", response_model=MPDashboardResponse, tags=["Dashboards"])
def get_mp_dashboard(mp_name: str):
    """Role-based dashboard for Member of Parliament."""
    works = db["works_by_mp"].get(mp_name, [])
    if not works:
        # Fuzzy match
        for name, w_list in db["works_by_mp"].items():
            if mp_name.lower() in name.lower():
                works = w_list
                mp_name = name
                break

    if not works:
        raise HTTPException(status_code=404, detail=f"MP '{mp_name}' not found")

    first = works[0]
    total_amt = sum(float(w.get("sanction_amount", 0) or 0) for w in works)
    completed = sum(1 for w in works if w.get("work_status") == "Completed")
    stalled = sum(1 for w in works if w.get("work_status") == "Stalled")
    anomalous = [w for w in works if w.get("is_anomaly") == "1"]

    categories = Counter(w.get("work_category", "Other") for w in works)

    # Find MP master record for allocated limit
    mp_rec = next((m for m in db["mp_master"] if m.get("mp_name", "").strip() == mp_name.strip()), {})
    allocated_limit = float(mp_rec.get("allocated_amount", 50000000) or 50000000) / 1e7

    return MPDashboardResponse(
        mp_name=mp_name,
        constituency=first.get("constituency", ""),
        state=first.get("state", ""),
        allocated_limit_cr=round(allocated_limit, 2),
        total_works=len(works),
        total_sanctioned_cr=round(total_amt / 1e7, 2),
        completed_works=completed,
        stalled_works=stalled,
        anomaly_works_count=len(anomalous),
        top_anomalous_works=anomalous[:5],
        work_categories_distribution=dict(categories),
    )


@app.get("/api/dashboard/district/{district_name}", response_model=DistrictDashboardResponse, tags=["Dashboards"])
def get_district_dashboard(district_name: str):
    """Role-based dashboard for District Authority / Collector."""
    works = db["works_by_district"].get(district_name, [])
    if not works:
        # Fuzzy match
        for name, w_list in db["works_by_district"].items():
            if district_name.lower() in name.lower():
                works = w_list
                district_name = name
                break

    if not works:
        raise HTTPException(status_code=404, detail=f"District '{district_name}' not found")

    total_amt = sum(float(w.get("sanction_amount", 0) or 0) for w in works)
    anomalous = [w for w in works if w.get("is_anomaly") == "1"]
    active_vendors = set(w.get("vendor_id") for w in works if w.get("vendor_id"))

    # Top vendors in this district
    v_counts = Counter(w.get("vendor_id") for w in works if w.get("vendor_id"))
    top_vendors = [
        {
            "vendor_id": vid,
            "vendor_name": next((w.get("vendor_name") for w in works if w.get("vendor_id") == vid), vid),
            "project_count": cnt,
        }
        for vid, cnt in v_counts.most_common(5)
    ]

    return DistrictDashboardResponse(
        district_name=district_name,
        state=works[0].get("state", ""),
        total_works=len(works),
        total_sanctioned_cr=round(total_amt / 1e7, 2),
        anomalous_works_count=len(anomalous),
        contractors_active=len(active_vendors),
        top_hub_contractors=top_vendors,
        flagged_works=anomalous[:10],
    )


@app.get("/api/dashboard/state/{state_name}", response_model=StateDashboardResponse, tags=["Dashboards"])
def get_state_dashboard(state_name: str):
    """Role-based dashboard for State Nodal Officer."""
    works = db["works_by_state"].get(state_name, [])
    if not works:
        for name, w_list in db["works_by_state"].items():
            if state_name.lower() in name.lower():
                works = w_list
                state_name = name
                break

    if not works:
        raise HTTPException(status_code=404, detail=f"State '{state_name}' not found")

    total_amt = sum(float(w.get("sanction_amount", 0) or 0) for w in works)
    anomalous = [w for w in works if w.get("is_anomaly") == "1"]
    stalled = sum(1 for w in works if w.get("work_status") == "Stalled")
    districts = set(w.get("nodal_district") for w in works if w.get("nodal_district"))

    # District risk rankings
    dist_anom = defaultdict(lambda: {"total": 0, "anomalies": 0})
    for w in works:
        d = w.get("nodal_district", "")
        dist_anom[d]["total"] += 1
        if w.get("is_anomaly") == "1":
            dist_anom[d]["anomalies"] += 1

    risk_districts = [
        {
            "district": d,
            "total_works": s["total"],
            "anomalies": s["anomalies"],
            "rate_pct": round(s["anomalies"] / s["total"] * 100, 1) if s["total"] else 0,
        }
        for d, s in dist_anom.items()
    ]
    risk_districts.sort(key=lambda x: x["anomalies"], reverse=True)

    return StateDashboardResponse(
        state_name=state_name,
        total_districts=len(districts),
        total_works=len(works),
        total_sanctioned_cr=round(total_amt / 1e7, 2),
        total_anomalies=len(anomalous),
        anomaly_rate_pct=round(len(anomalous) / len(works) * 100, 2) if works else 0.0,
        stalled_works=stalled,
        top_districts_by_risk=risk_districts[:6],
        collusion_clusters_detected=2,
    )


@app.get("/api/dashboard/ministry", response_model=MinistryDashboardResponse, tags=["Dashboards"])
def get_ministry_dashboard():
    """Role-based dashboard for Union Ministry (MoSPI)."""
    works = db["works"]
    mps = db["mp_master"]

    total_amt = sum(float(w.get("sanction_amount", 0) or 0) for w in works)
    anomalous = [w for w in works if w.get("is_anomaly") == "1"]

    # Breakdowns
    anom_types = Counter(w.get("anomaly_type") for w in anomalous if w.get("anomaly_type"))

    # State rankings
    state_anom = defaultdict(lambda: {"total": 0, "anomalies": 0, "amount": 0.0})
    for w in works:
        st = w.get("state", "Unknown")
        state_anom[st]["total"] += 1
        state_anom[st]["amount"] += float(w.get("sanction_amount", 0) or 0)
        if w.get("is_anomaly") == "1":
            state_anom[st]["anomalies"] += 1

    top_states = [
        {
            "state": st,
            "total_works": data["total"],
            "anomalies": data["anomalies"],
            "rate_pct": round(data["anomalies"] / data["total"] * 100, 1) if data["total"] else 0,
            "sanctioned_cr": round(data["amount"] / 1e7, 2),
        }
        for st, data in state_anom.items()
    ]
    top_states.sort(key=lambda x: x["anomalies"], reverse=True)

    return MinistryDashboardResponse(
        national_total_works=len(works),
        national_total_sanctioned_cr=round(total_amt / 1e7, 2),
        national_total_mps=len(mps),
        national_anomalies_count=len(anomalous),
        national_anomaly_rate_pct=round(len(anomalous) / len(works) * 100, 2) if works else 0.0,
        anomaly_type_breakdown=dict(anom_types),
        top_risk_states=top_states[:8],
        high_risk_contractor_count=len([h for h in db["hub_vendors"] if h.is_hub]),
    )


# ---------------------------------------------------------------------------
# Module 7: Automated Data Engineering & Ingestion Pipeline Endpoints
# ---------------------------------------------------------------------------

_ingestion_tasks: Dict[str, Dict[str, Any]] = {}


def _run_ingestion_task(task_id: str, content: bytes, filename: str) -> None:
    """Background task to run the ingestion pipeline and refresh the datastore."""
    try:
        _ingestion_tasks[task_id]["status"] = "running"
        ext = Path(filename).suffix.lower()
        file_type_map = {".csv": "csv", ".tsv": "tsv", ".xlsx": "xlsx", ".json": "json"}
        file_type = file_type_map.get(ext, "auto")

        buf = io.BytesIO(content)
        report = ingest_unorganized_dataset(buf, file_type=file_type, reference_data_dir=DATA_DIR)

        # Refresh the live datastore with validated rows
        refresh_app_datastore(report)

        _ingestion_tasks[task_id]["status"] = "completed"
        _ingestion_tasks[task_id]["report"] = {
            "task_id": report.task_id,
            "total_rows_read": report.total_rows_read,
            "rows_harmonized": report.rows_harmonized,
            "rows_normalized": report.rows_normalized,
            "rows_validated": report.rows_validated,
            "rows_quarantined": report.rows_quarantined,
            "quarantine_file_path": report.quarantine_file_path,
            "warnings_count": len(report.warnings),
            "warnings": report.warnings[:20],
            "benchmarks_computed": report.benchmarks_computed,
            "risk_signals_count": len(report.risk_signals_emitted),
            "duration_seconds": report.duration_seconds,
            "status": report.status,
        }
        _ingestion_tasks[task_id]["quarantine_records"] = [
            {
                "row_index": q.row_index,
                "original_row": q.original_row,
                "errors": q.errors,
                "reason": q.reason,
                "timestamp": q.timestamp,
            }
            for q in report.quarantine_records
        ]
    except Exception as exc:
        _ingestion_tasks[task_id]["status"] = "failed"
        _ingestion_tasks[task_id]["error"] = str(exc)


@app.post(
    "/api/ingest/upload",
    response_model=IngestionUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["Data Engineering Pipeline"],
    summary="Upload and ingest an unorganized MPLADS data file asynchronously",
)
async def upload_dataset(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """
    Accept an unorganized MPLADS dataset file (CSV, TSV, XLSX, or JSON),
    generate a tracking task ID, and queue the ingestion pipeline in the background.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is required.",
        )

    task_id = str(uuid.uuid4())
    content = await file.read()

    _ingestion_tasks[task_id] = {
        "task_id": task_id,
        "filename": file.filename,
        "status": "pending",
        "report": None,
        "quarantine_records": [],
        "error": None,
    }

    background_tasks.add_task(_run_ingestion_task, task_id, content, file.filename)

    return IngestionUploadResponse(
        task_id=task_id,
        status="accepted",
        message=f"File '{file.filename}' accepted for ingestion. Track status at /api/ingest/status/{task_id}",
    )


@app.get(
    "/api/ingest/status/{task_id}",
    response_model=IngestionStatusResponse,
    tags=["Data Engineering Pipeline"],
    summary="Get status and report of a background ingestion task",
)
def get_ingestion_status(task_id: str):
    """Check current status and retrieve results of an ingestion run."""
    task = _ingestion_tasks.get(task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ingestion task '{task_id}' not found.",
        )

    return IngestionStatusResponse(
        task_id=task["task_id"],
        status=task["status"],
        report=task.get("report"),
        error=task.get("error"),
    )


@app.get(
    "/api/ingest/quarantine/{task_id}",
    tags=["Data Engineering Pipeline"],
    summary="Get quarantined records for an ingestion task",
)
def get_ingestion_quarantine(task_id: str):
    """Retrieve all quarantined records diverted to DLQ for a given ingestion run."""
    task = _ingestion_tasks.get(task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ingestion task '{task_id}' not found.",
        )

    return {
        "task_id": task_id,
        "status": task["status"],
        "quarantined_count": len(task.get("quarantine_records", [])),
        "quarantine_records": task.get("quarantine_records", []),
    }

