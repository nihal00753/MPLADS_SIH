import { NextRequest, NextResponse } from 'next/server';
import { MOCK_ALERTS } from '@/app/api/_mock/data';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const alert = MOCK_ALERTS.find(a => a.id === params.id);
  if (!alert) return NextResponse.json({ error: 'Alert not found' }, { status: 404 });

  return NextResponse.json({
    bundleId: `CASE-BUNDLE-${params.id}`,
    generatedAt: new Date().toISOString(),
    alert,
    status: 'READY_FOR_CVC_REFERRAL',
    complianceCertificate: 'Certified under Section 65B of Indian Evidence Act (Digital Records)',
  });
}
