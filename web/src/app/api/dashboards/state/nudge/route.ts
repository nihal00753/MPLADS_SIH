import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { district, message } = await req.json();
  if (!district) return NextResponse.json({ error: 'District name is required' }, { status: 400 });

  return NextResponse.json({
    success: true,
    message: `Official administrative nudge dispatched to ${district} District Collectorate.`,
    notification: {
      id: `nudge-${Date.now()}`,
      userId: `collector-${district.toLowerCase()}`,
      role: 'DISTRICT',
      scopeId: district,
      type: 'SLA_WARNING',
      message: message || `STATE DIRECTIVE: District Collector ${district} is requested to expedite pending SLA alert clearance immediately.`,
      read: false,
      createdAt: new Date().toISOString(),
    },
  });
}
