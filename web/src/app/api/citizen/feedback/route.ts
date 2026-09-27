import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, MOCK_WORKS, MOCK_ALERTS } from '@/app/api/_mock/data';

export const dynamic = 'force-dynamic';

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const DISTRICT_COORDINATES: Record<string, { lat: number; lon: number }> = {
  pune: { lat: 18.5204, lon: 73.8567 },
  hingoli: { lat: 19.7196, lon: 77.1478 },
  mumbai: { lat: 19.076, lon: 72.8777 },
  nagpur: { lat: 21.1458, lon: 79.0882 },
  nashik: { lat: 19.9975, lon: 73.7898 },
};

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  const body = await req.json();
  const {
    work_id,
    feedback_text,
    latitude,
    longitude,
    photo_url,
    citizen_name,
    contact,
  } = body;

  if (!work_id) {
    return NextResponse.json({ error: 'work_id is required.' }, { status: 400 });
  }

  if (!feedback_text || typeof feedback_text !== 'string' || feedback_text.trim().length < 10) {
    return NextResponse.json(
      { error: 'feedback_text is required and must be at least 10 characters long.' },
      { status: 400 }
    );
  }

  const work = MOCK_WORKS.find(w => w.unique_work_number === work_id);
  if (!work) {
    return NextResponse.json({ error: `Work '${work_id}' not found in registry.` }, { status: 404 });
  }

  const textLower = feedback_text.toLowerCase();
  const hazardKeywords = [
    'collapse', 'crack', 'abandon', 'hazard', 'danger', 'substandard',
    'scam', 'ghost', 'corrupt', 'bribe', 'poor quality', 'disaster',
  ];
  const matchedKeywords = hazardKeywords.filter(k => textLower.includes(k));
  const isSafetyHazard = matchedKeywords.length > 0;
  const nlpUrgency: 'LOW' | 'MEDIUM' | 'HIGH' = isSafetyHazard ? 'HIGH' : textLower.length > 80 ? 'MEDIUM' : 'LOW';

  const userLat = Number(latitude);
  const userLon = Number(longitude);
  let gpsMismatch = false;
  let distanceKm: number | undefined = undefined;
  let gpsVerified = false;

  if (!isNaN(userLat) && !isNaN(userLon) && userLat !== 0 && userLon !== 0) {
    const districtKey = work.nodal_district.toLowerCase().trim();
    const siteCoords = DISTRICT_COORDINATES[districtKey] || { lat: 18.5204, lon: 73.8567 };
    distanceKm = parseFloat(haversineKm(userLat, userLon, siteCoords.lat, siteCoords.lon).toFixed(3));
    gpsMismatch = distanceKm > 1.0;
    gpsVerified = true;
  }

  const isHighRisk = nlpUrgency === 'HIGH' || isSafetyHazard || gpsMismatch;
  const severity: 'LOW' | 'MEDIUM' | 'HIGH' = isHighRisk ? 'HIGH' : 'LOW';

  let alertRecord = null;
  if (isHighRisk) {
    const reasonParts: string[] = [];
    if (gpsMismatch && distanceKm !== undefined) {
      reasonParts.push(`Geotag discrepancy detected: photo taken ${distanceKm} km from site (>1.0 km threshold).`);
    }
    if (isSafetyHazard) {
      reasonParts.push(`Hazardous defect reported: ${matchedKeywords.join(', ')}.`);
    }
    if (reasonParts.length === 0) {
      reasonParts.push(`Citizen grievance: ${feedback_text.slice(0, 100)}`);
    }

    alertRecord = {
      id: `ALT-CITIZEN-${Date.now().toString().slice(-6)}`,
      workId: work.unique_work_number,
      workTitle: work.work_name,
      workCategory: work.work_category,
      district: work.nodal_district,
      state: work.state,
      mpName: work.mp_name,
      sanctionAmount: work.sanction_amount,
      spentAmount: Math.round(work.sanction_amount * (work.financial_progress_pct / 100)),
      riskScore: isHighRisk ? 0.88 : 0.25,
      severity,
      reason: `[Citizen Ground Report] ${reasonParts.join(' ')}`,
      source: 'CITIZEN_REPORTED',
      status: 'OPEN',
      slaDeadline: new Date(Date.now() + 72 * 3600000).toISOString(),
      createdAt: new Date().toISOString(),
      vendorId: work.vendor_id,
      vendorName: work.vendor_name,
    };

    MOCK_ALERTS.unshift(alertRecord as any);
  }

  work.note = `${work.note || ''} | Citizen Feedback: "${feedback_text.slice(0, 80)}..."`;

  return NextResponse.json({
    success: true,
    message: isHighRisk
      ? 'High-priority ground alert generated and broadcast to District Collector & MP dashboards.'
      : 'Feedback recorded successfully. Thank you for contributing to MPLADS transparency.',
    evaluation: {
      isHighRisk,
      severity,
      nlp: { urgency: nlpUrgency, isSafetyHazard, matchedKeywords },
      vision: {
        gpsVerified,
        gpsMismatch,
        distanceKm,
        claimedCoordinates: gpsVerified ? { lat: userLat, lon: userLon } : null,
      },
    },
    alert: alertRecord,
  }, { status: 201 });
}
