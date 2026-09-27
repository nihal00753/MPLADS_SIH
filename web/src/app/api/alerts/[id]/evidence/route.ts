import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { note, photoUrl } = await req.json();
  return NextResponse.json({ success: true, alert: { id: params.id, evidenceNotes: [note], evidencePhotos: photoUrl ? [photoUrl] : [] } });
}
