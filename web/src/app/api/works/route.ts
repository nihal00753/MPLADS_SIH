import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, getScopedWorks } from '@/app/api/_mock/data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const works = getScopedWorks(user);
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  return NextResponse.json({
    total: works.length,
    limit,
    offset,
    works: works.slice(offset, offset + limit),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return NextResponse.json({
    success: true,
    work: { unique_work_number: `MPLW_PROP_${Date.now()}`, ...body, work_status: 'Proposed', physical_progress_pct: 0, financial_progress_pct: 0 },
    riskEvaluation: { score: 0.25, level: 'LOW', reason: 'Initial proposal verified against district benchmarks.' },
  }, { status: 201 });
}
