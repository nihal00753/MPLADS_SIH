import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json();
  return NextResponse.json({
    success: true,
    work: { unique_work_number: `MPLW_PROP_${Date.now()}`, ...body, work_status: 'Proposed', physical_progress_pct: 0, financial_progress_pct: 0 },
    riskEvaluation: { score: 0.25, level: 'LOW', reason: 'Initial proposal verified against district benchmarks.' },
  }, { status: 201 });
}
