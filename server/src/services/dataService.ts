import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { AuthUser } from '../middleware/auth';

export interface WorkRecord {
  unique_work_number: string;
  state: string;
  nodal_district: string;
  implementing_district: string;
  house_name: string;
  member_type: string;
  mp_name: string;
  constituency: string;
  work_category: string;
  work_name: string;
  sanction_amount: number;
  date_of_receipt_of_work_proposal_from_mp: string;
  date_of_administrative_approval: string;
  implementing_agency_name: string;
  vendor_id: string;
  vendor_name: string;
  work_status: string;
  physical_progress_pct: number;
  financial_progress_pct: number;
  category_benchmark_min: number;
  category_benchmark_max: number;
  is_anomaly: boolean;
  anomaly_type: string;
  unit: string;
  note: string;
}

export interface AlertRecord {
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
  source: 'AI_FLAGGED' | 'CITIZEN_REPORTED';
  status: 'OPEN' | 'ACTIONED' | 'ESCALATED' | 'DISMISSED';
  dismissReason?: string;
  slaDeadline: string; // ISO string
  createdAt: string;
  vendorId: string;
  vendorName: string;
  evidenceNotes?: string[];
  evidencePhotos?: string[];
}

export interface AuditLogRecord {
  id: string;
  alertId: string;
  actorId: string;
  actorName: string;
  action: string;
  note?: string;
  createdAt: string;
}

export interface NotificationRecord {
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

// Simple robust CSV line splitter handling quoted strings
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

class DataService {
  public works: WorkRecord[] = [];
  public worksById: Map<string, WorkRecord> = new Map();
  public vendors: any[] = [];
  public mps: any[] = [];
  public alerts: AlertRecord[] = [];
  public auditLogs: AuditLogRecord[] = [];
  public notifications: NotificationRecord[] = [];
  public users: Map<string, any> = new Map();

  private initialized = false;

  constructor() {
    this.setupDemoUsers();
  }

  private setupDemoUsers() {
    // 4 Primary Demo Personas
    const demoUsers = [
      {
        userId: 'usr-mp-01',
        email: 'mp@mplads.gov.in',
        password: 'admin',
        role: 'MP' as const,
        scopeId: 'HINGOLI',
        name: 'Shri Aashtikar Patil Nagesh Bapurao',
        language: 'en',
      },
      {
        userId: 'usr-mp-02',
        email: 'mp.pune@mplads.gov.in',
        password: 'admin',
        role: 'MP' as const,
        scopeId: 'PUNE',
        name: 'Smt. Medha Kulkarni',
        language: 'en',
      },
      {
        userId: 'usr-district-01',
        email: 'district@mplads.gov.in',
        password: 'admin',
        role: 'DISTRICT' as const,
        scopeId: 'Pune',
        name: 'Dr. Rajesh Deshmukh, IAS (District Collector)',
        language: 'en',
      },
      {
        userId: 'usr-state-01',
        email: 'state@mplads.gov.in',
        password: 'admin',
        role: 'STATE' as const,
        scopeId: 'Maharashtra',
        name: 'Shri Vikram Kumar, IAS (State Nodal Officer)',
        language: 'en',
      },
      {
        userId: 'usr-ministry-01',
        email: 'ministry@mplads.gov.in',
        password: 'admin',
        role: 'MINISTRY' as const,
        scopeId: null,
        name: 'Dr. Saurabh Garg, IAS (Secretary, MoSPI)',
        language: 'en',
      },
      {
        userId: 'usr-citizen-01',
        email: 'citizen@mplads.gov.in',
        password: 'admin',
        role: 'CITIZEN' as const,
        scopeId: 'Pune',
        name: 'Citizen / Resident (Pune District)',
        language: 'en',
      },
    ];

    demoUsers.forEach((u) => {
      this.users.set(u.email.toLowerCase(), u);
    });
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    // Locate test_data directory reliably
    let dataDir = path.resolve(process.cwd(), '../test_data');
    if (!fs.existsSync(dataDir)) {
      dataDir = path.resolve(process.cwd(), 'test_data');
    }
    if (!fs.existsSync(dataDir)) {
      dataDir = path.resolve(__dirname, '../../../test_data');
    }
    if (!fs.existsSync(dataDir)) {
      dataDir = 'd:\\MPLADS AIML\\test_data';
    }
    const worksFile = path.join(dataDir, 'mplads_synthetic_works.csv');
    const vendorsFile = path.join(dataDir, 'mplads_synthetic_vendors.csv');
    const mpFile = path.join(dataDir, 'mplads_mp_master_real.csv');

    console.log(`[DataService] Loading datasets from ${dataDir}...`);

    if (fs.existsSync(worksFile)) {
      await new Promise<void>((resolve) => {
        const fileStream = fs.createReadStream(worksFile);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        let headers: string[] = [];
        let isFirst = true;

        rl.on('line', (line) => {
          if (!line.trim()) return;
          const parsed = parseCsvLine(line);
          if (isFirst) {
            headers = parsed;
            isFirst = false;
          } else {
            const row: Record<string, string> = {};
            headers.forEach((h, idx) => {
              row[h] = parsed[idx] || '';
            });

            const w: WorkRecord = {
              unique_work_number: row.unique_work_number || '',
              state: row.state || '',
              nodal_district: row.nodal_district || '',
              implementing_district: row.implementing_district || '',
              house_name: row.house_name || '',
              member_type: row.member_type || '',
              mp_name: row.mp_name || '',
              constituency: row.constituency || '',
              work_category: row.work_category || '',
              work_name: row.work_name || '',
              sanction_amount: parseFloat(row.sanction_amount) || 0,
              date_of_receipt_of_work_proposal_from_mp: row.date_of_receipt_of_work_proposal_from_mp || '',
              date_of_administrative_approval: row.date_of_administrative_approval || '',
              implementing_agency_name: row.implementing_agency_name || '',
              vendor_id: row.vendor_id || '',
              vendor_name: row.vendor_name || '',
              work_status: row.work_status || '',
              physical_progress_pct: parseFloat(row.physical_progress_pct) || 0,
              financial_progress_pct: parseFloat(row.financial_progress_pct) || 0,
              category_benchmark_min: parseFloat(row.category_benchmark_min) || 0,
              category_benchmark_max: parseFloat(row.category_benchmark_max) || 0,
              is_anomaly: row.is_anomaly === '1',
              anomaly_type: row.anomaly_type || '',
              unit: row.unit || '',
              note: row.note || '',
            };
            this.works.push(w);
            this.worksById.set(w.unique_work_number, w);
          }
        });

        rl.on('close', () => resolve());
      });
    }

    if (fs.existsSync(vendorsFile)) {
      await new Promise<void>((resolve) => {
        const fileStream = fs.createReadStream(vendorsFile);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        let headers: string[] = [];
        let isFirst = true;

        rl.on('line', (line) => {
          if (!line.trim()) return;
          const parsed = parseCsvLine(line);
          if (isFirst) {
            headers = parsed;
            isFirst = false;
          } else {
            const row: Record<string, string> = {};
            headers.forEach((h, idx) => {
              row[h] = parsed[idx] || '';
            });
            this.vendors.push(row);
          }
        });

        rl.on('close', () => resolve());
      });
    }

    if (fs.existsSync(mpFile)) {
      await new Promise<void>((resolve) => {
        const fileStream = fs.createReadStream(mpFile);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        let headers: string[] = [];
        let isFirst = true;

        rl.on('line', (line) => {
          if (!line.trim()) return;
          const parsed = parseCsvLine(line);
          if (isFirst) {
            headers = parsed;
            isFirst = false;
          } else {
            const row: Record<string, string> = {};
            headers.forEach((h, idx) => {
              row[h] = parsed[idx] || '';
            });
            this.mps.push(row);
          }
        });

        rl.on('close', () => resolve());
      });
    }

    console.log(`[DataService] Loaded ${this.works.length} works, ${this.vendors.length} vendors, ${this.mps.length} MPs.`);

    // Generate initial live alerts from anomalous works
    this.generateInitialAlerts();
    this.initialized = true;
  }

  private generateInitialAlerts() {
    const anomalousWorks = this.works.filter((w) => w.is_anomaly);
    const now = new Date();

    anomalousWorks.slice(0, 150).forEach((w, idx) => {
      // SLA deadline between 6 hours and 5 days from now
      const hoursRemaining = idx % 5 === 0 ? 12 : idx % 3 === 0 ? 22 : 48 + (idx % 4) * 24;
      const slaDeadline = new Date(now.getTime() + hoursRemaining * 3600 * 1000).toISOString();

      let reason = 'AI-Flagged pattern: ';
      if (w.anomaly_type.includes('split_invoicing')) {
        reason += 'Sequential sanctions under ₹25L threshold detected within 14 days to evade e-tender scrutiny.';
      } else if (w.anomaly_type.includes('ghost_project')) {
        reason += 'Severe physical vs financial discrepancy: 85% expenditure disbursed with 0% ground progress.';
      } else if (w.anomaly_type.includes('cost_overrun')) {
        reason += `Sanctioned amount ₹${(w.sanction_amount / 100000).toFixed(1)} Lakh exceeds category benchmark maximum by >40%.`;
      } else if (w.anomaly_type.includes('fund_dumping')) {
        reason += 'Year-end fund dumping: proposal received and cleared in last 72 hours of FY.';
      } else {
        reason += 'Duplicate work site registration detected across overlapping municipal ward polygon.';
      }

      const isCitizen = idx % 4 === 1;
      const riskScore = isCitizen ? 0.72 : 0.85 + (idx % 15) * 0.01;
      const severity: 'LOW' | 'MEDIUM' | 'HIGH' = riskScore >= 0.8 ? 'HIGH' : riskScore >= 0.5 ? 'MEDIUM' : 'LOW';

      this.alerts.push({
        id: `ALT-${10000 + idx}`,
        workId: w.unique_work_number,
        workTitle: w.work_name || `MPLADS Civil Work #${w.unique_work_number}`,
        workCategory: w.work_category,
        district: w.nodal_district,
        state: w.state,
        mpName: w.mp_name,
        sanctionAmount: w.sanction_amount,
        spentAmount: Math.round(w.sanction_amount * (w.financial_progress_pct / 100)),
        riskScore: parseFloat(riskScore.toFixed(2)),
        severity,
        reason: isCitizen ? 'Citizen grievance via portal: Site unstarted despite sign-board claiming completion.' : reason,
        source: isCitizen ? 'CITIZEN_REPORTED' : 'AI_FLAGGED',
        status: idx % 10 === 0 ? 'ACTIONED' : idx % 12 === 0 ? 'ESCALATED' : 'OPEN',
        slaDeadline,
        createdAt: new Date(now.getTime() - (idx % 7) * 86400000).toISOString(),
        vendorId: w.vendor_id,
        vendorName: w.vendor_name,
        evidenceNotes: [
          'Initial ground survey flagged by field inspector.',
          'Invoice reconciliation pending administrative audit.',
        ],
        evidencePhotos: [
          'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=600&q=80',
          'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=600&q=80',
        ],
      });
    });

    // Create sample initial notifications
    this.notifications.push(
      {
        id: 'notif-01',
        userId: 'usr-district-01',
        role: 'DISTRICT',
        scopeId: 'Pune',
        type: 'SLA_WARNING',
        message: 'Alert ALT-10005 has under 12 hours remaining before mandatory State escalation.',
        workId: this.alerts[0]?.workId,
        read: false,
        createdAt: new Date(now.getTime() - 15 * 60000).toISOString(),
      },
      {
        id: 'notif-02',
        userId: 'usr-district-01',
        role: 'DISTRICT',
        scopeId: 'Pune',
        type: 'NEW_ALERT',
        message: 'New high-risk split-invoicing cluster detected in Haveli Taluka.',
        workId: this.alerts[1]?.workId,
        read: false,
        createdAt: new Date(now.getTime() - 45 * 60000).toISOString(),
      },
      {
        id: 'notif-03',
        userId: 'usr-ministry-01',
        role: 'MINISTRY',
        scopeId: null,
        type: 'DIGEST',
        message: 'Daily National Risk Digest: 14 new cross-scheme double-funding matches identified.',
        read: false,
        createdAt: new Date(now.getTime() - 120 * 60000).toISOString(),
      }
    );
  }

  public getScopedWorks(user: AuthUser): WorkRecord[] {
    if (user.role === 'MINISTRY') {
      return this.works;
    }
    if (user.role === 'STATE') {
      return this.works.filter((w) => w.state.toLowerCase() === (user.scopeId || '').toLowerCase());
    }
    if (user.role === 'DISTRICT') {
      const scope = (user.scopeId || '').toLowerCase();
      return this.works.filter(
        (w) => w.nodal_district.toLowerCase() === scope || w.implementing_district.toLowerCase() === scope
      );
    }
    if (user.role === 'MP') {
      const scope = (user.scopeId || '').toLowerCase();
      return this.works.filter(
        (w) => w.constituency.toLowerCase() === scope || w.mp_name.toLowerCase().includes(scope)
      );
    }
    if (user.role === 'CITIZEN') {
      const scope = (user.scopeId || '').toLowerCase();
      return this.works.filter(
        (w) => !scope || w.nodal_district.toLowerCase() === scope || w.implementing_district.toLowerCase() === scope
      );
    }
    return [];
  }

  public getScopedAlerts(user: AuthUser): AlertRecord[] {
    if (user.role === 'MINISTRY') {
      return this.alerts;
    }
    if (user.role === 'STATE') {
      return this.alerts.filter((a) => a.state.toLowerCase() === (user.scopeId || '').toLowerCase());
    }
    if (user.role === 'DISTRICT') {
      const scope = (user.scopeId || '').toLowerCase();
      return this.alerts.filter((a) => a.district.toLowerCase() === scope);
    }
    if (user.role === 'MP') {
      const scope = (user.scopeId || '').toLowerCase();
      const scopedWorkIds = new Set(this.getScopedWorks(user).map((w) => w.unique_work_number));
      return this.alerts.filter((a) => scopedWorkIds.has(a.workId));
    }
    if (user.role === 'CITIZEN') {
      const scope = (user.scopeId || '').toLowerCase();
      return this.alerts.filter((a) => !scope || a.district.toLowerCase() === scope);
    }
    return [];
  }

  public addWork(work: WorkRecord) {
    this.works.unshift(work);
    this.worksById.set(work.unique_work_number, work);
  }

  public updateWorkStatus(workId: string, status: string): WorkRecord | null {
    const work = this.worksById.get(workId);
    if (work) {
      work.work_status = status;
      return work;
    }
    return null;
  }

  public addAlert(alert: AlertRecord) {
    this.alerts.unshift(alert);
    this.notifications.unshift({
      id: `notif-${Date.now()}`,
      userId: 'district',
      role: 'DISTRICT',
      scopeId: alert.district,
      type: 'NEW_ALERT',
      message: `[Ground Alert] ${alert.reason.slice(0, 80)}... on ${alert.workTitle}`,
      workId: alert.workId,
      read: false,
      createdAt: new Date().toISOString(),
    });
  }

  public actionAlert(alertId: string, action: 'ACTION' | 'ESCALATE' | 'DISMISS', actor: AuthUser, note?: string, dismissReason?: string) {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (!alert) return null;

    if (action === 'ACTION') {
      alert.status = 'ACTIONED';
    } else if (action === 'ESCALATE') {
      alert.status = 'ESCALATED';
    } else if (action === 'DISMISS') {
      alert.status = 'DISMISSED';
      alert.dismissReason = dismissReason || 'Deemed non-actionable after ground inspection';
    }

    const log: AuditLogRecord = {
      id: `LOG-${Date.now()}`,
      alertId,
      actorId: actor.userId,
      actorName: actor.name,
      action,
      note: note || dismissReason || `Case status updated to ${alert.status}`,
      createdAt: new Date().toISOString(),
    };
    this.auditLogs.unshift(log);

    // Create a notification for the action
    this.notifications.unshift({
      id: `notif-${Date.now()}`,
      userId: actor.userId,
      role: actor.role,
      scopeId: actor.scopeId,
      type: action === 'ESCALATE' ? 'ESCALATED' : 'NEW_ALERT',
      message: `Alert ${alertId} (${alert.workTitle.slice(0, 30)}...) was marked ${alert.status} by ${actor.name}.`,
      workId: alert.workId,
      read: false,
      createdAt: new Date().toISOString(),
    });

    return alert;
  }

  public addEvidence(alertId: string, note: string, photoUrl?: string) {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (!alert) return null;

    if (!alert.evidenceNotes) alert.evidenceNotes = [];
    if (!alert.evidencePhotos) alert.evidencePhotos = [];

    if (note) alert.evidenceNotes.push(note);
    if (photoUrl) alert.evidencePhotos.push(photoUrl);

    return alert;
  }
}

export const dataService = new DataService();
