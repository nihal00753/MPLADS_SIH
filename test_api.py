"""
Automated Test Suite for MPLADS AI/ML FastAPI Service
Tests all endpoints, responses, error handlers, and role dashboards.
"""

import sys
import io
from fastapi.testclient import TestClient
from mplads_ai.api.app import app, db, _load_dataset

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# Ensure dataset is loaded for tests
_load_dataset()
client = TestClient(app)

results = {}


def test_pass(name, detail=""):
    results[name] = ("PASS", detail)
    print(f"  [PASS] {name}" + (f" — {detail}" if detail else ""))


def test_fail(name, detail=""):
    results[name] = ("FAIL", detail)
    print(f"  [FAIL] {name}" + (f" — {detail}" if detail else ""))


print("=" * 70)
print("MPLADS AI/ML API — Automated Test Suite")
print("=" * 70)
print()

# ---------------------------------------------------------------------------
# 1. Health & Diagnostics
# ---------------------------------------------------------------------------
print("-" * 70)
print("TEST SUITE 1: System Health & Static Dashboard")
print("-" * 70)

resp = client.get("/api/health")
if resp.status_code == 200 and resp.json().get("status") == "healthy":
    d = resp.json().get("dataset_records", {})
    test_pass("Health Check API", f"Loaded {d.get('works', 0)} works, {d.get('vendors', 0)} vendors")
else:
    test_fail("Health Check API", f"Status code: {resp.status_code}")

resp_dash = client.get("/dashboard")
if resp_dash.status_code == 200 and "text/html" in resp_dash.headers.get("content-type", ""):
    test_pass("Web Dashboard UI Served", "HTTP 200 HTML content delivered")
else:
    test_fail("Web Dashboard UI Served", f"Status: {resp_dash.status_code}")

# ---------------------------------------------------------------------------
# 2. Module 1: Pre-Sanction Scoring API
# ---------------------------------------------------------------------------
print("\n" + "-" * 70)
print("TEST SUITE 2: Pre-Sanction Scoring Endpoints")
print("-" * 70)

score_payload = {
    "sanction_amount": 4500000.0,
    "category": "Roads, Pathways and Bridges",
    "region": "Bihar",
    "season_month": 7,
    "vendor_id": "V00010",
    "vendor_past_delays": 2,
    "vendor_past_anomalies": 1,
    "vendor_total_projects": 5,
    "category_benchmark_amount": 2000000.0,
    "region_risk_score": 0.6,
}
resp_score = client.post("/api/scoring/score", json=score_payload)
if resp_score.status_code == 200:
    data = resp_score.json()
    test_pass(
        "Proposal Scoring API",
        f"Overall Score: {data.get('overall_score')} (Level: {data.get('risk_level')}), "
        f"{len(data.get('risk_signals', []))} signals"
    )
else:
    test_fail("Proposal Scoring API", f"Status: {resp_score.status_code}, {resp_score.text}")

# Test Category Benchmarks endpoint
resp_bench = client.get("/api/scoring/benchmarks")
if resp_bench.status_code == 200 and len(resp_bench.json()) > 0:
    test_pass("Category Benchmarks API", f"{len(resp_bench.json())} work categories indexed")
else:
    test_fail("Category Benchmarks API", f"Status: {resp_bench.status_code}")

# Test validation error on negative amount
resp_err = client.post("/api/scoring/score", json={"sanction_amount": -500, "category": "Roads", "region": "Delhi"})
if resp_err.status_code == 422:
    test_pass("Scoring Validation Error Handling", "HTTP 422 on invalid amount")
else:
    test_fail("Scoring Validation Error Handling", f"Expected 422, got {resp_err.status_code}")

# ---------------------------------------------------------------------------
# 3. Module 2: Document OCR API
# ---------------------------------------------------------------------------
print("\n" + "-" * 70)
print("TEST SUITE 3: Document OCR Endpoints")
print("-" * 70)

invoice_payload = {
    "raw_text": (
        "GOVERNMENT OF INDIA - TAX INVOICE\n"
        "Date: 2026/06/27\n"
        "Vendor: M/s Maa Construction Pvt Ltd\n"
        "Grand Total: Rs. 14,56,789.06\n"
    ),
    "sanctioned_amount": 1000000.0,
    "sanctioned_date": "2026/06/01",
    "sanctioned_vendor": "Maa Construction",
}
resp_ocr = client.post("/api/ocr/parse", json=invoice_payload)
if resp_ocr.status_code == 200:
    d = resp_ocr.json()
    test_pass(
        "OCR Parse & Diff API",
        f"Parsed Amount: ₹{d['amount']['value']:,.2f}, Date: {d['date']['value']}, "
        f"{len(d['risk_signals'])} RiskSignal(s) emitted"
    )
else:
    test_fail("OCR Parse & Diff API", f"Status: {resp_ocr.status_code}, {resp_ocr.text}")

# Test InsufficientDataError on empty text
resp_ocr_empty = client.post("/api/ocr/parse", json={"raw_text": "   "})
if resp_ocr_empty.status_code == 422:
    test_pass("OCR InsufficientDataError Handler", "HTTP 422 returned on blank text")
else:
    test_fail("OCR InsufficientDataError Handler", f"Got status {resp_ocr_empty.status_code}")

# ---------------------------------------------------------------------------
# 4. Module 3: Complaint NLP API
# ---------------------------------------------------------------------------
print("\n" + "-" * 70)
print("TEST SUITE 4: Citizen Complaint NLP Endpoints")
print("-" * 70)

complaint_payload = {
    "complaint_id": "CMP-TEST-101",
    "text": "The school road culvert collapsed into a deep dangerous ditch and buses are stuck.",
    "location": "Varanasi",
}
resp_nlp = client.post("/api/complaints/triage", json=complaint_payload)
if resp_nlp.status_code == 200:
    d = resp_nlp.json()
    test_pass(
        "Complaint Triage API",
        f"Urgency: {d.get('urgency_level')}, Hazard: {d.get('is_safety_hazard')}, "
        f"Category: {d.get('category')}"
    )
else:
    test_fail("Complaint Triage API", f"Status: {resp_nlp.status_code}")

# Complaint Clustering API
cluster_payload = {
    "complaints": [
        {"complaint_id": "C1", "text": "Drinking water pipeline is broken in Ward 4"},
        {"complaint_id": "C2", "text": "Water pipeline leaking and flooded Ward 4 street"},
        {"complaint_id": "C3", "text": "Street lights not working near community center"},
    ]
}
resp_cluster = client.post("/api/complaints/cluster", json=cluster_payload)
if resp_cluster.status_code == 200:
    d = resp_cluster.json()
    test_pass("Complaint Clustering API", f"{d.get('total_complaints')} complaints clustered into {d.get('num_clusters')} group(s)")
else:
    test_fail("Complaint Clustering API", f"Status: {resp_cluster.status_code}")

# ---------------------------------------------------------------------------
# 5. Module 4: Collusion Network API
# ---------------------------------------------------------------------------
print("\n" + "-" * 70)
print("TEST SUITE 5: Collusion Network Endpoints")
print("-" * 70)

entity_payload = {
    "vendors": [
        {"vendor_id": "V1", "name": "Jai Construction Corporation"},
        {"vendor_id": "V2", "name": "Jai Construction Corporation Pvt Ltd"},
        {"vendor_id": "V3", "name": "Sai Infra Works"},
    ],
    "name_similarity_threshold": 0.85,
}
resp_ent = client.post("/api/network/resolve-entities", json=entity_payload)
if resp_ent.status_code == 200:
    d = resp_ent.json()
    test_pass(
        "Entity Resolution API",
        f"{d['total_input']} input vendors -> {d['total_resolved']} entities ({d['merged_groups_count']} merged)"
    )
else:
    test_fail("Entity Resolution API", f"Status: {resp_ent.status_code}")

# Collusion Cluster Detection API
resp_coll = client.post("/api/network/detect-clusters?min_score=0.5")
if resp_coll.status_code == 200:
    d = resp_coll.json()
    test_pass(
        "Collusion Cluster Detection API",
        f"Graph edges: {d.get('total_edges')}, Collusion clusters: {d.get('num_clusters')}"
    )
else:
    test_fail("Collusion Cluster Detection API", f"Status: {resp_coll.status_code}")

# Hub Vendors API
resp_hubs = client.get("/api/network/hubs?limit=10")
if resp_hubs.status_code == 200 and len(resp_hubs.json()) > 0:
    test_pass("Hub Vendors API", f"Top {len(resp_hubs.json())} contractor concentration hubs returned")
else:
    test_fail("Hub Vendors API", f"Status: {resp_hubs.status_code}")

# ---------------------------------------------------------------------------
# 6. Module 5: Vision Analysis API
# ---------------------------------------------------------------------------
print("\n" + "-" * 70)
print("TEST SUITE 6: Vision Analysis Endpoints")
print("-" * 70)

dup_payload = {
    "fingerprints": [
        {"image_id": "IMG_A", "phash": "817a7e2a7e2a7e80"},
        {"image_id": "IMG_B", "phash": "817a7e2a7e2a7e80"},
        {"image_id": "IMG_C", "phash": "12345678abcdef00"},
    ],
    "hamming_threshold": 10,
}
resp_dup = client.post("/api/vision/detect-duplicates", json=dup_payload)
if resp_dup.status_code == 200:
    d = resp_dup.json()
    test_pass("Vision Duplicate Detection API", f"Identified {len(d)} duplicate pair(s) with distance=0")
else:
    test_fail("Vision Duplicate Detection API", f"Status: {resp_dup.status_code}")

# Geoverify API
geo_payload = {
    "fingerprint": {
        "image_id": "IMG_GPS_1",
        "phash": "817a7e2a7e2a7e80",
        "gps_lat": 28.6145,
        "gps_lon": 77.2092,
    },
    "claimed_lat": 28.6139,
    "claimed_lon": 77.2090,
    "radius_km": 1.0,
}
resp_geo = client.post("/api/vision/geoverify", json=geo_payload)
if resp_geo.status_code == 200:
    d = resp_geo.json()
    test_pass(
        "Vision Geoverification API",
        f"Distance: {d.get('distance_km')} km, Within 1.0km threshold: {d.get('is_within_threshold')}"
    )
else:
    test_fail("Vision Geoverification API", f"Status: {resp_geo.status_code}")

# ---------------------------------------------------------------------------
# 7. Module 6: Natural Language Query API
# ---------------------------------------------------------------------------
print("\n" + "-" * 70)
print("TEST SUITE 7: Natural Language Query Assistant API")
print("-" * 70)

query_payload = {"question": "How many total works are recorded?"}
resp_q = client.post("/api/query/ask", json=query_payload)
if resp_q.status_code == 200:
    d = resp_q.json()
    test_pass(
        "NL Query Assistant API",
        f"Confidence: {d.get('confidence')}, Answer snippet: '{d.get('answer')[:60]}...'"
    )
else:
    test_fail("NL Query Assistant API", f"Status: {resp_q.status_code}")

# ---------------------------------------------------------------------------
# 8. Role-Based Dashboards & Work Risk Profiles
# ---------------------------------------------------------------------------
print("\n" + "-" * 70)
print("TEST SUITE 8: Role-Based Dashboards & Work Risk Profile")
print("-" * 70)

# Overview Dashboard
resp_ov = client.get("/api/dashboard/overview")
if resp_ov.status_code == 200:
    d = resp_ov.json()
    test_pass(
        "Overview KPI Dashboard",
        f"Works: {d['total_works']}, Sanctioned: ₹{d['total_sanctioned_cr']} Cr, Anomalies: {d['total_anomalies']}"
    )
else:
    test_fail("Overview KPI Dashboard", f"Status: {resp_ov.status_code}")

# Ministry Dashboard
resp_min = client.get("/api/dashboard/ministry")
if resp_min.status_code == 200:
    d = resp_min.json()
    test_pass(
        "Ministry Dashboard",
        f"National MPs: {d['national_total_mps']}, Top risk states: {len(d['top_risk_states'])}"
    )
else:
    test_fail("Ministry Dashboard", f"Status: {resp_min.status_code}")

# State Dashboard
resp_st = client.get("/api/dashboard/state/Uttar Pradesh")
if resp_st.status_code == 200:
    d = resp_st.json()
    test_pass(
        "State Nodal Dashboard",
        f"State: {d['state_name']}, Works: {d['total_works']}, Rate: {d['anomaly_rate_pct']}%"
    )
else:
    test_fail("State Nodal Dashboard", f"Status: {resp_st.status_code}")

# District Dashboard
resp_dt = client.get("/api/dashboard/district/Wayanad")
if resp_dt.status_code == 200:
    d = resp_dt.json()
    test_pass(
        "District Collector Dashboard",
        f"District: {d['district_name']}, Flagged: {d['anomalous_works_count']}, Active vendors: {d['contractors_active']}"
    )
else:
    test_fail("District Collector Dashboard", f"Status: {resp_dt.status_code}")

# MP Dashboard
resp_mp = client.get("/api/dashboard/mp/Rahul Gandhi")
if resp_mp.status_code == 200:
    d = resp_mp.json()
    test_pass(
        "MP Constituency Dashboard",
        f"MP: {d['mp_name']}, Constituency: {d['constituency']}, Works: {d['total_works']}"
    )
else:
    test_fail("MP Constituency Dashboard", f"Status: {resp_mp.status_code}")

# Work Specific Risk Profile
sample_work = db["works"][0]
sample_id = sample_work["unique_work_number"]
resp_wk = client.get(f"/api/works/{sample_id}/risk-profile")
if resp_wk.status_code == 200:
    d = resp_wk.json()
    test_pass(
        "Work Specific Risk Profile API",
        f"Work: {sample_id}, Signals: {d.get('total_risk_signals')}, Score: {d.get('composite_risk_score')}"
    )
else:
    test_fail("Work Specific Risk Profile API", f"Status: {resp_wk.status_code}")

# ---------------------------------------------------------------------------
# SUMMARY
# ---------------------------------------------------------------------------
print("\n" + "=" * 70)
print("API TEST SUMMARY")
print("=" * 70)
passed = sum(1 for s, _ in results.values() if s == "PASS")
failed = sum(1 for s, _ in results.values() if s == "FAIL")
total = len(results)

for name, (status, detail) in results.items():
    print(f"  [{status}] {name}")

print(f"\n  {passed}/{total} tests passed, {failed} failed")

if failed == 0:
    print("\n  ALL API TESTS PASSED SUCCESSFULLY!")
else:
    print(f"\n  {failed} API TEST(S) FAILED")
    sys.exit(1)
