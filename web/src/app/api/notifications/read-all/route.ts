import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, MOCK_NOTIFICATIONS } from '@/app/api/_mock/data';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  MOCK_NOTIFICATIONS.forEach(n => {
    if (!user || user.role === 'MINISTRY' || n.userId === user.userId || (n.role === user.role && n.scopeId === user.scopeId)) {
      n.read = true;
    }
  });
  return NextResponse.json({ success: true });
}
