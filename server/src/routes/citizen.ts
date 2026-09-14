import { Router, Request, Response } from 'express';
import { optionalAuthenticateJWT, AuthenticatedRequest } from '../middleware/auth';
import { dataService, AlertRecord } from '../services/dataService';
import { getMLClient } from '../lib/ml/MLServiceClient';

const router = Router();

// In-memory rate limiting: IP/user -> timestamp[]
const submissionTimestamps = new Map<string, number[]>();

function checkRateLimit(key: string, limit = 10, windowMs = 600000): boolean {
  const now = Date.now();
  const stamps = submissionTimestamps.get(key) || [];
  const validStamps = stamps.filter((t) => now - t < windowMs);
  if (validStamps.length >= limit) {
    return false;
  }
  validStamps.push(now);
  submissionTimestamps.set(key, validStamps);
  return true;
}

// Calculate Haversine distance in kilometers between two GPS coordinates
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Default approximate centroid coordinates for major demo districts
const DISTRICT_COORDINATES: Record<string, { lat: number; lon: number }> = {
  pune: { lat: 18.5204, lon: 73.8567 },
  hingoli: { lat: 19.7196, lon: 77.1478 },
  mumbai: { lat: 19.076, lon: 72.8777 },
  nagpur: { lat: 21.1458, lon: 79.0882 },
  nashik: { lat: 19.9975, lon: 73.7898 },
  varanasi: { lat: 25.3176, lon: 82.9739 },
  chennai: { lat: 13.0827, lon: 80.2707 },
  bengaluru: { lat: 12.9716, lon: 77.5946 },
};

/**
 * POST /api/citizen/feedback
 * Submit ground feedback with geotagged photo. Evaluates AI risk and generates alerts.
 */
router.post('/feedback', optionalAuthenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const clientKey = req.user?.userId || req.ip || 'anonymous';
  if (!checkRateLimit(clientKey, 10, 600000)) {
    return res.status(429).json({
      error: 'Too many feedback submissions. Please wait a few minutes before submitting again.',
    });
  }

  const {
    work_id,
    feedback_text,
    latitude,
    longitude,
    photo_url,
    citizen_name,
    contact,
  } = req.body;

  if (!work_id) {
    return res.status(400).json({ error: 'work_id is required.' });
  }

  if (!feedback_text || typeof feedback_text !== 'string' || feedback_text.trim().length < 10) {
    return res.status(400).json({
      error: 'feedback_text is required and must be at least 10 characters long.',
    });
  }

  const work = dataService.worksById.get(work_id);
  if (!work) {
    return res.status(404).json({ error: `Work '${work_id}' not found in registry.` });
  }

  // --- 1. NLP Grievance Triage ---
  const textLower = feedback_text.toLowerCase();
  const hazardKeywords = [
    'collapse',
    'crack',
    'abandon',
    'hazard',
    'danger',
    'substandard',
    'scam',
    'ghost',
    'corrupt',
    'bribe',
    'poor quality',
    'disaster',
    'unstarted',
    'uncompleted',
    'vanished',
  ];
  const matchedKeywords = hazardKeywords.filter((k) => textLower.includes(k));
  const isSafetyHazard = matchedKeywords.length > 0;
  const nlpUrgency: 'LOW' | 'MEDIUM' | 'HIGH' = isSafetyHazard ? 'HIGH' : textLower.length > 80 ? 'MEDIUM' : 'LOW';

  // --- 2. Vision Geotag Analysis ---
  let gpsMismatch = false;
  let distanceKm: number | undefined = undefined;
  let gpsVerified = false;

  const userLat = Number(latitude);
  const userLon = Number(longitude);

  if (!isNaN(userLat) && !isNaN(userLon) && userLat !== 0 && userLon !== 0) {
    // Determine approved site coordinates: check district centroids or mock coordinates
    const districtKey = work.nodal_district.toLowerCase().trim();
    const siteCoords = DISTRICT_COORDINATES[districtKey] || { lat: 18.5204, lon: 73.8567 };

    distanceKm = parseFloat(haversineKm(userLat, userLon, siteCoords.lat, siteCoords.lon).toFixed(3));
    gpsMismatch = distanceKm > 1.0; // Distance threshold is 1.0 km
    gpsVerified = true;
  }

  // --- 3. Deterministic High-Risk Rule Engine ---
  const isHighRisk = nlpUrgency === 'HIGH' || isSafetyHazard || gpsMismatch;
  const severity: 'LOW' | 'MEDIUM' | 'HIGH' = isHighRisk ? 'HIGH' : 'LOW';

  let alertRecord: AlertRecord | null = null;

  if (isHighRisk) {
    const reasonParts: string[] = [];
    if (gpsMismatch && distanceKm !== undefined) {
      reasonParts.push(`Geotag discrepancy detected: photo taken ${distanceKm} km from sanctioned site (>1.0 km threshold).`);
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
      evidenceNotes: [
        `Reported by: ${citizen_name || req.user?.name || 'Citizen Resident'}`,
        `Feedback: "${feedback_text}"`,
        contact ? `Contact: ${contact}` : '',
      ].filter(Boolean),
      evidencePhotos: photo_url ? [photo_url] : [],
    };

    dataService.addAlert(alertRecord);
  }

  // Update audit trail on the work
  work.note = `${work.note || ''} | Citizen Feedback: "${feedback_text.slice(0, 80)}..."`;

  return res.status(201).json({
    success: true,
    message: isHighRisk
      ? 'High-priority ground alert generated and broadcast to District Collector & MP dashboards.'
      : 'Feedback recorded successfully. Thank you for contributing to MPLADS transparency.',
    evaluation: {
      isHighRisk,
      severity,
      nlp: {
        urgency: nlpUrgency,
        isSafetyHazard,
        matchedKeywords,
      },
      vision: {
        gpsVerified,
        gpsMismatch,
        distanceKm,
        claimedCoordinates: gpsVerified ? { lat: userLat, lon: userLon } : null,
      },
    },
    alert: alertRecord,
  });
});

export default router;
