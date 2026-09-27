import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { status, note } = await req.json();
  return NextResponse.json({ success: true, work: { unique_work_number: params.id, work_status: status || 'Updated', note: note || '' } });
}
