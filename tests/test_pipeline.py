"""
Automated Test Suite for MPLADS Data Engineering & Ingestion Pipeline.

Tests:
1. Currency Normalizer (Indian currency strings, multipliers, Lakh/Crore, invalid formats)
2. Date Normalizer (ISO, DD/MM/YYYY, DD-MMM-YYYY, Excel serials, garbage strings)
3. Geography Normalizer (Fuzzy matching, abbreviation expansion, unknown thresholds)
4. Harmonizer (Column alias resolution, multi-format reading: CSV, TSV, JSON, XLSX)
5. Validator & DLQ (WorkRecordSchema, invalid row quarantine, warnings, disk persistence)
6. Orchestrator Pipeline (End-to-end messy dataset ingestion, benchmarks, vendor IDs)
7. Datastore Refresh (Additive merge into app.py live db, index updates)
8. API Endpoints (POST /api/ingest/upload, GET status, GET quarantine, error handling)
"""

import io
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

# Ensure project root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from mplads_ai.pipeline.normalizer import (
    normalize_currency,
    normalize_date,
    normalize_geography,
    build_reference_lists_from_mp_master,
)
from mplads_ai.pipeline.harmonizer import (
    harmonize_columns,
    read_raw_file,
    CANONICAL_COLUMN_MAP,
)
from mplads_ai.pipeline.validator import (
    WorkRecordSchema,
    QuarantineRecord,
    validate_row,
    validate_batch,
    persist_quarantine_to_disk,
)
from mplads_ai.pipeline.orchestrator import (
    ingest_unorganized_dataset,
    refresh_app_datastore,
    IngestionReport,
)
from mplads_ai.api.app import app, db, _load_dataset

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

results = {}


def test_pass(name: str, detail: str = "") -> None:
    results[name] = ("PASS", detail)
    print(f"  [PASS] {name}" + (f" — {detail}" if detail else ""))


def test_fail(name: str, detail: str = "") -> None:
    results[name] = ("FAIL", detail)
    print(f"  [FAIL] {name}" + (f" — {detail}" if detail else ""))


# ======================================================================
# TEST SUITE 1: Currency Normalizer
# ======================================================================
print("\n" + "=" * 70)
print("TEST SUITE 1: Currency Normalizer")
print("=" * 70)

# Case 1: Lakhs notation
val = normalize_currency("₹ 25.5 Lakhs")
if val == 2550000.0:
    test_pass("Currency: '₹ 25.5 Lakhs'", f"{val}")
else:
    test_fail("Currency: '₹ 25.5 Lakhs'", f"Expected 2550000.0, got {val}")

# Case 2: Crore notation
val = normalize_currency("1.4 Cr")
if val == 14000000.0:
    test_pass("Currency: '1.4 Cr'", f"{val}")
else:
    test_fail("Currency: '1.4 Cr'", f"Expected 14000000.0, got {val}")

# Case 3: Indian comma grouping with Rs. and /-
val = normalize_currency("Rs. 25,00,000/-")
if val == 2500000.0:
    test_pass("Currency: 'Rs. 25,00,000/-'", f"{val}")
else:
    test_fail("Currency: 'Rs. 25,00,000/-'", f"Expected 2500000.0, got {val}")

# Case 4: Plain numeric string
val = normalize_currency("500000")
if val == 500000.0:
    test_pass("Currency: Plain numeric '500000'", f"{val}")
else:
    test_fail("Currency: Plain numeric '500000'", f"Expected 500000.0, got {val}")

# Case 5: Short Lakh suffix '2.5 L'
val = normalize_currency("2.5 L")
if val == 250000.0:
    test_pass("Currency: Short suffix '2.5 L'", f"{val}")
else:
    test_fail("Currency: Short suffix '2.5 L'", f"Expected 250000.0, got {val}")

# Case 6: Invalid currency string
val = normalize_currency("N/A - Not Applicable")
if val is None:
    test_pass("Currency: Invalid string returns None", "Correctly returned None")
else:
    test_fail("Currency: Invalid string", f"Expected None, got {val}")

# Case 7: Empty or None input
if normalize_currency("") is None and normalize_currency(None) is None:
    test_pass("Currency: Empty/None input handled gracefully", "Both returned None")
else:
    test_fail("Currency: Empty/None input", "Failed to return None")


# ======================================================================
# TEST SUITE 2: Date Normalizer
# ======================================================================
print("\n" + "=" * 70)
print("TEST SUITE 2: Date Normalizer")
print("=" * 70)

# Case 1: DD/MM/YYYY
d = normalize_date("15/04/2023")
if d == "2023-04-15":
    test_pass("Date: DD/MM/YYYY '15/04/2023'", f"{d}")
else:
    test_fail("Date: DD/MM/YYYY '15/04/2023'", f"Expected '2023-04-15', got '{d}'")

# Case 2: ISO YYYY-MM-DD
d = normalize_date("2024-01-30")
if d == "2024-01-30":
    test_pass("Date: ISO passthrough '2024-01-30'", f"{d}")
else:
    test_fail("Date: ISO passthrough '2024-01-30'", f"Expected '2024-01-30', got '{d}'")

# Case 3: DD-MMM-YYYY
d = normalize_date("15-Apr-2023")
if d == "2023-04-15":
    test_pass("Date: DD-MMM-YYYY '15-Apr-2023'", f"{d}")
else:
    test_fail("Date: DD-MMM-YYYY '15-Apr-2023'", f"Expected '2023-04-15', got '{d}'")

# Case 4: Excel numeric serial (45031 -> 2023-04-15)
d = normalize_date("45031")
if d == "2023-04-15":
    test_pass("Date: Excel numeric serial '45031'", f"{d}")
else:
    test_fail("Date: Excel numeric serial '45031'", f"Expected '2023-04-15', got '{d}'")

# Case 5: Unparseable garbage
d = normalize_date("Pending Approval")
if d is None:
    test_pass("Date: Unparseable string returns None", "Correctly returned None")
else:
    test_fail("Date: Unparseable string", f"Expected None, got '{d}'")


# ======================================================================
# TEST SUITE 3: Geography Normalizer
# ======================================================================
print("\n" + "=" * 70)
print("TEST SUITE 3: Geography Normalizer")
print("=" * 70)

ref_states = ["Maharashtra", "Tamil Nadu", "Uttar Pradesh", "Jammu And Kashmir", "Karnataka"]

# Case 1: Fuzzy matching typo
geo = normalize_geography("Maharastra", ref_states)
if geo == "Maharashtra":
    test_pass("Geo: Typo resolution 'Maharastra' -> 'Maharashtra'", f"{geo}")
else:
    test_fail("Geo: Typo resolution 'Maharastra'", f"Expected 'Maharashtra', got '{geo}'")

# Case 2: Known abbreviation
geo = normalize_geography("J & K", ref_states)
if geo == "Jammu And Kashmir":
    test_pass("Geo: Abbreviation 'J & K' -> 'Jammu And Kashmir'", f"{geo}")
else:
    test_fail("Geo: Abbreviation 'J & K'", f"Expected 'Jammu And Kashmir', got '{geo}'")

# Case 3: Exact match passthrough
geo = normalize_geography("Karnataka", ref_states)
if geo == "Karnataka":
    test_pass("Geo: Exact match 'Karnataka'", f"{geo}")
else:
    test_fail("Geo: Exact match 'Karnataka'", f"Expected 'Karnataka', got '{geo}'")

# Case 4: Completely unknown string below threshold
geo = normalize_geography("Atlantis Wonder City", ref_states, threshold=0.8)
if geo is None:
    test_pass("Geo: Unknown entity returns None", "Correctly returned None")
else:
    test_fail("Geo: Unknown entity", f"Expected None, got '{geo}'")


# ======================================================================
# TEST SUITE 4: Harmonizer & Multi-Format Readers
# ======================================================================
print("\n" + "=" * 70)
print("TEST SUITE 4: Harmonizer & Multi-Format Readers")
print("=" * 70)

# Case 1: Column alias mapping
raw_portal_rows = [
    {
        "Work_Code": "W_PORTAL_001",
        "State_Name": "Maharashtra",
        "District": "Pune",
        "Amount_Rs": "₹ 15.0 Lakhs",
        "Proposal_Date": "12/05/2023",
        "Contractor_Name": "Apex Infra Ltd",
        "Extra_Field_Gov": "Custom Value 123",
    }
]

harmonized = harmonize_columns(raw_portal_rows)
h_row = harmonized[0]
if (
    h_row.get("unique_work_number") == "W_PORTAL_001"
    and h_row.get("state") == "Maharashtra"
    and h_row.get("nodal_district") == "Pune"
    and h_row.get("sanction_amount") == "₹ 15.0 Lakhs"
    and h_row.get("vendor_name") == "Apex Infra Ltd"
    and h_row.get("Extra_Field_Gov") == "Custom Value 123"  # Preserved!
):
    test_pass("Harmonizer: Column alias mapping & extra column preservation")
else:
    test_fail("Harmonizer: Column alias mapping", f"Result: {h_row}")

# Case 2: Multi-format reader: CSV Buffer
csv_content = (
    "Work_Code,State,District,Amount_Rs\n"
    "CW_001,Maharashtra,Pune,2500000\n"
    "CW_002,Karnataka,Bengaluru,4500000\n"
)
csv_rows = read_raw_file(io.StringIO(csv_content), file_type="csv")
if len(csv_rows) == 2 and csv_rows[0]["Work_Code"] == "CW_001":
    test_pass("Reader: CSV buffer parsing", f"Read {len(csv_rows)} rows")
else:
    test_fail("Reader: CSV buffer parsing", f"Expected 2 rows, got {len(csv_rows)}")

# Case 3: Multi-format reader: JSON Buffer
json_content = json.dumps([
    {"Work_ID": "JW_001", "State": "Tamil Nadu", "Sanction_Amt": "500000"},
    {"Work_ID": "JW_002", "State": "Kerala", "Sanction_Amt": "750000"},
])
json_rows = read_raw_file(io.StringIO(json_content), file_type="json")
if len(json_rows) == 2 and json_rows[1]["Work_ID"] == "JW_002":
    test_pass("Reader: JSON buffer parsing", f"Read {len(json_rows)} rows")
else:
    test_fail("Reader: JSON buffer parsing", f"Expected 2 rows, got {len(json_rows)}")

# Case 4: Multi-format reader: TSV Buffer
tsv_content = (
    "Work_Code\tState\tDistrict\n"
    "TW_001\tPunjab\tAmritsar\n"
)
tsv_rows = read_raw_file(io.StringIO(tsv_content), file_type="tsv")
if len(tsv_rows) == 1 and tsv_rows[0]["Work_Code"] == "TW_001":
    test_pass("Reader: TSV buffer parsing", f"Read {len(tsv_rows)} rows")
else:
    test_fail("Reader: TSV buffer parsing", f"Expected 1 row, got {len(tsv_rows)}")


# ======================================================================
# TEST SUITE 5: Validator & Dead-Letter Queue (DLQ)
# ======================================================================
print("\n" + "=" * 70)
print("TEST SUITE 5: Validator & Dead-Letter Queue (DLQ)")
print("=" * 70)

# Case 1: Valid row
valid_row = {
    "unique_work_number": "MPL_TEST_001",
    "state": "Maharashtra",
    "nodal_district": "Pune",
    "sanction_amount": 2500000.0,
    "work_category": "Roads and Bridges",
    "physical_progress_pct": 50.0,
    "financial_progress_pct": 50.0,
}
v_out, q_out = validate_row(valid_row, row_index=1)
if v_out is not None and q_out is None:
    test_pass("Validator: Clean valid row passes")
else:
    test_fail("Validator: Clean valid row", f"Got quarantine: {q_out}")

# Case 2: Missing required field (unique_work_number missing)
invalid_row_missing = {
    "state": "Maharashtra",
    "nodal_district": "Pune",
    "sanction_amount": 2500000.0,
}
v_out, q_out = validate_row(invalid_row_missing, row_index=2)
if v_out is None and q_out is not None:
    test_pass("Validator: Missing required field diverted to DLQ", f"Reason: {q_out.reason}")
else:
    test_fail("Validator: Missing required field", "Did not divert to DLQ")

# Case 3: Invalid sanction amount (negative amount)
invalid_row_negative = {
    "unique_work_number": "MPL_TEST_003",
    "state": "Maharashtra",
    "nodal_district": "Pune",
    "sanction_amount": -1000.0,
}
v_out, q_out = validate_row(invalid_row_negative, row_index=3)
if v_out is None and q_out is not None:
    test_pass("Validator: Negative sanction amount diverted to DLQ", f"Reason: {q_out.reason}")
else:
    test_fail("Validator: Negative sanction amount", "Did not divert to DLQ")

# Case 4: Batch validation with warnings
batch = [
    valid_row,
    invalid_row_missing,
    {
        "unique_work_number": "MPL_TEST_HUGE",
        "state": "Karnataka",
        "nodal_district": "Bengaluru Urban",
        "sanction_amount": 600000000.0,  # 60 Cr > 50 Cr warning
    },
]
v_res = validate_batch(batch)
if len(v_res.valid_rows) == 2 and len(v_res.quarantined) == 1 and len(v_res.warnings) >= 1:
    test_pass("Validator: Batch validation splits valid vs quarantine & generates warnings",
              f"Valid={len(v_res.valid_rows)}, Quarantined={len(v_res.quarantined)}, Warnings={len(v_res.warnings)}")
else:
    test_fail("Validator: Batch validation",
              f"Valid={len(v_res.valid_rows)}, Quarantined={len(v_res.quarantined)}, Warnings={len(v_res.warnings)}")

# Case 5: DLQ persistence to disk
tmp_dir = Path(tempfile.mkdtemp())
try:
    q_file = persist_quarantine_to_disk(v_res.quarantined, task_id="test_task_123", quarantine_dir=tmp_dir)
    if q_file.exists() and q_file.stat().st_size > 0:
        with open(q_file, "r", encoding="utf-8") as f:
            persisted_data = json.load(f)
        if len(persisted_data) == 1 and persisted_data[0]["row_index"] == 1:
            test_pass("DLQ: Persisted quarantine records saved to disk as JSON", f"File: {q_file.name}")
        else:
            test_fail("DLQ: Disk persistence content mismatch", f"{persisted_data}")
    else:
        test_fail("DLQ: Disk file not created or empty", str(q_file))
finally:
    shutil.rmtree(tmp_dir, ignore_errors=True)


# ======================================================================
# TEST SUITE 6: Orchestrator End-to-End Pipeline
# ======================================================================
print("\n" + "=" * 70)
print("TEST SUITE 6: Orchestrator End-to-End Pipeline")
print("=" * 70)

# Construct a realistic messy CSV with:
# - Mixed column aliases (Work_Code, District, Amount_Rs, Proposal_Date, Contractor_Name)
# - Indian currency formats ("₹ 25.5 Lakhs", "1.4 Cr", "Rs. 25,00,000/-")
# - Mixed date formats ("15/04/2023", "2024-01-30", "15-Apr-2023")
# - Misspelled state name ("Maharastra" instead of "Maharashtra")
# - 1 corrupt row (missing Work_Code and negative amount) to test DLQ diversion
messy_csv = (
    "Work_Code,State,District,Category,Amount_Rs,Proposal_Date,Contractor_Name,Physical_Progress,Financial_Progress\n"
    "AUTO_W001,Maharastra,Pune,Drinking Water Facility,₹ 25.5 Lakhs,15/04/2023,M/s Om Construction,50%,50%\n"
    "AUTO_W002,Tamil Nadu,Chennai,Roads and Bridges,1.4 Cr,15-Apr-2023,Apex Infra,100%,100%\n"
    'AUTO_W003,Karnataka,Bengaluru Urban,Health,"Rs. 25,00,000/-",2024-01-30,Cauvery Works,0%,0%\n'
    ",Uttar Pradesh,Varanasi,Education,-50000,InvalidDate,Bad Vendor,0%,0%\n"  # Invalid!
)

report = ingest_unorganized_dataset(
    io.StringIO(messy_csv),
    file_type="csv",
    task_id="test_e2e_run",
)

if report.total_rows_read == 4:
    test_pass("Orchestrator: Read all 4 raw rows")
else:
    test_fail("Orchestrator: Read rows count", f"Expected 4, got {report.total_rows_read}")

if report.rows_validated == 3 and report.rows_quarantined == 1:
    test_pass("Orchestrator: Fault-tolerant validation (3 valid, 1 quarantined)",
              f"Valid={report.rows_validated}, DLQ={report.rows_quarantined}")
else:
    test_fail("Orchestrator: Validation counts",
              f"Expected 3 valid, 1 quarantined. Got {report.rows_validated} valid, {report.rows_quarantined} DLQ")

# Check normalized state name
valid_states = [r["state"] for r in report.valid_rows]
if "Maharashtra" in valid_states:
    test_pass("Orchestrator: Geography normalized ('Maharastra' -> 'Maharashtra')")
else:
    test_fail("Orchestrator: Geography normalization", f"States: {valid_states}")

# Check auto-generated vendor IDs
vendor_ids = [r.get("vendor_id") for r in report.valid_rows]
if all(vid and vid.startswith("V_") for vid in vendor_ids):
    test_pass("Orchestrator: Missing vendor IDs auto-generated", f"IDs: {vendor_ids}")
else:
    test_fail("Orchestrator: Auto vendor ID generation", f"Got: {vendor_ids}")

# Check benchmark computation
if len(report.benchmarks_computed) >= 2:
    test_pass("Orchestrator: Dynamic category benchmarks computed",
              f"{list(report.benchmarks_computed.keys())}")
else:
    test_fail("Orchestrator: Dynamic category benchmarks", f"{report.benchmarks_computed}")


# ======================================================================
# TEST SUITE 7: Datastore Refresh
# ======================================================================
print("\n" + "=" * 70)
print("TEST SUITE 7: Datastore Refresh")
print("=" * 70)

initial_works_count = len(db["works"])
refresh_summary = refresh_app_datastore(report)

if refresh_summary["added"] == 3:
    test_pass("Datastore: Additive merge added 3 new works",
              f"Total works now: {refresh_summary['total_works']}")
else:
    test_fail("Datastore: Additive merge", f"Expected 3 added, got {refresh_summary['added']}")

# Verify works_by_id indexing
if "AUTO_W001" in db["works_by_id"] and db["works_by_id"]["AUTO_W001"]["state"] == "Maharashtra":
    test_pass("Datastore: Indexed by work ID in db['works_by_id']")
else:
    test_fail("Datastore: Work ID index verification failed")


# ======================================================================
# TEST SUITE 8: API Endpoints Integration
# ======================================================================
print("\n" + "=" * 70)
print("TEST SUITE 8: API Endpoints Integration")
print("=" * 70)

client = TestClient(app)

# Case 1: POST /api/ingest/upload with CSV
upload_csv = (
    "Work_ID,State,District,Category,Amount\n"
    "API_W001,Maharashtra,Pune,Community Center,₹ 40.0 Lakhs\n"
    "API_W002,Karnataka,Bengaluru Urban,Education,7500000\n"
)
files = {"file": ("test_upload.csv", io.BytesIO(upload_csv.encode("utf-8")), "text/csv")}
resp = client.post("/api/ingest/upload", files=files)

if resp.status_code == 202:
    data = resp.json()
    task_id = data["task_id"]
    test_pass("API: POST /api/ingest/upload accepted (HTTP 202)", f"Task ID: {task_id}")
else:
    test_fail("API: POST /api/ingest/upload", f"Status {resp.status_code}: {resp.text}")
    task_id = None

# Case 2: GET /api/ingest/status/{task_id}
if task_id:
    status_resp = client.get(f"/api/ingest/status/{task_id}")
    if status_resp.status_code == 200:
        sdata = status_resp.json()
        test_pass("API: GET /api/ingest/status/{task_id} returned (HTTP 200)",
                  f"Status: {sdata['status']}")
    else:
        test_fail("API: GET /api/ingest/status/{task_id}", f"Status {status_resp.status_code}")

# Case 3: GET /api/ingest/quarantine/{task_id}
if task_id:
    q_resp = client.get(f"/api/ingest/quarantine/{task_id}")
    if q_resp.status_code == 200:
        qdata = q_resp.json()
        test_pass("API: GET /api/ingest/quarantine/{task_id} returned (HTTP 200)",
                  f"Quarantined count: {qdata['quarantined_count']}")
    else:
        test_fail("API: GET /api/ingest/quarantine/{task_id}", f"Status {q_resp.status_code}")

# Case 4: Unknown task ID returns 404
resp_404 = client.get("/api/ingest/status/non-existent-task-uuid")
if resp_404.status_code == 404:
    test_pass("API: Non-existent task returns HTTP 404")
else:
    test_fail("API: Non-existent task", f"Expected 404, got {resp_404.status_code}")


# ======================================================================
# SUMMARY
# ======================================================================
print("\n" + "=" * 70)
print("PIPELINE TEST SUMMARY")
print("=" * 70)

passed = sum(1 for status, _ in results.values() if status == "PASS")
failed = sum(1 for status, _ in results.values() if status == "FAIL")

for name, (status, detail) in results.items():
    icon = "[PASS]" if status == "PASS" else "[FAIL]"
    print(f"  {icon} {name}")

print(f"\n  {passed}/{len(results)} tests passed, {failed} failed")

if failed == 0:
    print("\n  ALL PIPELINE TESTS PASSED SUCCESSFULLY!\n")
    sys.exit(0)
else:
    print(f"\n  {failed} TEST(S) FAILED!\n")
    sys.exit(1)
