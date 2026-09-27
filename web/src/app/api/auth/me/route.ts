import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, REDIRECT_MAP } from '@/app/api/_mock/data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return NextResponse.json({ user, redirectPath: REDIRECT_MAP[user.role] });
}
