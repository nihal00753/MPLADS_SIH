# MPLADS Synthetic Demo Dataset — Data Dictionary & Methodology

## What's real vs. synthetic
- **Real**: all 543 MP names, states, constituencies, and per-MP allocated MPLADS
  entitlement amounts, taken from your uploaded `Allocated_Limit_for_Honble_MPs.pdf`
  (18th Lok Sabha). District mapping is cross-referenced from the real historical
  `15thLokSabha.csv` / `16thLokSabha.csv` constituency→district records you uploaded.
- **Synthetic (generated)**: individual work-level records, vendor/contractor
  identities, payment installments, progress percentages, and dates. These don't
  exist in any government system — they're built to be internally consistent with
  each MP's real entitlement ceiling (no MP's synthetic works exceed their real
  allocated amount) and to mirror the schema of the dataful.in work-level dataset
  you referenced (`state, nodal_district, implementing_district, house_name,
  member_type, mp_name, sanction_amount, date_of_administrative_approval,
  work_name, unique_work_number, implementing_agency_name, work_status,
  date_of_receipt_of_work_proposal_from_mp, unit, note`), plus extra fields needed
  for anomaly detection.

**Say this plainly in your submission**: this is a synthetic dataset generated to
demonstrate the detection pipeline against known, labeled fraud patterns, grounded
in real MP-level entitlement data. It is not a claim that these events occurred.
Swap in real eSAKSHI/PFMS work-level and vendor data once available (post-selection)
without changing your model code — the schema is designed to match.

## Files
- `mplads_mp_master_real.csv` — real 543-MP reference table (state, name, constituency, district, allocated_amount)
- `mplads_synthetic_works.csv` — ~12,900 synthetic works, one row per sanctioned work
- `mplads_synthetic_payments.csv` — ~24,200 synthetic vendor payment installments
- `mplads_synthetic_vendors.csv` — vendor/contractor master list per state, with a `is_hub` flag

## `mplads_synthetic_works.csv` columns
| Column | Meaning |
|---|---|
| `unique_work_number` | Primary key for a work |
| `state`, `nodal_district`, `implementing_district` | Location, real per MP |
| `mp_name`, `constituency` | Real |
| `work_category`, `work_name` | Type of work (12 realistic MPLADS categories) |
| `sanction_amount` | ₹ sanctioned for this work |
| `date_of_receipt_of_work_proposal_from_mp`, `date_of_administrative_approval` | Process dates |
| `implementing_agency_name`, `vendor_id`, `vendor_name` | Who executes it |
| `work_status` | Recommended / Sanctioned / Work in Progress / Completed / Payment Released / Stalled |
| `physical_progress_pct`, `financial_progress_pct` | Self-reported progress (this mismatch is a key anomaly signal) |
| `category_benchmark_min/max` | The "normal" cost band used to generate this work — use this as your ground-truth benchmark for cost-overrun detection |
| `is_anomaly`, `anomaly_type` | **Ground truth labels** — only for evaluating your model, never feed these into the model itself |

## Injected anomaly types (ground truth, ~16% of rows — deliberately elevated from real-world rates so your demo has enough positive examples to show off detection; say this explicitly to judges)
1. **`cost_overrun`** — sanction amount 2.5–5x the category's normal benchmark
2. **`ghost_project_progress_mismatch`** — financial progress ≥85% while physical progress ≤15% (money shown spent, no corresponding work)
3. **`duplicate_work` / `duplicate_work_source`** — near-identical work cloned under a second work number, different vendor
4. **`split_invoicing`** — a large work broken into 2–3 pieces each just under a ₹25L scrutiny threshold, same vendor, approval dates days apart
5. **`fund_dumping_year_end`** — administrative approval forced into the last two weeks of the financial year (Mar 17–31), a classic "use-it-or-lose-it" pattern
6. **Contractor concentration** — *not row-labeled on purpose*. ~10% of vendors per state are seeded as "hub" vendors receiving ~8x the normal share of work. This one is meant to be found via `groupby(vendor_id)` aggregation / graph analysis, not a per-row flag — it's a good second detection layer to show (row-level anomaly models + network-level aggregation).

## Suggested demo flow
1. Run your anomaly detection model on `mplads_synthetic_works.csv` (drop `is_anomaly`/`anomaly_type` before feeding the model — those are answer keys).
2. Compare your model's flagged works against the ground truth columns → report precision/recall. This gives judges an actual evaluated metric instead of "trust us."
3. Separately, aggregate `mplads_synthetic_payments.csv` by `vendor_id` to surface the seeded hub vendors — demonstrates the network/concentration detection layer.
4. In your pitch, be upfront: real government data has messier, noisier, and far rarer fraud signals than this seeded set — this is a controlled proof-of-concept, and the architecture (ingestion → cleaning → feature engineering → model → dashboard) is what carries over to production, not this specific data.
