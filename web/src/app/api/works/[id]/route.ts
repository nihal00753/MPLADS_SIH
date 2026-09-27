import { NextRequest, NextResponse } from 'next/server';
import { MOCK_WORKS } from '@/app/api/_mock/data';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const work = MOCK_WORKS.find(w => w.unique_work_number === params.id);
  if (!work) return NextResponse.json({ error: `Work '${params.id}' not found` }, { status: 404 });

  return NextResponse.json({
    work,
    timeline: [
      { stage: 'Proposal Received from MP', date: work.date_of_receipt_of_work_proposal_from_mp, completed: true, officer: work.mp_name },
      { stage: 'Administrative Approval Granted', date: work.date_of_administrative_approval, completed: true, officer: `${work.nodal_district} District Planning Office` },
      { stage: 'Technical Sanction & Tender Award', date: '2024-08-10', completed: true, officer: work.implementing_agency_name },
      { stage: 'Ground Civil Work Execution', date: '2024-11-20', completed: work.physical_progress_pct > 20, progress: `${work.physical_progress_pct}% completed` },
      { stage: 'Completion & Asset Handover', date: work.work_status === 'Completed' ? '2025-02-14' : 'Pending', completed: work.work_status === 'Completed' },
    ],
    photos: [
      { id: `ph-01-${params.id}`, url: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=800&q=80', caption: 'Site commencement marker', lat: 18.5204, lon: 73.8567, isVerified: true, timestamp: '2024-08-12 10:30 IST' },
    ],
    mlRiskProfile: { riskScore: work.is_anomaly ? 0.82 : 0.18, severity: work.is_anomaly ? 'HIGH' : 'LOW', reason: work.is_anomaly ? work.anomaly_type : 'No anomalies detected.' },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { status } = await req.json();
  const work = MOCK_WORKS.find(w => w.unique_work_number === params.id);
  if (!work) return NextResponse.json({ error: `Work '${params.id}' not found.` }, { status: 404 });
  return NextResponse.json({ success: true, work: { ...work, work_status: status || work.work_status } });
}
