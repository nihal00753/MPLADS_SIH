/**
 * Shared mock data and utility functions for Vercel serverless demo mode.
 * Replicates the Express backend's dataService for standalone deployment.
 */

// ─── Demo Users ───
export const DEMO_USERS = [
  { userId: 'usr-mp-01', email: 'mp@mplads.gov.in', password: 'admin', role: 'MP' as const, scopeId: 'HINGOLI', name: 'Shri Aashtikar Patil Nagesh Bapurao', language: 'en' },
  { userId: 'usr-mp-02', email: 'mp.pune@mplads.gov.in', password: 'admin', role: 'MP' as const, scopeId: 'PUNE', name: 'Smt. Medha Kulkarni', language: 'en' },
  { userId: 'usr-district-01', email: 'district@mplads.gov.in', password: 'admin', role: 'DISTRICT' as const, scopeId: 'Pune', name: 'Dr. Rajesh Deshmukh, IAS (District Collector)', language: 'en' },
  { userId: 'usr-state-01', email: 'state@mplads.gov.in', password: 'admin', role: 'STATE' as const, scopeId: 'Maharashtra', name: 'Shri Vikram Kumar, IAS (State Nodal Officer)', language: 'en' },
  { userId: 'usr-ministry-01', email: 'ministry@mplads.gov.in', password: 'admin', role: 'MINISTRY' as const, scopeId: null, name: 'Dr. Saurabh Garg, IAS (Secretary, MoSPI)', language: 'en' },
  { userId: 'usr-citizen-01', email: 'citizen@mplads.gov.in', password: 'admin', role: 'CITIZEN' as const, scopeId: 'Pune', name: 'Citizen / Resident (Pune District)', language: 'en' },
];

export type DemoUser = typeof DEMO_USERS[number];

// ─── Redirect map ───
export const REDIRECT_MAP: Record<string, string> = {
  MP: '/dashboard/mp',
  DISTRICT: '/dashboard/district',
  STATE: '/dashboard/state',
  MINISTRY: '/dashboard/ministry',
  CITIZEN: '/dashboard/citizen',
};

// ─── Minimal JWT for demo (base64 encoded, NOT secure — demo only) ───
export function createDemoToken(user: DemoUser): string {
  const payload = {
    userId: user.userId,
    email: user.email,
    role: user.role,
    scopeId: user.scopeId,
    name: user.name,
    language: user.language || 'en',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  };
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' }), 'utf-8').toString('base64');
  const body = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64');
  return `${header}.${body}.demo`;
}

export function decodeDemoToken(token: string): DemoUser | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload as DemoUser;
  } catch {
    return null;
  }
}

export function getUserFromRequest(req: Request): DemoUser | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return decodeDemoToken(authHeader.slice(7));
}

// ─── Mock Works Data ───
export interface MockWork {
  unique_work_number: string;
  state: string;
  nodal_district: string;
  implementing_district: string;
  mp_name: string;
  constituency: string;
  work_category: string;
  work_name: string;
  sanction_amount: number;
  work_status: string;
  physical_progress_pct: number;
  financial_progress_pct: number;
  vendor_id: string;
  vendor_name: string;
  implementing_agency_name: string;
  is_anomaly: boolean;
  anomaly_type: string;
  category_benchmark_min: number;
  category_benchmark_max: number;
  date_of_receipt_of_work_proposal_from_mp: string;
  date_of_administrative_approval: string;
  note: string;
}

function generateMockWorks(): MockWork[] {
  const categories = [
    'Community Hall Construction', 'CC Road Construction', 'School Additional Classroom',
    'Public Toilet Complex', 'Solar Street Light Installation', 'Library Building',
    'Handpump / Borewell Installation', 'Minor Bridge / Culvert', 'Sports Ground Development',
    'RO Drinking Water Plant', 'Anganwadi Centre Construction', 'Crematorium / Community Facility',
  ];
  const statuses = ['Completed', 'Work in Progress', 'Sanctioned', 'Stalled', 'Payment Released', 'Recommended'];
  const vendors = [
    { id: 'V00073', name: 'Laxmi Infra & Co' },
    { id: 'V00075', name: 'New Projects' },
    { id: 'V00078', name: 'Vishwakarma Construction Corporation' },
    { id: 'V00080', name: 'Shree Projects Corporation' },
    { id: 'V00081', name: 'Om Construction & Co' },
    { id: 'V00083', name: 'Shri Projects Corporation' },
    { id: 'V00085', name: 'Shri Associates & Co' },
    { id: 'V00088', name: 'United Builders Corporation' },
  ];
  const agencies = [
    'Zilla Parishad, Pune', 'PWD Division, Pune', 'Municipal Corporation, Pune',
    'Block Development Office, Pune', 'Gram Panchayat, Pune', 'Nagar Panchayat, Pune',
  ];
  const districts = [
    { district: 'Pune', state: 'Maharashtra', mp: 'Smt. Medha Kulkarni', constituency: 'PUNE' },
    { district: 'Hingoli', state: 'Maharashtra', mp: 'Shri Aashtikar Patil', constituency: 'HINGOLI' },
    { district: 'Nashik', state: 'Maharashtra', mp: 'Shri Hemant Godse', constituency: 'NASHIK' },
  ];

  const works: MockWork[] = [];
  for (let i = 0; i < 100; i++) {
    const cat = categories[i % categories.length];
    const status = statuses[i % statuses.length];
    const vendor = vendors[i % vendors.length];
    const loc = districts[i % districts.length];
    const amount = Math.round((300000 + Math.random() * 4700000));
    const physPct = status === 'Completed' ? 95 + Math.random() * 5 :
                    status === 'Work in Progress' ? 20 + Math.random() * 60 :
                    status === 'Stalled' ? 10 + Math.random() * 30 : 0;
    const finPct = status === 'Completed' ? 90 + Math.random() * 10 :
                   status === 'Work in Progress' ? 15 + Math.random() * 55 :
                   status === 'Stalled' ? 5 + Math.random() * 25 : 0;
    const isAnomaly = i % 7 === 0;

    works.push({
      unique_work_number: `MPLW${String(i + 1).padStart(6, '0')}`,
      state: loc.state,
      nodal_district: loc.district,
      implementing_district: loc.district,
      mp_name: loc.mp,
      constituency: loc.constituency,
      work_category: cat,
      work_name: `${cat} - ${loc.district}`,
      sanction_amount: amount,
      work_status: status,
      physical_progress_pct: parseFloat(physPct.toFixed(1)),
      financial_progress_pct: parseFloat(finPct.toFixed(1)),
      vendor_id: vendor.id,
      vendor_name: vendor.name,
      implementing_agency_name: agencies[i % agencies.length],
      is_anomaly: isAnomaly,
      anomaly_type: isAnomaly ? ['split_invoicing', 'cost_overrun', 'duplicate_work', 'fund_dumping_year_end'][i % 4] : '',
      category_benchmark_min: Math.round(amount * 0.75),
      category_benchmark_max: Math.round(amount * 1.3),
      date_of_receipt_of_work_proposal_from_mp: '2024-06-15',
      date_of_administrative_approval: '2024-07-02',
      note: '',
    });
  }
  return works;
}

export const MOCK_WORKS = generateMockWorks();

// ─── Mock Alerts ───
export interface MockAlert {
  id: string;
  workId: string;
  workTitle: string;
  workCategory: string;
  district: string;
  state: string;
  mpName: string;
  sanctionAmount: number;
  spentAmount: number;
  riskScore: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
  source: string;
  status: string;
  slaDeadline: string;
  createdAt: string;
  vendorId: string;
  vendorName: string;
}

function generateMockAlerts(): MockAlert[] {
  const anomalousWorks = MOCK_WORKS.filter(w => w.is_anomaly);
  const reasons = [
    'Physical-financial progress divergence exceeds 30% threshold.',
    'Split-invoicing detected: 3 sub-₹25L works sanctioned within 14 days to same vendor.',
    'Cost overrun: sanctioned amount exceeds district category benchmark by 42%.',
    'Duplicate work detected: identical specification submitted across two agencies.',
    'Geotag verification failed: progress photos GPS coordinates 4.2 km from site.',
    'Vendor concentration: single contractor holds 68% of district civil works.',
    'Year-end fund dumping: 5 works sanctioned in final 10 days of fiscal year.',
  ];

  return anomalousWorks.map((w, i) => ({
    id: `ALT-${String(i + 1).padStart(4, '0')}`,
    workId: w.unique_work_number,
    workTitle: w.work_name,
    workCategory: w.work_category,
    district: w.nodal_district,
    state: w.state,
    mpName: w.mp_name,
    sanctionAmount: w.sanction_amount,
    spentAmount: Math.round(w.sanction_amount * (w.financial_progress_pct / 100)),
    riskScore: parseFloat((0.65 + Math.random() * 0.3).toFixed(2)),
    severity: (i % 3 === 0 ? 'HIGH' : i % 3 === 1 ? 'MEDIUM' : 'HIGH') as 'HIGH' | 'MEDIUM',
    reason: reasons[i % reasons.length],
    source: i % 5 === 0 ? 'CITIZEN_REPORTED' : 'AI_FLAGGED',
    status: i % 4 === 0 ? 'ESCALATED' : 'OPEN',
    slaDeadline: new Date(Date.now() + (24 + i * 12) * 3600000).toISOString(),
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    vendorId: w.vendor_id,
    vendorName: w.vendor_name,
  }));
}

export const MOCK_ALERTS = generateMockAlerts();

// ─── Scoped data helpers ───
export function getScopedWorks(user: DemoUser): MockWork[] {
  if (user.role === 'MINISTRY') return MOCK_WORKS;
  if (user.role === 'STATE') return MOCK_WORKS.filter(w => w.state === (user.scopeId || 'Maharashtra'));
  if (user.role === 'MP') return MOCK_WORKS.filter(w => w.constituency?.toLowerCase() === (user.scopeId || '').toLowerCase());
  if (user.role === 'DISTRICT') return MOCK_WORKS.filter(w => w.nodal_district?.toLowerCase() === (user.scopeId || '').toLowerCase());
  if (user.role === 'CITIZEN') return MOCK_WORKS.filter(w => w.nodal_district?.toLowerCase() === (user.scopeId || '').toLowerCase());
  return MOCK_WORKS;
}

export function getScopedAlerts(user: DemoUser): MockAlert[] {
  if (user.role === 'MINISTRY') return MOCK_ALERTS;
  if (user.role === 'STATE') return MOCK_ALERTS.filter(a => a.state === (user.scopeId || 'Maharashtra'));
  if (user.role === 'MP') {
    const works = getScopedWorks(user);
    const workIds = new Set(works.map(w => w.unique_work_number));
    return MOCK_ALERTS.filter(a => workIds.has(a.workId));
  }
  if (user.role === 'DISTRICT' || user.role === 'CITIZEN') {
    return MOCK_ALERTS.filter(a => a.district?.toLowerCase() === (user.scopeId || '').toLowerCase());
  }
  return MOCK_ALERTS;
}

// ─── Mock Notifications ───
export interface MockNotification {
  id: string;
  userId: string;
  role: string;
  scopeId: string | null;
  type: 'NEW_ALERT' | 'SLA_WARNING' | 'ESCALATED' | 'DIGEST';
  message: string;
  workId?: string;
  read: boolean;
  createdAt: string;
}

export const MOCK_NOTIFICATIONS: MockNotification[] = [
  {
    id: 'notif-01',
    userId: 'usr-district-01',
    role: 'DISTRICT',
    scopeId: 'Pune',
    type: 'NEW_ALERT',
    message: 'High Risk Alert: Physical-financial divergence detected in MPLW000007',
    workId: 'MPLW000007',
    read: false,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'notif-02',
    userId: 'usr-district-01',
    role: 'DISTRICT',
    scopeId: 'Pune',
    type: 'SLA_WARNING',
    message: 'SLA Notice: Alert ALT-0001 requires Collector decision within 18 hours',
    workId: 'MPLW000001',
    read: false,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: 'notif-03',
    userId: 'usr-mp-01',
    role: 'MP',
    scopeId: 'HINGOLI',
    type: 'DIGEST',
    message: 'Weekly Summary: 3 works approved, 0 anomalies flagged this cycle',
    read: false,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'notif-04',
    userId: 'usr-ministry-01',
    role: 'MINISTRY',
    scopeId: null,
    type: 'ESCALATED',
    message: 'National Escalation: Potential contractor cartel flagged across 3 districts',
    read: false,
    createdAt: new Date(Date.now() - 14400000).toISOString(),
  },
];

export function getScopedNotifications(user: DemoUser | null): { unreadCount: number; notifications: MockNotification[] } {
  if (!user) {
    return {
      unreadCount: MOCK_NOTIFICATIONS.filter(n => !n.read).length,
      notifications: MOCK_NOTIFICATIONS.slice(0, 30),
    };
  }
  const filtered = MOCK_NOTIFICATIONS.filter(n => {
    if (user.role === 'MINISTRY') return true;
    if (n.userId === user.userId) return true;
    if (n.role === user.role && (!n.scopeId || n.scopeId.toLowerCase() === (user.scopeId || '').toLowerCase())) {
      return true;
    }
    return false;
  });
  return {
    unreadCount: filtered.filter(n => !n.read).length,
    notifications: filtered.slice(0, 30),
  };
}

