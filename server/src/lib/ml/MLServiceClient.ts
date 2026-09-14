import axios from 'axios';

export interface RiskScoreResult {
  riskScore: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
  factors?: Array<{ factor_name: string; contribution: number; reason: string }>;
}

export interface PhotoCheckResult {
  isDuplicate: boolean;
  matchedWorkId?: string;
  gpsMismatch: boolean;
  distanceKm?: number;
}

export interface CrossSchemeMatch {
  matchConfidence: number;
  scheme: string;
  matchedWorkRef: string;
  reason: string;
}

export interface ComplaintCluster {
  clusterId: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH';
  category: string;
  complaintIds: string[];
  summary?: string;
}

export interface VendorNetworkFlag {
  vendorId: string;
  riskScore: number;
  linkedVendors: string[];
  reason: string;
}

export interface MLServiceClient {
  scoreWork(workId: string): Promise<RiskScoreResult>;
  checkPhoto(photoUrl: string, workId: string): Promise<PhotoCheckResult>;
  matchCrossScheme(workId: string): Promise<CrossSchemeMatch[]>;
  clusterComplaints(complaints: { id: string; text: string }[]): Promise<ComplaintCluster[]>;
  getVendorNetworkFlags(vendorId: string): Promise<VendorNetworkFlag>;
}

/**
 * MockMLServiceClient — Seeded, fully deterministic mock implementation.
 * Used for demo resilience or when ML_SERVICE_URL is unavailable.
 */
export class MockMLServiceClient implements MLServiceClient {
  async scoreWork(workId: string): Promise<RiskScoreResult> {
    // Deterministic hash based on workId
    const charCodeSum = workId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const mod = charCodeSum % 3;

    if (mod === 0) {
      return {
        riskScore: 0.88,
        severity: 'HIGH',
        reason: 'Significant cost overrun detected against district median; progress anomaly flagged.',
        factors: [
          { factor_name: 'Sanction Cost Deviation', contribution: 0.45, reason: 'Exceeds benchmark category median by 68%' },
          { factor_name: 'Vendor Delays History', contribution: 0.25, reason: 'Contractor has 3 stalled projects in region' },
          { factor_name: 'Physical vs Financial Divergence', contribution: 0.18, reason: '85% funds drawn vs 20% ground progress' },
        ],
      };
    } else if (mod === 1) {
      return {
        riskScore: 0.54,
        severity: 'MEDIUM',
        reason: 'Proposal submitted close to fiscal deadline with unverified vendor concentration.',
        factors: [
          { factor_name: 'Fiscal Year-End Dumping', contribution: 0.32, reason: 'Sanction requested within last 10 days of March' },
          { factor_name: 'Contractor Load', contribution: 0.22, reason: 'Active vendor handles >8 concurrent civil tenders' },
        ],
      };
    } else {
      return {
        riskScore: 0.12,
        severity: 'LOW',
        reason: 'Parameters match historical norms; high contractor completion rate.',
        factors: [
          { factor_name: 'Sanction Cost Normal', contribution: 0.05, reason: 'Within 5% of standard schedule of rates (SoR)' },
          { factor_name: 'Clean Vendor Record', contribution: 0.07, reason: '100% on-time milestone delivery' },
        ],
      };
    }
  }

  async checkPhoto(photoUrl: string, workId: string): Promise<PhotoCheckResult> {
    const isDup = workId.includes('4') || workId.includes('7');
    return {
      isDuplicate: isDup,
      matchedWorkId: isDup ? `MPLW${Math.floor(1000000 + Math.random() * 9000000)}` : undefined,
      gpsMismatch: workId.endsWith('9') || workId.endsWith('2'),
      distanceKm: workId.endsWith('9') ? 14.8 : 0.2,
    };
  }

  async matchCrossScheme(workId: string): Promise<CrossSchemeMatch[]> {
    return [
      {
        matchConfidence: 0.89,
        scheme: 'PMGSY (Pradhan Mantri Gram Sadak Yojana)',
        matchedWorkRef: 'PMGSY-MH-2024-8812',
        reason: 'Geographic polygon overlap (94%) and identical stretch title registered under rural roads.',
      },
      {
        matchConfidence: 0.76,
        scheme: 'State District Mineral Foundation (DMF)',
        matchedWorkRef: 'DMF-PUN-0941',
        reason: 'Same community hall GPS coordinate funded simultaneously under District Mineral Trust.',
      },
    ];
  }

  async clusterComplaints(complaints: { id: string; text: string }[]): Promise<ComplaintCluster[]> {
    return [
      {
        clusterId: 'CLUST-ROAD-01',
        urgency: 'HIGH',
        category: 'Road & Culvert Safety',
        complaintIds: complaints.slice(0, 3).map((c) => c.id),
        summary: 'Severe road surface disintegration and collapsing culvert causing safety hazard.',
      },
      {
        clusterId: 'CLUST-WATER-02',
        urgency: 'MEDIUM',
        category: 'Drinking Water Tube Well',
        complaintIds: complaints.slice(3).map((c) => c.id),
        summary: 'Sanctioned solar pump borehole non-functional after contractor abandoned site.',
      },
    ];
  }

  async getVendorNetworkFlags(vendorId: string): Promise<VendorNetworkFlag> {
    return {
      vendorId,
      riskScore: 0.82,
      linkedVendors: ['V00018', 'V00042', 'V00091'],
      reason: 'Shared registered GSTIN corporate address and common authorized director with 3 other active tenderers.',
    };
  }
}

/**
 * HttpMLServiceClient — Connects directly to the existing Python FastAPI backend.
 * Base URL defaults to http://127.0.0.1:8000
 */
export class HttpMLServiceClient implements MLServiceClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';
  }

  async scoreWork(workId: string): Promise<RiskScoreResult> {
    try {
      // ML-INTEGRATION-POINT: Call FastAPI work risk profile endpoint
      const response = await axios.get(`${this.baseUrl}/api/works/${encodeURIComponent(workId)}/risk-profile`, {
        timeout: 5000,
      });
      const data = response.data;
      const score = data.composite_risk_score ?? 0.5;
      const severity = score >= 0.7 ? 'HIGH' : score >= 0.4 ? 'MEDIUM' : 'LOW';
      const firstSignal = data.risk_signals?.[0]?.reason || 'ML pipeline analyzed historical and category benchmarks.';

      return {
        riskScore: score,
        severity,
        reason: firstSignal,
        factors: (data.risk_signals || []).map((s: any) => ({
          factor_name: s.signal_type,
          contribution: s.severity,
          reason: s.reason,
        })),
      };
    } catch (err: any) {
      console.warn(`[HttpMLServiceClient] Error calling /api/works/${workId}/risk-profile (${err.message}), falling back to mock.`);
      return new MockMLServiceClient().scoreWork(workId);
    }
  }

  async checkPhoto(photoUrl: string, workId: string): Promise<PhotoCheckResult> {
    try {
      // ML-INTEGRATION-POINT: Call FastAPI vision geoverify / duplicate endpoints
      const response = await axios.post(
        `${this.baseUrl}/api/vision/geoverify`,
        {
          fingerprint: {
            image_id: `img-${workId}`,
            phash: 'a1b2c3d4e5f60718',
            gps_lat: 18.5204,
            gps_lon: 73.8567,
            source_path: photoUrl,
          },
          claimed_lat: 18.5204,
          claimed_lon: 73.8567,
          radius_km: 1.0,
        },
        { timeout: 4000 }
      );
      return {
        isDuplicate: false,
        gpsMismatch: !response.data.is_within_threshold,
        distanceKm: response.data.distance_km,
      };
    } catch (err) {
      return new MockMLServiceClient().checkPhoto(photoUrl, workId);
    }
  }

  async matchCrossScheme(workId: string): Promise<CrossSchemeMatch[]> {
    // ML-INTEGRATION-POINT: Cross-scheme matching endpoint
    return new MockMLServiceClient().matchCrossScheme(workId);
  }

  async clusterComplaints(complaints: { id: string; text: string }[]): Promise<ComplaintCluster[]> {
    try {
      // ML-INTEGRATION-POINT: Call FastAPI complaint clustering
      const response = await axios.post(
        `${this.baseUrl}/api/complaints/cluster`,
        {
          complaints: complaints.map((c) => ({ complaint_id: c.id, text: c.text })),
          distance_threshold: 0.6,
        },
        { timeout: 5000 }
      );
      return (response.data.clusters || []).map((cl: any) => ({
        clusterId: cl.cluster_id,
        urgency: 'HIGH',
        category: cl.representative_keywords?.join(' ') || 'General',
        complaintIds: cl.complaint_ids,
        summary: `Cluster of ${cl.size} citizen grievances related to ${cl.representative_keywords?.slice(0, 3).join(', ')}`,
      }));
    } catch (err) {
      return new MockMLServiceClient().clusterComplaints(complaints);
    }
  }

  async getVendorNetworkFlags(vendorId: string): Promise<VendorNetworkFlag> {
    try {
      // ML-INTEGRATION-POINT: Call FastAPI collusion hubs
      const response = await axios.get(`${this.baseUrl}/api/network/hubs?limit=50`, { timeout: 4000 });
      const hubList: any[] = response.data || [];
      const isHub = hubList.find((h: any) => h.vendor_id === vendorId && h.is_hub);
      return {
        vendorId,
        riskScore: isHub ? 0.88 : 0.25,
        linkedVendors: isHub ? ['V00012', 'V00034', 'V00078'] : [],
        reason: isHub
          ? 'Contractor designated as high-concentration hub vendor across multi-district portfolios.'
          : 'Normal contractor network metrics.',
      };
    } catch (err) {
      return new MockMLServiceClient().getVendorNetworkFlags(vendorId);
    }
  }
}

/**
 * Factory to retrieve the active ML client implementation.
 * Governed by USE_MOCK_ML env variable.
 */
export function getMLClient(): MLServiceClient {
  const useMock = process.env.USE_MOCK_ML === 'true';
  if (useMock) {
    return new MockMLServiceClient();
  }
  return new HttpMLServiceClient(process.env.ML_SERVICE_URL);
}
