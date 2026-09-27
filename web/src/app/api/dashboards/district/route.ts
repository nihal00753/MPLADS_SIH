import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, getScopedWorks, getScopedAlerts } from '@/app/api/_mock/data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const works = getScopedWorks(user);
  const alerts = getScopedAlerts(user);

  const totalWorks = works.length;
  const totalSanctionedAmt = works.reduce((s, w) => s + w.sanction_amount, 0);
  const totalSpentAmt = works.reduce((s, w) => s + Math.round(w.sanction_amount * (w.financial_progress_pct / 100)), 0);
  const utilizationPct = totalSanctionedAmt > 0 ? Math.round((totalSpentAmt / totalSanctionedAmt) * 100) : 0;

  const openAlerts = alerts.filter(a => a.status === 'OPEN').length;
  const highRiskAlerts = alerts.filter(a => a.severity === 'HIGH' && a.status === 'OPEN').length;

  return NextResponse.json({
    summaryStrip: {
      districtName: user.scopeId || 'Pune',
      totalWorks,
      totalSanctionedCr: parseFloat((totalSanctionedAmt / 1e7).toFixed(2)),
      totalSpentCr: parseFloat((totalSpentAmt / 1e7).toFixed(2)),
      utilizationPct,
      averageDelayDays: 42,
      openAlerts,
      highRiskAlerts,
      pendingSlaAlerts: Math.min(3, openAlerts),
    },
    statusBreakdown: {
      completed: works.filter(w => w.work_status === 'Completed').length,
      inProgress: works.filter(w => w.work_status === 'Work in Progress').length,
      stalled: works.filter(w => w.work_status === 'Stalled').length,
      sanctioned: works.filter(w => w.work_status === 'Sanctioned').length,
    },
    recentAlerts: alerts.slice(0, 15),
  });
}
