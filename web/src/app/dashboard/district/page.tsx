'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  Filter,
  Search,
  FileCheck,
  Send,
  XCircle,
  Paperclip,
  Download,
  ShieldAlert,
  ArrowUpRight,
  TrendingUp,
  Layers,
  History,
  Users,
  Award,
  Camera,
  MapPin,
  ExternalLink,
  ShieldCheck,
  Building2,
  FilePlus,
  AlertTriangle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/ui/GlassCard';
import { AlertCard, AlertData } from '@/components/ui/AlertCard';
import { WorkDetailModal } from '@/components/ui/WorkDetailModal';

function DistrictDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTabParam = searchParams.get('tab') || 'queue';
  const [activeTab, setActiveTab] = useState<string>(activeTabParam);

  useEffect(() => {
    setActiveTab(activeTabParam);
  }, [activeTabParam]);

  const [summary, setSummary] = useState<any>(null);
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [works, setWorks] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters for Queue
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');

  // Filters for Works Table
  const [workSearch, setWorkSearch] = useState('');
  const [workCategoryFilter, setWorkCategoryFilter] = useState('ALL');
  const [workStatusFilter, setWorkStatusFilter] = useState('ALL');

  // Modals & Active Items
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Dismiss Modal State
  const [dismissAlert, setDismissAlert] = useState<AlertData | null>(null);
  const [dismissReason, setDismissReason] = useState('Site physically verified on ground; cost variation justified by geotechnical soil conditions.');

  // Evidence Modal State
  const [evidenceAlert, setEvidenceAlert] = useState<AlertData | null>(null);
  const [evidenceNote, setEvidenceNote] = useState('');
  const [evidencePhoto, setEvidencePhoto] = useState('https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=800&q=80');

  // Escalation Bundle Modal State
  const [escalatedBundle, setEscalatedBundle] = useState<any>(null);

  const fetchDashboardData = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const [sumRes, altRes, wrkRes] = await Promise.all([
        fetch('/api/dashboards/district', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/alerts', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/works?limit=100', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (sumRes.ok) {
        const sumData = await sumRes.json();
        setSummary(sumData);
      }

      if (altRes.ok) {
        const altData = await altRes.json();
        setAlerts(altData);
      }

      if (wrkRes.ok) {
        const wrkData = await wrkRes.json();
        const loadedWorks = wrkData.works || [];
        setWorks(loadedWorks);

        // Derive vendor statistics from loaded works
        const vendorMap = new Map<string, any>();
        loadedWorks.forEach((w: any) => {
          if (!w.vendor_id) return;
          if (!vendorMap.has(w.vendor_id)) {
            vendorMap.set(w.vendor_id, {
              vendorId: w.vendor_id,
              name: w.vendor_name || w.vendor_id,
              totalProjects: 0,
              delayedProjects: 0,
              flaggedProjects: 0,
              totalSanctioned: 0,
            });
          }
          const v = vendorMap.get(w.vendor_id);
          v.totalProjects += 1;
          v.totalSanctioned += w.sanction_amount || 0;
          if (w.is_delayed) v.delayedProjects += 1;
          if (w.is_anomaly) v.flaggedProjects += 1;
        });

        const derivedVendors = Array.from(vendorMap.values()).map((v) => ({
          ...v,
          onTimePct: v.totalProjects ? Math.round(((v.totalProjects - v.delayedProjects) / v.totalProjects) * 100) : 100,
          isHub: v.totalProjects >= 4,
          rating: v.flaggedProjects > 1 ? 'C' : v.delayedProjects > 1 ? 'B' : 'A',
        }));
        setVendors(derivedVendors);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error fetching district dashboard data:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleAction = async (alert: AlertData) => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const res = await fetch(`/api/alerts/${alert.id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'ACTIONED',
          officialOrderNo: `ORD/PUNE/2024/${Date.now().toString().slice(-4)}`,
          actionNote: 'Show-cause notice and immediate ground measurement audit issued.',
        }),
      });

      if (res.ok) {
        setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, status: 'ACTIONED' } : a)));
        setAuditLogs((prev) => [
          {
            id: `LOG-${Date.now()}`,
            alertId: alert.id,
            action: 'ACTIONED',
            actorName: 'District Collector',
            note: 'Official show-cause notice issued; milestone drawdowns frozen.',
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleEscalate = async (alert: AlertData) => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const res = await fetch(`/api/alerts/${alert.id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'ESCALATE',
          escalateTo: 'State Nodal Department (Planning & Vigilance)',
          actionNote: 'Certified case bundle compiled with GIS location records and submitted to State.',
        }),
      });

      if (res.ok) {
        const bundleRes = await fetch(`/api/alerts/${alert.id}/export-bundle`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const bundleData = await bundleRes.json();
        setEscalatedBundle(bundleData);
        setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, status: 'ESCALATED' } : a)));
        setAuditLogs((prev) => [
          {
            id: `LOG-${Date.now()}`,
            alertId: alert.id,
            action: 'ESCALATE',
            actorName: 'District Collector',
            note: 'Case escalated to State Authority; certified case bundle compiled.',
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const submitDismiss = async () => {
    if (!dismissAlert) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const res = await fetch(`/api/alerts/${dismissAlert.id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'DISMISS', dismissReason }),
      });

      if (res.ok) {
        setAlerts((prev) => prev.map((a) => (a.id === dismissAlert.id ? { ...a, status: 'DISMISSED' } : a)));
        setAuditLogs((prev) => [
          {
            id: `LOG-${Date.now()}`,
            alertId: dismissAlert.id,
            action: 'DISMISS',
            actorName: 'District Collector',
            note: `Dismissed: ${dismissReason}`,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        setDismissAlert(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const submitEvidence = async () => {
    if (!evidenceAlert) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const res = await fetch(`/api/alerts/${evidenceAlert.id}/evidence`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ note: evidenceNote, photoUrl: evidencePhoto }),
      });

      if (res.ok) {
        setAuditLogs((prev) => [
          {
            id: `LOG-${Date.now()}`,
            alertId: evidenceAlert.id,
            action: 'EVIDENCE_ATTACHED',
            actorName: 'Field Inspector',
            note: `Evidence attached: ${evidenceNote || 'Site photo uploaded.'}`,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        setEvidenceAlert(null);
        setEvidenceNote('');
        alert('Evidence document and photo successfully linked to the case audit file.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const [approvingWorkId, setApprovingWorkId] = useState<string | null>(null);

  const handleApproveWork = async (workId: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setApprovingWorkId(workId);
    try {
      const res = await fetch(`/api/works/${workId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: 'Approved',
          note: 'Administrative sanction accorded after geotechnical and financial feasibility verification.',
        }),
      });

      if (res.ok) {
        setWorks((prev) =>
          prev.map((w) =>
            w.unique_work_number === workId
              ? {
                  ...w,
                  work_status: 'Approved',
                  date_of_administrative_approval: new Date().toISOString().split('T')[0],
                }
              : w
          )
        );
        setAuditLogs((prev) => [
          {
            id: `LOG-${Date.now()}`,
            alertId: workId,
            action: 'SANCTION_APPROVED',
            actorName: 'District Collector',
            note: `Administrative sanction approved for proposal ${workId}.`,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        confetti({
          particleCount: 70,
          spread: 70,
          origin: { y: 0.6 },
        });
      }
    } catch (err) {
      console.error('Error approving work:', err);
    } finally {
      setApprovingWorkId(null);
    }
  };

  const handleRequestClarification = async (workId: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const note =
      prompt('Enter clarification or site revision request for the Member of Parliament:') ||
      'Clarification requested on cost estimate and site suitability.';
    try {
      const res = await fetch(`/api/works/${workId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: 'Clarification Requested',
          note,
        }),
      });

      if (res.ok) {
        setWorks((prev) =>
          prev.map((w) =>
            w.unique_work_number === workId ? { ...w, work_status: 'Clarification Requested' } : w
          )
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const proposedWorks = works.filter(
    (w) =>
      w.work_status === 'Proposed' ||
      w.work_status === 'Clarification Requested' ||
      w.work_status === 'Approved'
  );

  // Filtered Alert List
  const filteredAlerts = alerts.filter((a) => {
    if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false;
    if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
    if (sourceFilter !== 'ALL' && a.source !== sourceFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        a.workTitle.toLowerCase().includes(q) ||
        a.workId.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        (a.vendorName && a.vendorName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Filtered Works List
  const filteredWorks = works.filter((w) => {
    if (workCategoryFilter !== 'ALL' && w.work_category !== workCategoryFilter) return false;
    if (workStatusFilter !== 'ALL' && w.work_status !== workStatusFilter) return false;
    if (workSearch) {
      const q = workSearch.toLowerCase();
      return (
        w.work_name.toLowerCase().includes(q) ||
        w.unique_work_number.toLowerCase().includes(q) ||
        (w.vendor_name && w.vendor_name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <DashboardLayout requiredRole="DISTRICT">
      <div className="space-y-6">
        {/* Pinned District Summary Strip */}
        {summary?.summaryStrip && (
          <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs uppercase font-mono text-zinc-500 tracking-wider">
                    District Operations Center
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-100 text-zinc-800 border border-zinc-200">
                    Live Monitoring
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 tracking-tight">
                  {summary.summaryStrip.districtName} District Authority
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-50 border border-zinc-200 text-zinc-700">
                  Nodal Implementing Officer: Dr. Rajesh Deshmukh, IAS
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 pt-4 text-zinc-950">
              <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-100">
                <span className="text-[11px] text-blue-700 uppercase tracking-wider block font-semibold">Total Works</span>
                <span className="text-2xl font-bold font-inter mt-1 block text-blue-950">{summary.summaryStrip.totalWorks}</span>
              </div>
              <div className="p-3 rounded-lg bg-violet-50/50 border border-violet-100">
                <span className="text-[11px] text-violet-700 uppercase tracking-wider block font-semibold">Sanctioned</span>
                <span className="text-2xl font-bold font-inter mt-1 block text-violet-950">₹{summary.summaryStrip.totalSanctionedCr} Cr</span>
              </div>
              <div className="p-3 rounded-lg bg-emerald-50/50 border border-emerald-100">
                <span className="text-[11px] text-emerald-700 uppercase tracking-wider block font-semibold">Utilization</span>
                <span className="text-2xl font-bold font-inter text-emerald-700 mt-1 block">{summary.summaryStrip.utilizationPct}%</span>
              </div>
              <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-100">
                <span className="text-[11px] text-amber-800 uppercase tracking-wider block font-semibold">Avg Delay</span>
                <span className="text-2xl font-bold font-inter mt-1 block text-amber-900">{summary.summaryStrip.averageDelayDays} Days</span>
              </div>
              <div className="p-3 rounded-lg bg-rose-50/60 border border-rose-200">
                <span className="text-[11px] text-rose-700 uppercase tracking-wider block font-bold">Active Flags</span>
                <span className="text-2xl font-extrabold font-inter text-rose-600 mt-1 block">{summary.summaryStrip.openAlerts}</span>
              </div>
              <div className="p-3 rounded-lg bg-rose-50/60 border border-rose-200">
                <span className="text-[11px] text-rose-700 uppercase tracking-wider block font-bold">SLA &lt;24h</span>
                <span className="text-2xl font-extrabold font-inter text-rose-600 mt-1 block">
                  {summary.summaryStrip.pendingSlaAlerts}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab Header Switching Bar */}
        <div className="flex items-center gap-2 border-b border-zinc-200 text-xs font-medium overflow-x-auto">
          {[
            { id: 'queue', label: `Case Queue (${alerts.filter(a => a.status === 'OPEN').length})`, icon: AlertOctagon },
            { id: 'proposals', label: `MP Recommendations & Proposals (${works.filter(w => w.work_status === 'Proposed').length})`, icon: FilePlus },
            { id: 'works', label: `Works & Audits (${works.length})`, icon: FileCheck },
            { id: 'vendors', label: `Vendor Scorecards (${vendors.length})`, icon: Users },
            { id: 'evidence', label: 'Evidence Vault', icon: Layers },
            { id: 'history', label: 'Action History Log', icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  router.push('/dashboard/district' + (tab.id === 'queue' ? '' : `?tab=${tab.id}`), { scroll: false });
                }}
                className={`pb-3 px-3.5 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'border-blue-600 text-blue-700 font-bold'
                    : 'border-transparent text-zinc-500 hover:text-zinc-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-zinc-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ========================================================================= */}
        {/* VIEW 1: CASE QUEUE (LIVE) */}
        {/* ========================================================================= */}
        {activeTab === 'queue' && (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-zinc-950 flex items-center gap-2">
                  <AlertOctagon className="w-5 h-5 text-zinc-800" />
                  Prioritized Case Investigation Queue
                </h3>
                <p className="text-xs text-zinc-500">
                  Risk-sorted anomalous works with strict legal SLA compliance timers.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search works, ID, vendor..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 placeholder-zinc-400 focus:border-black focus:outline-none"
                  />
                </div>

                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none"
                >
                  <option value="ALL">All Severities</option>
                  <option value="HIGH">High Risk</option>
                  <option value="MEDIUM">Medium Risk</option>
                  <option value="LOW">Low Risk</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="OPEN">Open</option>
                  <option value="ACTIONED">Actioned</option>
                  <option value="ESCALATED">Escalated</option>
                  <option value="DISMISSED">Dismissed</option>
                </select>

                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none"
                >
                  <option value="ALL">All Sources</option>
                  <option value="AI_FLAGGED">AI Flagged</option>
                  <option value="CITIZEN_REPORTED">Citizen Grievance</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="py-20 text-center text-xs text-zinc-500 flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                <span>Loading district case records...</span>
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="py-16 text-center text-zinc-500 bg-white rounded-xl border border-dashed border-zinc-300">
                <CheckCircle2 className="w-10 h-10 text-zinc-400 mx-auto mb-2" />
                <h4 className="font-bold text-sm text-zinc-950">No matching cases found</h4>
                <p className="text-xs text-zinc-500 mt-1">All cases in this view have been resolved or filtered out.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAlerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onInvestigate={(a) => {
                      setSelectedWorkId(a.workId);
                      setIsDetailOpen(true);
                    }}
                    onAction={handleAction}
                    onEscalate={handleEscalate}
                    onDismiss={(a) => setDismissAlert(a)}
                    onAttachEvidence={(a) => setEvidenceAlert(a)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW: MP RECOMMENDATIONS & PROPOSALS */}
        {/* ========================================================================= */}
        {activeTab === 'proposals' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-zinc-950 flex items-center gap-2">
                  <FilePlus className="w-5 h-5 text-blue-600" />
                  MP Work Proposals & Recommendation Letters (Live Intake)
                </h3>
                <p className="text-xs text-zinc-500">
                  New public works officially proposed by Members of Parliament. Evaluate AI pre-sanction risk scores and accord Administrative Sanction (AS).
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-50 text-amber-800 border border-amber-300">
                  {works.filter((w) => w.work_status === 'Proposed').length} Awaiting Sanction
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                  {works.filter((w) => w.work_status === 'Approved').length} Approved
                </span>
              </div>
            </div>

            {proposedWorks.length === 0 ? (
              <div className="py-20 text-center text-zinc-500 bg-white rounded-xl border border-dashed border-zinc-300">
                <CheckCircle2 className="w-10 h-10 text-zinc-400 mx-auto mb-2" />
                <h4 className="font-bold text-sm text-zinc-950">No Pending MP Proposals</h4>
                <p className="text-xs text-zinc-500 mt-1">
                  When an MP submits a proposal via their portal, it reflects here in real time.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {proposedWorks.map((work) => {
                  const isPending = work.work_status === 'Proposed' || work.work_status === 'Clarification Requested';
                  const isApproved = work.work_status === 'Approved';

                  return (
                    <div
                      key={work.unique_work_number}
                      className="p-5 bg-white border border-zinc-200 rounded-xl shadow-sm text-zinc-900 space-y-4 hover:border-zinc-300 transition-all"
                    >
                      {/* Top Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {isApproved ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Sanction Approved
                            </span>
                          ) : work.work_status === 'Clarification Requested' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-300">
                              <Clock className="w-3.5 h-3.5 text-blue-600" />
                              Clarification Requested
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300 animate-pulse">
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                              Awaiting Administrative Sanction
                            </span>
                          )}

                          <span className="text-xs font-mono text-zinc-400">
                            {work.unique_work_number}
                          </span>

                          <span className="text-xs text-zinc-500">
                            Received: <strong className="text-zinc-700">{work.date_of_receipt_of_work_proposal_from_mp || 'Recent'}</strong>
                          </span>
                        </div>

                        <div className="text-left sm:text-right">
                          <span className="text-xs text-zinc-500 block">Proposed Sanction Value</span>
                          <span className="text-base font-extrabold font-inter text-zinc-950">
                            ₹{(work.sanction_amount / 100000).toFixed(2)} Lakh
                          </span>
                        </div>
                      </div>

                      {/* Work Details & Proposer Info */}
                      <div>
                        <h4 className="text-base font-bold text-zinc-950">{work.work_name}</h4>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-zinc-500">
                          <span>
                            Recommended by: <strong className="text-zinc-900">{work.mp_name}</strong> ({work.constituency}, {work.house_name || 'Lok Sabha'})
                          </span>
                          <span>•</span>
                          <span>Category: <strong className="text-zinc-800">{work.work_category}</strong></span>
                          <span>•</span>
                          <span>Implementing District: <strong className="text-zinc-800">{work.nodal_district}</strong></span>
                        </div>
                      </div>

                      {/* Pre-Sanction AI Risk Scoring Banner */}
                      <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-zinc-600 shrink-0" />
                          <div>
                            <span className="font-bold text-zinc-800">AI Pre-Sanction Evaluation: </span>
                            <span className="text-zinc-600">
                              {work.is_anomaly
                                ? 'Proposed amount significantly deviates from historical district category median.'
                                : 'Sanction estimate is consistent with CPWD & state schedule of rates (SoR).'}
                            </span>
                          </div>
                        </div>

                        <span className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] shrink-0 ${
                          work.is_anomaly
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}>
                          {work.is_anomaly ? 'HIGH VARIANCE' : 'BENCHMARK VERIFIED'}
                        </span>
                      </div>

                      {/* Recommendation Letter Extract */}
                      {work.note && (
                        <div className="p-3 rounded-lg bg-blue-50/40 border border-blue-200/80 text-xs text-zinc-700 leading-relaxed">
                          <div className="flex items-center gap-1.5 font-bold text-blue-950 mb-1">
                            <Send className="w-3.5 h-3.5 text-blue-700" />
                            Official Letter of Recommendation:
                          </div>
                          <p className="italic">{work.note}</p>
                        </div>
                      )}

                      {/* Action Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-100">
                        <div className="text-xs text-zinc-500">
                          Agency: <strong className="text-zinc-800">{work.implementing_agency_name || 'District Rural Development Agency'}</strong>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedWorkId(work.unique_work_number);
                              setIsDetailOpen(true);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg text-zinc-700 bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-zinc-600" />
                            Full Details
                          </button>

                          {isPending && (
                            <>
                              <button
                                onClick={() => handleRequestClarification(work.unique_work_number)}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg text-zinc-800 bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 transition-colors cursor-pointer"
                              >
                                Request Clarification
                              </button>

                              <button
                                onClick={() => handleApproveWork(work.unique_work_number)}
                                disabled={approvingWorkId === work.unique_work_number}
                                className="px-4 py-1.5 text-xs font-bold rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                              >
                                {approvingWorkId === work.unique_work_number ? (
                                  <>
                                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    <span>Approving...</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                    <span>Approve & Issue Sanction</span>
                                  </>
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: WORKS & AUDITS */}
        {/* ========================================================================= */}
        {activeTab === 'works' && (
          <div className="p-6 rounded-xl bg-white border border-zinc-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-bold text-base text-zinc-950 flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-zinc-800" />
                  District Works & Audit Registry
                </h3>
                <p className="text-xs text-zinc-500">Comprehensive database of all sanctioned works in the district.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search works..."
                    value={workSearch}
                    onChange={(e) => setWorkSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 placeholder-zinc-400 focus:border-black focus:outline-none"
                  />
                </div>
                <select
                  value={workStatusFilter}
                  onChange={(e) => setWorkStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="Proposed">Proposed (Awaiting Sanction)</option>
                  <option value="Approved">Approved</option>
                  <option value="Completed">Completed</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Stalled">Stalled</option>
                  <option value="Sanctioned">Sanctioned</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-100 text-zinc-700 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Work ID & Description</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Sanction (₹)</th>
                    <th className="p-3">Ground Execution</th>
                    <th className="p-3">Assigned Vendor</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {filteredWorks.slice(0, 30).map((w: any) => (
                    <tr key={w.unique_work_number} className="hover:bg-zinc-50 transition-colors text-zinc-800">
                      <td className="p-3">
                        <span className="font-mono text-[10px] text-zinc-500 block">{w.unique_work_number}</span>
                        <span className="font-bold text-zinc-950 line-clamp-1">{w.work_name}</span>
                        {w.is_anomaly && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-black text-white border border-black mt-1">
                            FLAGGED: {w.anomaly_type || 'Anomaly'}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-zinc-600">{w.work_category}</td>
                      <td className="p-3 font-bold font-inter text-zinc-950">
                        ₹{(w.sanction_amount / 100000).toFixed(2)} L
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-zinc-200 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-black h-full rounded-full" style={{ width: `${w.physical_progress_pct}%` }} />
                          </div>
                          <span className="font-mono text-[10px] text-zinc-500">{w.physical_progress_pct}%</span>
                        </div>
                      </td>
                      <td className="p-3 text-zinc-600 truncate max-w-[130px]">{w.vendor_name || 'Tender Pending'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          w.work_status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          w.work_status === 'UNDER_EXECUTION' || w.work_status === 'SANCTIONED' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          w.work_status === 'DELAYED' || w.work_status === 'FLAGGED' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                          'bg-zinc-100 text-zinc-800 border-zinc-200'
                        }`}>
                          {w.work_status}
                        </span>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => {
                            setSelectedWorkId(w.unique_work_number);
                            setIsDetailOpen(true);
                          }}
                          className="px-2.5 py-1 rounded bg-blue-50 border border-blue-200 hover:bg-blue-600 hover:text-white font-semibold text-blue-700 transition-colors cursor-pointer"
                        >
                          Audit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 3: VENDOR SCORECARDS */}
        {/* ========================================================================= */}
        {activeTab === 'vendors' && (
          <div className="p-6 rounded-xl bg-white border border-zinc-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base text-zinc-950 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  District Contractor Scorecards & Concentration Registry
                </h3>
                <p className="text-xs text-zinc-500">
                  Performance evaluations, delay track records, and hub vendor concentration flags.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {vendors.map((v) => (
                <div
                  key={v.vendorId}
                  className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 hover:border-blue-300 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-mono text-[10px] text-zinc-500">{v.vendorId}</span>
                      <div className="flex items-center gap-1.5">
                        {v.isHub && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white shadow-xs">
                            HUB
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          v.rating === 'A' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          v.rating === 'B' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                          'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          RATING {v.rating}
                        </span>
                      </div>
                    </div>

                    <h4 className="font-bold text-sm text-zinc-950 leading-snug">{v.name}</h4>
                    <p className="text-[11px] text-zinc-600 mt-1">
                      Total Allocated: <strong className="text-zinc-900">₹{(v.totalSanctioned / 100000).toFixed(1)} Lakh</strong>
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs mt-4 pt-3 border-t border-zinc-200">
                    <div className="p-1.5 bg-white rounded border border-zinc-200">
                      <span className="text-[10px] text-zinc-500 block">Projects</span>
                      <strong className="text-zinc-950 font-inter">{v.totalProjects}</strong>
                    </div>
                    <div className="p-1.5 bg-white rounded border border-zinc-200">
                      <span className="text-[10px] text-zinc-500 block">On-Time</span>
                      <strong className="text-zinc-800 font-inter">{v.onTimePct}%</strong>
                    </div>
                    <div className="p-1.5 bg-white rounded border border-zinc-200">
                      <span className="text-[10px] text-zinc-500 block">Flagged</span>
                      <strong className="text-zinc-950 font-inter">{v.flaggedProjects}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 4: EVIDENCE VAULT */}
        {/* ========================================================================= */}
        {activeTab === 'evidence' && (
          <div className="p-6 rounded-xl bg-white border border-zinc-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base text-zinc-950 flex items-center gap-2">
                  <Camera className="w-5 h-5 text-zinc-800" />
                  District Evidence Vault & Verified Inspection Repository
                </h3>
                <p className="text-xs text-zinc-500">
                  Geo-tagged photographic evidence certified under Section 65B of Indian Evidence Act.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                {
                  id: 'EV-01',
                  workId: 'MPLW0000001',
                  title: 'Community Hall Foundation Excavation',
                  inspector: 'Shri A. Patil, Executive Engineer',
                  photo: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=800&q=80',
                  coords: '18.5204 N, 73.8567 E',
                  date: '2024-08-14 11:30 IST',
                  status: 'GPS Verified (Within 40m)',
                },
                {
                  id: 'EV-02',
                  workId: 'MPLW0000012',
                  title: 'Solar Tube Well Borehole Rig Inspection',
                  inspector: 'Smt. R. Kulkarni, Sub-Divisional Officer',
                  photo: 'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=800&q=80',
                  coords: '18.5312 N, 73.8441 E',
                  date: '2024-09-22 15:45 IST',
                  status: 'GPS Verified (Within 15m)',
                },
                {
                  id: 'EV-03',
                  workId: 'MPLW0000028',
                  title: 'School Classroom Wall Masonry Work',
                  inspector: 'Dr. M. Shinde, Technical Auditor',
                  photo: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80',
                  coords: '18.5122 N, 73.8612 E',
                  date: '2024-10-05 09:15 IST',
                  status: 'GPS Verified (Within 25m)',
                },
              ].map((ev) => (
                <div key={ev.id} className="rounded-xl bg-zinc-50 border border-zinc-200 overflow-hidden text-zinc-900 shadow-sm">
                  <img src={ev.photo} alt={ev.title} className="w-full h-44 object-cover" />
                  <div className="p-4 bg-white">
                    <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-1">
                      <span className="font-mono font-bold text-zinc-950">{ev.workId}</span>
                      <span>{ev.date}</span>
                    </div>
                    <h4 className="font-bold text-xs text-zinc-950 line-clamp-1">{ev.title}</h4>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Audited by: {ev.inspector}</p>

                    <div className="mt-3 pt-2.5 border-t border-zinc-200 flex items-center justify-between text-[10px]">
                      <span className="flex items-center gap-1 font-mono text-zinc-500">
                        <MapPin className="w-3 h-3 text-zinc-700" />
                        {ev.coords}
                      </span>
                      <span className="px-2 py-0.5 rounded font-mono bg-zinc-100 text-zinc-800 border border-zinc-200">
                        {ev.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 5: ACTION HISTORY LOG */}
        {/* ========================================================================= */}
        {activeTab === 'history' && (
          <div className="p-6 rounded-xl bg-white border border-zinc-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base text-zinc-950 flex items-center gap-2">
                  <History className="w-5 h-5 text-zinc-800" />
                  District Administrative Action Log (Audit Trail)
                </h3>
                <p className="text-xs text-zinc-500">
                  Immutable chronological record of decisions, escalations, dismissals, and inspections.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-100 text-zinc-700 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Log ID & Timestamp</th>
                    <th className="p-3">Target Alert / Work</th>
                    <th className="p-3">Official Action</th>
                    <th className="p-3">Authorized Official</th>
                    <th className="p-3">Reason / Audit Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {[
                    {
                      id: 'LOG-10921',
                      timestamp: '2024-11-20 14:32 IST',
                      alertId: 'ALT-10002',
                      action: 'ESCALATED',
                      actor: 'Dr. Rajesh Deshmukh, IAS (Collector)',
                      note: 'Sequential split-invoicing under ₹25L detected; escalated to State Vigilance Committee.',
                    },
                    {
                      id: 'LOG-10920',
                      timestamp: '2024-11-19 11:15 IST',
                      alertId: 'ALT-10005',
                      action: 'ACTIONED',
                      actor: 'Executive Engineer, PWD Pune',
                      note: 'Physical inspection order issued; technical audit team assigned.',
                    },
                    {
                      id: 'LOG-10919',
                      timestamp: '2024-11-18 16:45 IST',
                      alertId: 'ALT-10011',
                      action: 'DISMISSED',
                      actor: 'Sub-Divisional Officer, Haveli',
                      note: 'Site physically verified on ground; cost variation justified by soil conditions.',
                    },
                    ...auditLogs,
                  ].map((log, i) => (
                    <tr key={i} className="hover:bg-zinc-50 text-zinc-800">
                      <td className="p-3">
                        <span className="font-mono font-bold text-zinc-950">{log.id}</span>
                        <span className="text-[10px] text-zinc-500 block">{log.timestamp || log.createdAt}</span>
                      </td>
                      <td className="p-3 font-mono text-zinc-800 font-semibold">{log.alertId}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-800 border border-zinc-200">
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-zinc-950">{log.actor || log.actorName}</td>
                      <td className="p-3 text-zinc-600 max-w-md">{log.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Work Detail Modal */}
      {selectedWorkId && (
        <WorkDetailModal
          workId={selectedWorkId}
          isOpen={isDetailOpen}
          onClose={() => {
            setIsDetailOpen(false);
            setSelectedWorkId(null);
          }}
        />
      )}

      {/* Dismissal Modal */}
      {dismissAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-zinc-200 animate-in fade-in duration-150 text-zinc-900">
            <div className="flex items-center gap-2 text-zinc-950 mb-2">
              <XCircle className="w-5 h-5 text-zinc-600" />
              <h3 className="font-bold text-base">Dismiss Alert Case</h3>
            </div>
            <p className="text-xs text-zinc-600 mb-4">
              Dismissing alert <strong className="font-mono text-zinc-950">{dismissAlert.id}</strong> requires official justification for audit records.
            </p>

            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              Select Justification Reason:
            </label>
            <select
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              className="w-full p-2.5 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 mb-4 focus:outline-none focus:border-black"
            >
              <option value="Site physically verified on ground; cost variation justified by geotechnical soil conditions.">
                Site verified; cost variation justified by soil conditions
              </option>
              <option value="Sequential sanctions represent distinct phased tenders approved by technical committee.">
                Sequential sanctions represent distinct phased tenders
              </option>
              <option value="Duplicate photo verified as identical design drawing blueprint, not duplicate execution.">
                Duplicate photo verified as template blueprint
              </option>
              <option value="Grievance resolved with local panchayat; site execution restored.">
                Grievance resolved with local panchayat
              </option>
            </select>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDismissAlert(null)}
                className="px-3.5 py-1.5 text-xs font-medium rounded-lg text-zinc-600 hover:text-black hover:bg-zinc-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={submitDismiss}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-black text-white hover:bg-zinc-800 cursor-pointer"
              >
                Confirm Dismissal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evidence Upload Modal */}
      {evidenceAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-zinc-200 animate-in fade-in duration-150 text-zinc-900">
            <div className="flex items-center gap-2 text-zinc-950 mb-2">
              <Paperclip className="w-5 h-5 text-zinc-600" />
              <h3 className="font-bold text-base">Attach Investigation Evidence</h3>
            </div>
            <p className="text-xs text-zinc-600 mb-4">
              Attach field inspection notes and progress photos to alert <strong className="font-mono text-zinc-950">{evidenceAlert.id}</strong>.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                  Field Inspector Note / Observations:
                </label>
                <textarea
                  rows={3}
                  value={evidenceNote}
                  onChange={(e) => setEvidenceNote(e.target.value)}
                  placeholder="e.g. Ground survey conducted by Executive Engineer; foundation depth verified against structural drawing."
                  className="w-full p-2.5 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                  Verified Site Photograph URL:
                </label>
                <input
                  type="text"
                  value={evidencePhoto}
                  onChange={(e) => setEvidencePhoto(e.target.value)}
                  className="w-full p-2 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:border-black"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setEvidenceAlert(null)}
                className="px-3.5 py-1.5 text-xs font-medium rounded-lg text-zinc-600 hover:text-black hover:bg-zinc-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={submitEvidence}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-black text-white hover:bg-zinc-800 cursor-pointer"
              >
                Save to Audit Vault
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escalation Case-File Bundle Modal */}
      {escalatedBundle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-zinc-200 animate-in fade-in duration-150 text-zinc-900">
            <div className="flex items-center gap-2 text-zinc-950 mb-2">
              <Send className="w-5 h-5" />
              <h3 className="font-bold text-base">Case Escalation Bundle Compiled</h3>
            </div>
            <p className="text-xs text-zinc-600 mb-3">
              Case-file bundle <strong className="font-mono text-zinc-950">{escalatedBundle.bundleId}</strong> has been legally certified and transmitted to the State Nodal Department & Central Vigilance Commission.
            </p>

            <div className="p-3.5 bg-zinc-50 rounded-lg border border-zinc-200 text-xs space-y-2 mb-4">
              <div className="flex justify-between">
                <span className="text-zinc-500">Status:</span>
                <span className="font-bold text-zinc-950 font-mono">{escalatedBundle.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Generated By:</span>
                <span className="font-medium text-zinc-800">{escalatedBundle.generatedBy}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Legal Certification:</span>
                <span className="font-mono text-[10px] text-zinc-700">{escalatedBundle.complianceCertificate}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  const blob = new Blob([JSON.stringify(escalatedBundle, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${escalatedBundle.bundleId}.json`;
                  a.click();
                }}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-zinc-100 border border-zinc-300 hover:bg-zinc-200 text-zinc-800 flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export Certified Bundle
              </button>
              <button
                onClick={() => setEscalatedBundle(null)}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-black text-white hover:bg-zinc-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function DistrictDashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-zinc-500">Loading District Workspace...</div>}>
      <DistrictDashboardContent />
    </Suspense>
  );
}
