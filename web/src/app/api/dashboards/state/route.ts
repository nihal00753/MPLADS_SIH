import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, getScopedAlerts } from '@/app/api/_mock/data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const districtComparisons = [
    { district: 'Pune', totalWorks: 97, sanctionedCr: 24.8, utilizationPct: 78, flagCount: 14, avgActionDays: 3.2, riskLevel: 'MEDIUM' },
    { district: 'Hingoli', totalWorks: 64, sanctionedCr: 18.2, utilizationPct: 82, flagCount: 6, avgActionDays: 2.1, riskLevel: 'LOW' },
    { district: 'Nashik', totalWorks: 82, sanctionedCr: 21.0, utilizationPct: 69, flagCount: 18, avgActionDays: 6.8, riskLevel: 'HIGH' },
    { district: 'Nagpur', totalWorks: 75, sanctionedCr: 19.5, utilizationPct: 74, flagCount: 11, avgActionDays: 4.1, riskLevel: 'MEDIUM' },
    { district: 'Thane', totalWorks: 88, sanctionedCr: 23.4, utilizationPct: 66, flagCount: 22, avgActionDays: 7.9, riskLevel: 'HIGH' },
    { district: 'Aurangabad', totalWorks: 58, sanctionedCr: 15.6, utilizationPct: 71, flagCount: 9, avgActionDays: 3.8, riskLevel: 'LOW' },
  ];

  const alerts = getScopedAlerts(user);
  const escalationQueue = alerts.filter(a => a.status === 'ESCALATED' || (a.status === 'OPEN' && new Date(a.slaDeadline).getTime() < Date.now()));

  return NextResponse.json({
    stateName: user.scopeId || 'Maharashtra',
    districtComparisons,
    escalationQueue: escalationQueue.slice(0, 10),
    categoryBenchmarks: [
      { category: 'Community Hall Construction', unitCostMinLakh: 20, unitCostMaxLakh: 45, stateAvgDays: 140, fastestDistrict: 'Hingoli (108d)' },
      { category: 'School Additional Classroom', unitCostMinLakh: 8, unitCostMaxLakh: 16, stateAvgDays: 95, fastestDistrict: 'Pune (72d)' },
      { category: 'Public Toilet Complex', unitCostMinLakh: 6, unitCostMaxLakh: 12, stateAvgDays: 65, fastestDistrict: 'Aurangabad (50d)' },
      { category: 'Solar High-Mast Lighting', unitCostMinLakh: 3, unitCostMaxLakh: 7, stateAvgDays: 30, fastestDistrict: 'Nashik (24d)' },
    ],
  });
}
