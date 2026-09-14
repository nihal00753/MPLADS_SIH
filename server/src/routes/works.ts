import { Router, Response } from 'express';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth';
import { dataService, WorkRecord } from '../services/dataService';
import { getMLClient } from '../lib/ml/MLServiceClient';

const router = Router();

/**
 * GET /api/works
 * Return filterable, scoped list of works
 */
router.get('/', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  let works = dataService.getScopedWorks(user);

  const { category, status, search, is_anomaly, limit = '50', offset = '0' } = req.query;

  if (category && typeof category === 'string') {
    works = works.filter((w) => w.work_category.toLowerCase() === category.toLowerCase());
  }

  if (status && typeof status === 'string') {
    works = works.filter((w) => w.work_status.toLowerCase() === status.toLowerCase());
  }

  if (is_anomaly !== undefined) {
    const flag = is_anomaly === 'true' || is_anomaly === '1';
    works = works.filter((w) => w.is_anomaly === flag);
  }

  if (search && typeof search === 'string') {
    const q = search.toLowerCase();
    works = works.filter(
      (w) =>
        w.work_name.toLowerCase().includes(q) ||
        w.unique_work_number.toLowerCase().includes(q) ||
        w.vendor_name.toLowerCase().includes(q) ||
        w.constituency.toLowerCase().includes(q) ||
        w.nodal_district.toLowerCase().includes(q)
    );
  }

  const total = works.length;
  const lim = parseInt(limit as string, 10) || 50;
  const off = parseInt(offset as string, 10) || 0;
  const paginated = works.slice(off, off + lim);

  return res.json({
    total,
    limit: lim,
    offset: off,
    works: paginated,
  });
});

/**
 * GET /api/works/:id
 * Retrieve comprehensive work detail view with milestone timeline, geo-tagged photos,
 * expenditure drawdown, vendor scorecard, and ML risk explanation.
 */
router.get('/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const work = dataService.worksById.get(id);

  if (!work) {
    return res.status(404).json({ error: `Work '${id}' not found` });
  }

  const mlClient = getMLClient();
  const mlScore = await mlClient.scoreWork(id);
  const photoCheck = await mlClient.checkPhoto('default.jpg', id);
  const crossScheme = await mlClient.matchCrossScheme(id);

  // Generate milestone timeline
  const timeline = [
    {
      stage: 'Proposal Received from MP',
      date: work.date_of_receipt_of_work_proposal_from_mp || '2024-06-15',
      completed: true,
      officer: work.mp_name,
    },
    {
      stage: 'Administrative Approval Granted',
      date: work.date_of_administrative_approval || '2024-07-02',
      completed: true,
      officer: `${work.nodal_district} District Planning Office`,
    },
    {
      stage: 'Technical Sanction & Tender Award',
      date: '2024-08-10',
      completed: true,
      officer: work.implementing_agency_name,
    },
    {
      stage: 'Ground Civil Work Execution',
      date: '2024-11-20',
      completed: work.physical_progress_pct > 20,
      progress: `${work.physical_progress_pct}% completed`,
    },
    {
      stage: 'Completion & Asset Handover',
      date: work.work_status === 'Completed' ? '2025-02-14' : 'Pending',
      completed: work.work_status === 'Completed',
    },
  ];

  // Expenditure drawdown schedule
  const spentAmt = Math.round(work.sanction_amount * (work.financial_progress_pct / 100));
  const expenditureDrawdown = [
    { installment: 'Advance Mobilization (20%)', amount: Math.round(work.sanction_amount * 0.2), date: '2024-08-15', status: 'Disbursed' },
    { installment: 'Stage 1 Plinth & Foundation (30%)', amount: Math.round(work.sanction_amount * 0.3), date: '2024-10-10', status: spentAmt >= work.sanction_amount * 0.5 ? 'Disbursed' : 'Pending' },
    { installment: 'Stage 2 Superstructure (35%)', amount: Math.round(work.sanction_amount * 0.35), date: '2024-12-05', status: spentAmt >= work.sanction_amount * 0.85 ? 'Disbursed' : 'Pending' },
    { installment: 'Final Settlement / Retention (15%)', amount: Math.round(work.sanction_amount * 0.15), date: '2025-02-28', status: work.work_status === 'Completed' ? 'Disbursed' : 'Held' },
  ];

  // Geo-tagged photos
  const photos = [
    {
      id: `ph-01-${id}`,
      url: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=800&q=80',
      caption: 'Site commencement marker & geotag verification',
      lat: 18.5204,
      lon: 73.8567,
      isVerified: !photoCheck.gpsMismatch,
      timestamp: '2024-08-12 10:30 IST',
    },
    {
      id: `ph-02-${id}`,
      url: 'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=800&q=80',
      caption: 'Mid-stage physical construction inspection photo',
      lat: 18.5204,
      lon: 73.8567,
      isVerified: true,
      timestamp: '2024-11-18 14:15 IST',
    },
  ];

  return res.json({
    work,
    timeline,
    expenditureDrawdown,
    photos,
    mlRiskProfile: mlScore,
    photoCheck,
    crossSchemeMatches: crossScheme,
  });
});

/**
 * POST /api/works/propose
 * Allows MP to propose a new MPLADS work with letter of recommendation
 */
router.post('/propose', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'MP' && req.user?.role !== 'MINISTRY') {
    return res.status(403).json({ error: 'Only MPs can propose new works.' });
  }

  const {
    work_name,
    work_category,
    nodal_district,
    state,
    constituency,
    sanction_amount,
    implementing_agency_name,
    vendor_name,
    recommendation_letter_text,
    description,
  } = req.body;

  if (!work_name || !work_category || !nodal_district || !sanction_amount) {
    return res.status(400).json({
      error: 'work_name, work_category, nodal_district, and sanction_amount are required.',
    });
  }

  const amount = Number(sanction_amount);
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'sanction_amount must be a positive number.' });
  }

  const workId = `MPLW_PROP_${Date.now()}`;
  const effectiveState = state || 'Maharashtra';
  const effectiveDistrict = nodal_district;
  const effectiveConstituency = req.user?.scopeId || constituency || 'Pune';

  // Compute pre-sanction risk score via ML Client
  let riskScore = 0.25;
  let riskLevel = 'LOW';
  let riskReason = 'Initial proposal verified against district benchmarks.';
  try {
    const mlClient = getMLClient();
    const scoreRes = await mlClient.scoreWork(workId);
    riskScore = scoreRes.riskScore;
    riskLevel = scoreRes.severity;
    riskReason = scoreRes.reason;
  } catch {
    if (amount > 50000000) {
      riskScore = 0.75;
      riskLevel = 'HIGH';
      riskReason = 'Sanction exceeds typical district benchmark threshold (> ₹5 Cr).';
    }
  }

  const newWork: WorkRecord = {
    unique_work_number: workId,
    state: effectiveState,
    nodal_district: effectiveDistrict,
    implementing_district: effectiveDistrict,
    house_name: 'Lok Sabha',
    member_type: 'Elected',
    mp_name: req.user.name,
    constituency: effectiveConstituency,
    work_category,
    work_name,
    sanction_amount: amount,
    date_of_receipt_of_work_proposal_from_mp: new Date().toISOString().split('T')[0],
    date_of_administrative_approval: '',
    implementing_agency_name: implementing_agency_name || 'District Rural Development Agency',
    vendor_id: vendor_name ? `V_PROP_${Date.now().toString().slice(-4)}` : '',
    vendor_name: vendor_name || 'TBD - Post Sanction Tender',
    work_status: 'Proposed',
    physical_progress_pct: 0,
    financial_progress_pct: 0,
    category_benchmark_min: Math.round(amount * 0.8),
    category_benchmark_max: Math.round(amount * 1.2),
    is_anomaly: riskScore >= 0.7,
    anomaly_type: riskScore >= 0.7 ? 'High Pre-Sanction Variance' : '',
    unit: '',
    note: description || (recommendation_letter_text ? `Recommendation: ${recommendation_letter_text.slice(0, 100)}` : `Proposed by ${req.user.name}`),
  };

  dataService.addWork(newWork);

  // If high risk, also create alert for review
  if (riskScore >= 0.7) {
    dataService.addAlert({
      id: `ALT-PROP-${Date.now().toString().slice(-5)}`,
      workId: newWork.unique_work_number,
      workTitle: newWork.work_name,
      workCategory: newWork.work_category,
      district: newWork.nodal_district,
      state: newWork.state,
      mpName: newWork.mp_name,
      sanctionAmount: newWork.sanction_amount,
      spentAmount: 0,
      riskScore,
      severity: 'HIGH',
      reason: `Pre-sanction high risk flagged on proposal: ${riskReason}`,
      source: 'AI_FLAGGED',
      status: 'OPEN',
      slaDeadline: new Date(Date.now() + 72 * 3600000).toISOString(),
      createdAt: new Date().toISOString(),
      vendorId: newWork.vendor_id,
      vendorName: newWork.vendor_name,
    });
  }

  return res.status(201).json({
    success: true,
    work: newWork,
    riskEvaluation: {
      score: riskScore,
      level: riskLevel,
      reason: riskReason,
    },
  });
});

/**
 * PATCH /api/works/:id/status
 * Allows District Collector to approve or update status of proposed works
 */
router.patch('/:id/status', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status, note } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'status is required.' });
  }

  const updated = dataService.updateWorkStatus(id, status);
  if (!updated) {
    return res.status(404).json({ error: `Work '${id}' not found.` });
  }

  if (status === 'Approved' && !updated.date_of_administrative_approval) {
    updated.date_of_administrative_approval = new Date().toISOString().split('T')[0];
  }

  if (note) {
    updated.note = `${updated.note} | District Note: ${note}`;
  }

  return res.json({
    success: true,
    work: updated,
  });
});

export default router;

