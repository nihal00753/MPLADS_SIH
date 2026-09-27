import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { action, note, dismissReason } = await req.json();
  if (!['ACTION', 'ESCALATE', 'DISMISS'].includes(action)) {
    return NextResponse.json({ error: 'Action must be one of ACTION, ESCALATE, DISMISS' }, { status: 400 });
  }
  if (action === 'DISMISS' && !dismissReason) {
    return NextResponse.json({ error: 'A dismissal reason is required to dismiss an alert' }, { status: 400 });
  }
  const statusMap: Record<string, string> = { ACTION: 'ACTIONED', ESCALATE: 'ESCALATED', DISMISS: 'DISMISSED' };
  return NextResponse.json({ success: true, alert: { id: params.id, status: statusMap[action], note, dismissReason } });
}
