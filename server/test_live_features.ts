import http from 'http';
process.env.USE_MOCK_ML = 'true';
import { app } from './src/app';
import { dataService } from './src/services/dataService';

async function runTests() {
  console.log('='.repeat(70));
  console.log('MPLADS LIVE FEATURES & DUAL-ALERTING INTEGRATION TEST SUITE');
  console.log('='.repeat(70));

  await dataService.initialize();

  // Start temporary test server on loopback
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(5555, '127.0.0.1', () => resolve()));
  const baseUrl = 'http://127.0.0.1:5555';
  console.log(`[SETUP] Test Express server listening on ${baseUrl}`);

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string, detail: string = '') => {
    if (condition) {
      console.log(`  [PASS] ${testName}${detail ? ` — ${detail}` : ''}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}${detail ? ` — ${detail}` : ''}`);
      failed++;
    }
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Authentication for all 3 key personas
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Persona Authentication ---');

    // MP Login (Pune MP Medha Kulkarni for shared Pune constituency with District Collector)
    const mpLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'mp.pune@mplads.gov.in', password: 'admin' }),
    });
    const mpLoginData = await mpLoginRes.json();
    assert(mpLoginRes.status === 200 && mpLoginData.user?.role === 'MP', 'MP Authentication', `Role: ${mpLoginData.user?.role}, Scope: ${mpLoginData.user?.scopeId}`);
    const mpToken = mpLoginData.token;

    // District Collector Login (Pune)
    const distLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'district@mplads.gov.in', password: 'admin' }),
    });
    const distLoginData = await distLoginRes.json();
    assert(distLoginRes.status === 200 && distLoginData.user?.role === 'DISTRICT', 'District Collector Authentication', `Role: ${distLoginData.user?.role}, Scope: ${distLoginData.user?.scopeId}`);
    const distToken = distLoginData.token;

    // Citizen Login (Pune)
    const citLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'citizen@mplads.gov.in', password: 'admin' }),
    });
    const citLoginData = await citLoginRes.json();
    assert(citLoginRes.status === 200 && citLoginData.user?.role === 'CITIZEN', 'Citizen Authentication', `Role: ${citLoginData.user?.role}, Scope: ${citLoginData.user?.scopeId}`);
    const citToken = citLoginData.token;

    // -------------------------------------------------------------------------
    // TEST 2: MP Proposing a New Public Work with Recommendation Letter
    // -------------------------------------------------------------------------
    console.log('\n--- 2. MP Work Proposal & Pre-Sanction AI Risk Scoring ---');

    const proposalPayload = {
      work_name: 'Construction of Solar-Powered Primary Health Care Center at Haveli',
      work_category: 'Health and Family Welfare',
      nodal_district: 'Pune',
      state: 'Maharashtra',
      constituency: 'Pune',
      sanction_amount: 3500000, // ₹35 Lakh
      implementing_agency_name: 'District Rural Development Agency (DRDA)',
      vendor_name: 'Shree Sai Infra Projects',
      recommendation_letter_text: 'I officially recommend the establishment of a 24x7 solar health facility to cater to 5 tribal hamlets under MPLADS annual allocation.',
      description: 'Comprehensive civil proposal including medical cold-storage room and solar microgrid.',
    };

    const propRes = await fetch(`${baseUrl}/api/works/propose`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mpToken}`,
      },
      body: JSON.stringify(proposalPayload),
    });
    const propData = await propRes.json();
    assert(propRes.status === 201 && propData.success, 'MP Proposal Submission HTTP 201', `Work ID: ${propData.work?.unique_work_number}`);
    assert(propData.work?.work_status === 'Proposed', 'Work Status set to Proposed', 'Awaiting administrative approval');
    assert(typeof propData.riskEvaluation?.score === 'number', 'AI Pre-Sanction Risk Evaluated', `Score: ${propData.riskEvaluation?.score}, Level: ${propData.riskEvaluation?.level}`);
    const proposedWorkId = propData.work?.unique_work_number;

    // -------------------------------------------------------------------------
    // TEST 3: Guardrail: Non-MP cannot propose works
    // -------------------------------------------------------------------------
    const nonMpPropRes = await fetch(`${baseUrl}/api/works/propose`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citToken}`,
      },
      body: JSON.stringify(proposalPayload),
    });
    assert(nonMpPropRes.status === 403, 'Guardrail: Citizen cannot propose MP works', `Status: ${nonMpPropRes.status}`);

    // -------------------------------------------------------------------------
    // TEST 4: Live Data Reflection on District Collector Dashboard
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Live Data Reflection on District Collector Dashboard ---');

    const distWorksRes = await fetch(`${baseUrl}/api/works?limit=200`, {
      headers: { Authorization: `Bearer ${distToken}` },
    });
    const distWorksData = await distWorksRes.json();
    const foundInDistrict = distWorksData.works?.find((w: any) => w.unique_work_number === proposedWorkId);
    assert(!!foundInDistrict, 'Proposed Work Reflected Live in District Works List', `Found: ${foundInDistrict?.work_name}`);
    assert(foundInDistrict?.work_status === 'Proposed', 'Proposed Work shows status Proposed in District list');

    // -------------------------------------------------------------------------
    // TEST 5: District Collector Approving Sanction
    // -------------------------------------------------------------------------
    console.log('\n--- 4. District Collector Approving Sanction ---');

    const approveRes = await fetch(`${baseUrl}/api/works/${proposedWorkId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${distToken}`,
      },
      body: JSON.stringify({
        status: 'Approved',
        note: 'Administrative sanction granted after field feasibility check.',
      }),
    });
    const approveData = await approveRes.json();
    assert(approveRes.status === 200 && approveData.success, 'District Collector Approves Sanction (HTTP 200)', `New status: ${approveData.work?.work_status}`);
    assert(!!approveData.work?.date_of_administrative_approval, 'Administrative Approval Date Recorded', `Date: ${approveData.work?.date_of_administrative_approval}`);

    // -------------------------------------------------------------------------
    // TEST 6: Reflection on MP Dashboard
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Reflection on MP Dashboard ---');

    const mpDashRes = await fetch(`${baseUrl}/api/dashboards/mp`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    const mpDashData = await mpDashRes.json();
    const foundInMp = mpDashData.worksList?.find((w: any) => w.unique_work_number === proposedWorkId);
    assert(!!foundInMp && foundInMp.work_status === 'Approved', 'Approved Status Reflected Live on MP Dashboard', `Status: ${foundInMp?.work_status}`);

    // -------------------------------------------------------------------------
    // TEST 7: Citizen Ground Feedback — Normal GPS Verification (< 1.0 km)
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Citizen Ground Feedback & Photo Geotag Verification ---');

    // Use an existing work in Pune
    const targetWork = distWorksData.works?.find((w: any) => w.nodal_district?.toLowerCase() === 'pune') || distWorksData.works?.[0];
    const targetWorkId = targetWork?.unique_work_number;

    const normalFeedbackPayload = {
      work_id: targetWorkId,
      work_name: targetWork?.work_name,
      feedback_text: 'Work is progressing steadily. Concrete foundation poured and curing in progress.',
      latitude: 18.5204, // Centroid of Pune
      longitude: 73.8567,
      photo_url: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=800&q=80',
      citizen_name: 'Ramesh Kulkarni',
      contact: '9876543210',
    };

    const normalFbRes = await fetch(`${baseUrl}/api/citizen/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citToken}`,
      },
      body: JSON.stringify(normalFeedbackPayload),
    });
    const normalFbData = await normalFbRes.json();
    assert(normalFbRes.status === 201 && normalFbData.success, 'Normal Citizen Feedback Submitted (HTTP 201)');
    assert(normalFbData.evaluation?.severity === 'LOW', 'Normal Feedback Evaluated as LOW Severity', `Severity: ${normalFbData.evaluation?.severity}`);
    assert(normalFbData.evaluation?.vision?.gpsMismatch === false, 'No Geotag Mismatch within 1.0 km threshold', `Distance: ${normalFbData.evaluation?.vision?.distanceKm} km`);

    // -------------------------------------------------------------------------
    // TEST 8: Citizen Ground Feedback — High-Risk Geotag Mismatch & Safety Hazard
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Citizen High-Risk Anomaly & Dual-Alert Broadcasting ---');

    const highRiskFeedbackPayload = {
      work_id: targetWorkId,
      work_name: targetWork?.work_name,
      feedback_text: 'DANGER: Site is completely abandoned and deserted! Deep open excavation filled with water, extreme safety hazard. Contractor nowhere to be seen, ghost work suspected!',
      latitude: 19.0760, // Mumbai (approx 120 km from Pune -> severe mismatch)
      longitude: 72.8777,
      photo_url: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=800&q=80',
      citizen_name: 'Sunil Jadhav',
      contact: '9822001122',
    };

    const highRiskFbRes = await fetch(`${baseUrl}/api/citizen/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citToken}`,
      },
      body: JSON.stringify(highRiskFeedbackPayload),
    });
    const highRiskFbData = await highRiskFbRes.json();
    assert(highRiskFbRes.status === 201 && highRiskFbData.success, 'High-Risk Feedback Submitted (HTTP 201)');
    assert(highRiskFbData.evaluation?.severity === 'HIGH', 'Flagged as HIGH SEVERITY by Multi-Signal AI Engine');
    assert(highRiskFbData.evaluation?.vision?.gpsMismatch === true, 'EXIF GPS Distance Mismatch Detected (> 1.0 km)', `Distance: ${highRiskFbData.evaluation?.vision?.distanceKm} km`);
    assert(!!highRiskFbData.alert?.id, 'High-Priority Alert Triggered and Created', `Alert ID: ${highRiskFbData.alert?.id}`);
    const generatedAlertId = highRiskFbData.alert?.id;

    // -------------------------------------------------------------------------
    // TEST 9: Verification on District Collector Case Queue
    // -------------------------------------------------------------------------
    const distAlertsRes = await fetch(`${baseUrl}/api/alerts`, {
      headers: { Authorization: `Bearer ${distToken}` },
    });
    const distAlerts = await distAlertsRes.json();
    const foundInDistAlerts = distAlerts.find((a: any) => a.id === generatedAlertId || (a.source === 'CITIZEN_REPORTED' && a.workId === targetWorkId));
    assert(!!foundInDistAlerts, 'Citizen High-Risk Alert Appears in District Case Queue', `Source: ${foundInDistAlerts?.source}, Severity: ${foundInDistAlerts?.severity}`);
    assert(foundInDistAlerts?.source === 'CITIZEN_REPORTED', 'Alert Source is CITIZEN_REPORTED');

    // -------------------------------------------------------------------------
    // TEST 10: Verification on MP Dashboard (Dual Alerting)
    // -------------------------------------------------------------------------
    const mpDashAlertsRes = await fetch(`${baseUrl}/api/dashboards/mp`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    const mpDashAlertsData = await mpDashAlertsRes.json();
    const foundInMpAlerts = (mpDashAlertsData.citizenAlerts || mpDashAlertsData.alertsList || []).some(
      (a: any) => a.source === 'CITIZEN_REPORTED'
    );
    assert(foundInMpAlerts, 'Dual Alerting: Citizen High-Risk Alert Reflected on MP Dashboard');

    // -------------------------------------------------------------------------
    // TEST 11: Guardrails & Validation
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Guardrails & Error Handling ---');

    // Missing feedback_text
    const invalidFbRes = await fetch(`${baseUrl}/api/citizen/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citToken}`,
      },
      body: JSON.stringify({ work_id: targetWorkId }),
    });
    assert(invalidFbRes.status === 400, 'Guardrail: Missing feedback_text rejected with HTTP 400');

    // Non-existent work
    const nonExistentFbRes = await fetch(`${baseUrl}/api/citizen/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citToken}`,
      },
      body: JSON.stringify({ work_id: 'NON_EXISTENT_WORK_999', feedback_text: 'Testing non existent' }),
    });
    assert(nonExistentFbRes.status === 404, 'Guardrail: Non-existent work rejected with HTTP 404');

    // Unauthenticated proposal request
    const unauthPropRes = await fetch(`${baseUrl}/api/works/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proposalPayload),
    });
    assert(unauthPropRes.status === 401, 'Guardrail: Unauthenticated proposal rejected with HTTP 401');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    server.close();
    console.log('\n' + '='.repeat(70));
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('='.repeat(70));
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
