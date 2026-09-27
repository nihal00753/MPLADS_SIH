import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, MOCK_WORKS, MOCK_ALERTS } from '@/app/api/_mock/data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const works = MOCK_WORKS;
  const alerts = MOCK_ALERTS;
  const totalWorks = works.length;
  const totalSanctionedAmt = works.reduce((s, w) => s + w.sanction_amount, 0);
  const totalSpentAmt = works.reduce((s, w) => s + Math.round(w.sanction_amount * (w.financial_progress_pct / 100)), 0);
  const utilizationPct = Math.round((totalSpentAmt / totalSanctionedAmt) * 100);
  const totalAnomalies = works.filter(w => w.is_anomaly).length;

  return NextResponse.json({
    kpiRibbon: {
      nationalEntitlementCr: 3980.0,
      fundsReleasedCr: parseFloat((totalSanctionedAmt / 1e7).toFixed(2)),
      utilizationPct,
      activeWorks: totalWorks,
      nationalFlagRatePct: parseFloat(((totalAnomalies / totalWorks) * 100).toFixed(1)),
      totalMPs: 543,
    },
    stateStats: [
      { state: 'Uttar Pradesh', totalWorks: 1915, anomalies: 382, ratePct: 19.9, sanctionedCr: 412.5, utilizationPct: 71 },
      { state: 'Maharashtra', totalWorks: 1126, anomalies: 198, ratePct: 17.6, sanctionedCr: 248.0, utilizationPct: 76 },
      { state: 'Bihar', totalWorks: 983, anomalies: 214, ratePct: 21.8, sanctionedCr: 210.4, utilizationPct: 68 },
      { state: 'West Bengal', totalWorks: 935, anomalies: 184, ratePct: 19.7, sanctionedCr: 195.2, utilizationPct: 72 },
      { state: 'Tamil Nadu', totalWorks: 859, anomalies: 112, ratePct: 13.0, sanctionedCr: 184.8, utilizationPct: 83 },
      { state: 'Rajasthan', totalWorks: 780, anomalies: 142, ratePct: 18.2, sanctionedCr: 165.0, utilizationPct: 74 },
    ],
    topNationalRiskQueue: alerts
      .filter(a => a.severity === 'HIGH' && a.status === 'OPEN')
      .slice(0, 8)
      .map(a => ({
        id: a.id, workId: a.workId, workTitle: a.workTitle, state: a.state,
        district: a.district, sanctionAmountCr: parseFloat((a.sanctionAmount / 1e7).toFixed(2)),
        riskScore: a.riskScore, reason: a.reason, slaDeadline: a.slaDeadline,
      })),
    crossSchemeDoubleFunding: {
      totalEstimatedRiskCr: 48.6,
      totalFlaggedPairs: 124,
      byState: [
        { state: 'Uttar Pradesh', count: 38, amountCr: 14.8, matchedSchemes: ['PMGSY', 'DMF'] },
        { state: 'Maharashtra', count: 26, amountCr: 11.2, matchedSchemes: ['Smart Cities', 'PMGSY'] },
        { state: 'Bihar', count: 22, amountCr: 9.4, matchedSchemes: ['Jal Jeevan Mission', 'DMF'] },
        { state: 'West Bengal', count: 18, amountCr: 7.1, matchedSchemes: ['MGNREGA Infrastructure'] },
      ],
    },
    nationalBlacklist: [
      { vendorId: 'V00012', vendorName: 'Apex Infrastructure & Logistics Ltd', activeStates: ['Maharashtra', 'Gujarat', 'Karnataka'], totalSanctionsCr: 34.5, delayRatePct: 62, fraudIncidents: 4, referralStatus: 'Recommended for CVC / GeM Debarment', reason: 'Shared registered address with shell entities; repeated ghost projects flagged across 3 states.' },
      { vendorId: 'V00045', vendorName: 'Bharat Civil Tech & Construction', activeStates: ['Uttar Pradesh', 'Bihar'], totalSanctionsCr: 28.2, delayRatePct: 54, fraudIncidents: 3, referralStatus: 'Under Central Vigilance Review', reason: 'Circular sub-contracting and sequential split-invoicing below ₹25 Lakh tender limit.' },
      { vendorId: 'V00088', vendorName: 'Global Engineering Solutions', activeStates: ['West Bengal', 'Odisha'], totalSanctionsCr: 19.8, delayRatePct: 48, fraudIncidents: 3, referralStatus: 'Flagged for Special CBI Audit', reason: 'Duplicate progress photographs submitted across two distinct district contracts.' },
    ],
  });
}
