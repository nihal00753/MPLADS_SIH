import { NextRequest, NextResponse } from 'next/server';
import { MOCK_NOTIFICATIONS } from '@/app/api/_mock/data';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const notif = MOCK_NOTIFICATIONS.find(n => n.id === params.id);
  if (notif) {
    notif.read = true;
  }
  return NextResponse.json({ success: true });
}
