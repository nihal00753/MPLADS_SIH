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
  const allocatedLimit = 190289442;
  const utilizationPct = Math.round((totalSpentAmt / allocatedLimit) * 100);

  return NextResponse.json({
    mpInfo: {
      name: user.name,
      constituency: user.scopeId || 'Hingoli',
      state: 'Maharashtra',
      allocatedLimitCr: parseFloat((allocatedLimit / 1e7).toFixed(2)),
      totalSanctionedCr: parseFloat((totalSanctionedAmt / 1e7).toFixed(2)),
      totalSpentCr: parseFloat((totalSpentAmt / 1e7).toFixed(2)),
      utilizationPct,
    },
    lifecycle: {
      totalWorks,
      sanctioned: works.filter(w => w.work_status === 'Sanctioned').length,
      inProgress: works.filter(w => w.work_status === 'Work in Progress').length,
      completed: works.filter(w => w.work_status === 'Completed').length,
      stalled: works.filter(w => w.work_status === 'Stalled').length,
      flaggedCount: alerts.filter(a => a.status === 'OPEN').length,
    },
    paceTrend: [
      { month: 'Apr', targetCr: 2.1, actualCr: 1.8 },
      { month: 'Jun', targetCr: 4.5, actualCr: 4.2 },
      { month: 'Aug', targetCr: 7.0, actualCr: 6.9 },
      { month: 'Oct', targetCr: 9.8, actualCr: 10.2 },
      { month: 'Dec', targetCr: 12.5, actualCr: 12.1 },
      { month: 'Feb', targetCr: 15.0, actualCr: 14.85 },
    ],
    peerBenchmark: {
      rankInState: 4,
      totalStateMPs: 48,
      percentileNational: 88,
      statusText: 'Top 12% in Execution Speed',
      description: 'Your constituency clears administrative milestones 14 days faster than the Maharashtra state average.',
      categoryFocus: 'Primary Healthcare & Rural Sanitation',
    },
    transparencyScore: {
      score: 94,
      grade: 'A+',
      tier: 'Exemplary Compliance Tier',
      auditCleanPct: 96,
      digitalGeotagCoveragePct: 98,
      publicGrievanceResolutionPct: 91,
    },
    pressSummary: `QUARTERLY MPLADS PERFORMANCE DIGEST — ${user.scopeId || 'Hingoli'}\nMember of Parliament: ${user.name}\nReporting Period: Q3 FY 2024-25\n\nKEY ACCOMPLISHMENTS:\n- Total Fund Allocation Utilized: ₹${(totalSpentAmt / 1e7).toFixed(2)} Crore (${utilizationPct}%)\n- Total Works Sanctioned: ${totalWorks}\n- Transparency Rating: Grade A+ (94/100)`,
    worksList: works.slice(0, 50),
    alertsList: alerts.slice(0, 20),
    citizenAlerts: alerts.filter(a => a.source === 'CITIZEN_REPORTED').slice(0, 10),
  });
}
