import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, getScopedNotifications } from '@/app/api/_mock/data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  const data = getScopedNotifications(user);
  return NextResponse.json(data);
}
