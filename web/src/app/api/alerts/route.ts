import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, getScopedAlerts } from '@/app/api/_mock/data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const alerts = getScopedAlerts(user);
  alerts.sort((a, b) => b.riskScore - a.riskScore);
  return NextResponse.json(alerts);
}
