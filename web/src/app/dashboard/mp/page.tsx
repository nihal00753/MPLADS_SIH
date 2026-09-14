'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileCheck,
  CheckCircle2,
  Clock,
  Award,
  Download,
  Share2,
  FileText,
  Settings,
  Search,
  Filter,
  TrendingUp,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldCheck,
  Smartphone,
  Globe,
  PlusCircle,
  AlertTriangle,
  UserCheck,
  MapPin,
  X,
  FileUp,
  Send,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { KPICard } from '@/components/ui/KPICard';
import { TrendChart } from '@/components/ui/TrendChart';
import { WorkDetailModal } from '@/components/ui/WorkDetailModal';

function MPDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTabParam = searchParams.get('tab') || 'overview';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'works' | 'citizen_alerts' | 'scorecard' | 'press' | 'settings'>(
    (activeTabParam as any) || 'overview'
  );

  useEffect(() => {
    if (activeTabParam) {
      setActiveTab(activeTabParam as any);
    }
  }, [activeTabParam]);

  // Filters for works table
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Propose Work Modal State
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [proposeSuccess, setProposeSuccess] = useState<any>(null);
  const [proposeForm, setProposeForm] = useState({
    work_name: '',
    work_category: 'Education',
    nodal_district: 'Pune',
    sanction_amount: '4500000',
    implementing_agency_name: 'District Rural Development Agency (DRDA)',
    vendor_name: '',
    recommendation_letter_text: 'I hereby officially recommend the execution of this public work for my constituency under the guidelines of MPLADS. The required public utility and infrastructure benefit has been scrutinized.',
  });

  // Settings State
  const [vernacularLang, setVernacularLang] = useState('en');
  const [whatsappDigest, setWhatsappDigest] = useState(true);

  const handleProposeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProposing(true);
    setProposeError(null);
    setProposeSuccess(null);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/works/propose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...proposeForm,
          sanction_amount: Number(proposeForm.sanction_amount),
          state: data?.mpInfo?.state || 'Maharashtra',
          constituency: data?.mpInfo?.constituency || 'Pune',
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to submit proposal');
      }

      setProposeSuccess(resData);
      if (data && resData.work) {
        setData({
          ...data,
          worksList: [resData.work, ...(data.worksList || [])],
          lifecycle: {
            ...data.lifecycle,
            totalWorks: (data.lifecycle?.totalWorks || 0) + 1,
            sanctioned: (data.lifecycle?.sanctioned || 0) + 1,
          },
        });
      }

      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.6 },
      });
    } catch (err: any) {
      setProposeError(err.message || 'Error proposing work');
    } finally {
      setProposing(false);
    }
  };

  const loadMPDashboard = () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    fetch('/api/dashboards/mp', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching MP dashboard data:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadMPDashboard();
  }, []);

  const triggerShareCelebration = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#ffffff', '#a1a1aa', '#52525b'],
    });
    setShowShareModal(true);
  };

  const filteredWorks = (data?.worksList || []).filter((w: any) => {
    if (categoryFilter !== 'ALL' && w.work_category !== categoryFilter) return false;
    if (statusFilter !== 'ALL' && w.work_status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        w.work_name.toLowerCase().includes(q) ||
        w.unique_work_number.toLowerCase().includes(q) ||
        w.vendor_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <DashboardLayout requiredRole="MP">
      <div className="space-y-6">
        {/* Top Hero Banner */}
        {data?.mpInfo && (
          <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    18th Lok Sabha
                  </span>
                  <span className="text-xs text-zinc-500">Constituency: {data.mpInfo.constituency} ({data.mpInfo.state})</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 tracking-tight">
                  {data.mpInfo.name}
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  National Public Works Accountability & Asset Delivery Dashboard
                </p>
                <div className="mt-3.5 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => {
                      setProposeSuccess(null);
                      setProposeError(null);
                      setShowProposeModal(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4 text-white" />
                    <span>+ Suggest New Work / Proposal</span>
                  </button>
                  <span className="text-[11px] text-zinc-500">
                    Propose civil works with recommendation letters; instantly reflects on District Collector dashboard.
                  </span>
                </div>
              </div>

              {/* Fund Allocation Utilization Progress Bar */}
              <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200 sm:min-w-[280px]">
                <div className="flex items-baseline justify-between mb-2 text-xs">
                  <span className="text-zinc-600 font-medium">MPLADS Fund Utilization:</span>
                  <span className="font-extrabold text-lg text-blue-600 font-inter">
                    {data.mpInfo.utilizationPct}%
                  </span>
                </div>
                <div className="w-full bg-zinc-200 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 h-full rounded-full transition-all duration-700 shadow-xs"
                    style={{ width: `${Math.min(100, data.mpInfo.utilizationPct)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-zinc-500 mt-2 font-mono">
                  <span>Spent: <strong className="text-emerald-700">₹{data.mpInfo.totalSpentCr} Cr</strong></span>
                  <span>Limit: ₹{data.mpInfo.allocatedLimitCr} Cr</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Selection */}
        <div className="flex items-center gap-2 border-b border-zinc-200 text-xs font-medium overflow-x-auto">
          {[
            { id: 'overview', label: 'Constituency Overview' },
            { id: 'works', label: `Sanctioned & Proposed Works (${data?.lifecycle?.totalWorks || 0})` },
            { id: 'citizen_alerts', label: `Citizen Ground Alerts (${(data?.citizenAlerts || []).length})` },
            { id: 'scorecard', label: 'Transparency Scorecard' },
            { id: 'press', label: 'Press Brief Generator' },
            { id: 'settings', label: 'Constituency Settings' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                router.push('/dashboard/mp' + (tab.id === 'overview' ? '' : `?tab=${tab.id}`), { scroll: false });
              }}
              className={`pb-3 px-3.5 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-700 font-bold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* KPI Cards: Asset Lifecycle Counts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <KPICard
                title="Total Works Sanctioned"
                value={data?.lifecycle?.totalWorks || 0}
                subtitle="All municipal wards"
                statusColor="cyan"
              />
              <KPICard
                title="In-Progress (Active)"
                value={data?.lifecycle?.inProgress || 0}
                subtitle="Civil execution underway"
                statusColor="orange"
              />
              <KPICard
                title="Completed & Commissioned"
                value={data?.lifecycle?.completed || 0}
                subtitle="Handed over to public"
                statusColor="emerald"
              />
              <KPICard
                title="Delayed / Stalled"
                value={data?.lifecycle?.stalled || 0}
                subtitle="Halted by contractor"
                statusColor="amber"
              />
              <KPICard
                title="Flagged by AI Audit"
                value={data?.lifecycle?.flaggedCount || 0}
                subtitle="Under technical scrutiny"
                statusColor="rose"
              />
            </div>

            {/* Charts & Benchmarks Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Pace vs Expected Trend Line */}
              <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm lg:col-span-8">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-base text-zinc-950">Expenditure Drawdown Pace vs Projected Target</h3>
                    <p className="text-xs text-zinc-500">Cumulative expenditure progression in ₹ Crore over FY 2024-25.</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5 font-semibold text-blue-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      Actual Spend
                    </span>
                    <span className="flex items-center gap-1.5 font-semibold text-emerald-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      Target Pace
                    </span>
                  </div>
                </div>

                <TrendChart
                  data={data?.paceTrend || []}
                  dataKeyX="month"
                  dataKeys={[
                    { key: 'actualCr', name: 'Actual Spend (₹ Cr)', color: '#09090b' },
                    { key: 'targetCr', name: 'Target Pace (₹ Cr)', color: '#71717a' },
                  ]}
                  yAxisSuffix=" Cr"
                />
              </div>

              {/* Peer-Constituency Benchmark Widget */}
              <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm lg:col-span-4 flex flex-col justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-medium bg-zinc-100 border border-zinc-200 text-zinc-700 mb-3">
                    <Sparkles className="w-3.5 h-3.5 text-zinc-600" />
                    Peer Benchmark
                  </div>
                  <h4 className="font-bold text-base text-zinc-950 leading-tight">
                    Execution Velocity Benchmark
                  </h4>
                  <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
                    {data?.peerBenchmark?.description}
                  </p>

                  <div className="mt-6 p-4 rounded-xl bg-zinc-50 border border-zinc-200">
                    <div className="text-3xl font-extrabold text-zinc-950 font-inter">
                      Rank #{data?.peerBenchmark?.rankInState}
                    </div>
                    <span className="text-xs text-zinc-500 block mt-0.5">
                      Out of {data?.peerBenchmark?.totalStateMPs} Maharashtra Parliamentary Constituencies
                    </span>
                    <div className="mt-3 pt-3 border-t border-zinc-200 flex items-center justify-between text-xs font-medium text-zinc-700">
                      <span>National Percentile:</span>
                      <span className="text-sm font-inter font-bold text-zinc-950">{data?.peerBenchmark?.percentileNational}th</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-200 text-center">
                  <span className="text-[11px] text-zinc-500">
                    Top Sector: <strong className="text-zinc-800">{data?.peerBenchmark?.categoryFocus}</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: WORKS LIST TABLE */}
        {activeTab === 'works' && (
          <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-bold text-base text-zinc-950">Sanctioned Public Infrastructure Works</h3>
                <p className="text-xs text-zinc-500">Searchable repository of all works recommended by Member of Parliament.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search work title or vendor..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 placeholder-zinc-400 focus:border-black focus:outline-none"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="Proposed">Proposed (Awaiting District Sanction)</option>
                  <option value="Approved">Sanction Approved</option>
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
                    <th className="p-3">Work ID & Title</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Sanction (₹)</th>
                    <th className="p-3">Progress</th>
                    <th className="p-3">Vendor</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {filteredWorks.slice(0, 25).map((w: any) => (
                    <tr key={w.unique_work_number} className="hover:bg-zinc-50 text-zinc-800 transition-colors">
                      <td className="p-3">
                        <span className="font-mono text-[10px] text-zinc-500 block">{w.unique_work_number}</span>
                        <span className="font-semibold text-zinc-950 line-clamp-1">{w.work_name}</span>
                      </td>
                      <td className="p-3 text-zinc-600">{w.work_category}</td>
                      <td className="p-3 font-bold font-inter text-zinc-950">
                        ₹{(w.sanction_amount / 100000).toFixed(2)} Lakh
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-zinc-200 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-black h-full rounded-full"
                              style={{ width: `${w.physical_progress_pct}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-zinc-500">{w.physical_progress_pct}%</span>
                        </div>
                      </td>
                      <td className="p-3 text-zinc-600 font-medium truncate max-w-[140px]">
                        {w.vendor_name || 'Tender Pending'}
                      </td>
                      <td className="p-3">
                        {w.work_status === 'Proposed' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-600" />
                            Awaiting District Sanction
                          </span>
                        ) : w.work_status === 'Approved' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Sanction Approved
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-800 border border-zinc-200">
                            {w.work_status}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => {
                            setSelectedWorkId(w.unique_work_number);
                            setIsDetailOpen(true);
                          }}
                          className="px-2.5 py-1 rounded bg-zinc-100 border border-zinc-300 hover:bg-black hover:text-white text-zinc-800 font-medium transition-colors cursor-pointer"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: CITIZEN GROUND ALERTS */}
        {activeTab === 'citizen_alerts' && (
          <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-base text-zinc-950 flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-zinc-700" />
                  Constituency Citizen Ground Intelligence & Field Reports
                </h3>
                <p className="text-xs text-zinc-500">
                  Ground photos and GPS verified feedback submitted by local constituents. High-risk reports generate instant alerts.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-zinc-100 text-zinc-800 border border-zinc-200">
                {(data?.citizenAlerts || []).length} Active Reports
              </span>
            </div>

            {(data?.citizenAlerts || []).length === 0 ? (
              <div className="py-16 text-center text-zinc-500 bg-zinc-50 rounded-xl border border-dashed border-zinc-300">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <h4 className="font-bold text-sm text-zinc-950">No High-Risk Ground Discrepancies</h4>
                <p className="text-xs text-zinc-500 mt-1">
                  All citizen feedback in this constituency is currently within normal tolerance or resolved.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(data?.citizenAlerts || []).map((alert: any) => (
                  <div
                    key={alert.id}
                    className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-rose-600" />
                        CITIZEN HIGH RISK
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">{alert.id}</span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-950 line-clamp-1">{alert.workTitle}</h4>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Work ID: <span className="font-mono text-zinc-700">{alert.workId}</span> • District: {alert.district}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-rose-200 text-xs text-zinc-700 leading-relaxed">
                      {alert.reason}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-rose-200/60 text-xs">
                      <span className="text-[11px] text-zinc-500">
                        {new Date(alert.createdAt || Date.now()).toLocaleDateString()}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedWorkId(alert.workId);
                          setIsDetailOpen(true);
                        }}
                        className="px-3 py-1 rounded bg-zinc-900 hover:bg-black text-white font-semibold text-[11px] cursor-pointer"
                      >
                        Investigate Work
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: TRANSPARENCY SCORECARD */}
        {activeTab === 'scorecard' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="p-8 rounded-xl bg-white border border-zinc-200 shadow-sm text-zinc-900 lg:col-span-7 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-zinc-200 pb-4 mb-6">
                  <div>
                    <span className="text-xs uppercase font-mono text-zinc-500 tracking-wider">
                      Verified Public Rating
                    </span>
                    <h3 className="text-2xl font-bold text-zinc-950 mt-0.5">
                      National Transparency Index
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className="text-4xl font-extrabold text-zinc-950 font-inter">
                      {data?.transparencyScore?.grade}
                    </span>
                    <span className="text-xs text-zinc-500 block font-medium">Rating Tier</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1.5">
                      <span className="text-zinc-700">Digital Progress Geotag Coverage</span>
                      <span className="text-zinc-950 font-inter font-bold">98%</span>
                    </div>
                    <div className="w-full bg-zinc-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-black h-full rounded-full" style={{ width: '98%' }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1.5">
                      <span className="text-zinc-700">Clean Milestone Audit Ratio</span>
                      <span className="text-zinc-950 font-inter font-bold">96%</span>
                    </div>
                    <div className="w-full bg-zinc-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-zinc-600 h-full rounded-full" style={{ width: '96%' }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1.5">
                      <span className="text-zinc-700">Citizen Grievance Resolution Pace</span>
                      <span className="text-zinc-950 font-inter font-bold">91%</span>
                    </div>
                    <div className="w-full bg-zinc-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-zinc-400 h-full rounded-full" style={{ width: '91%' }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-zinc-200 flex items-center justify-between">
                <span className="text-xs text-zinc-500">
                  Certified by MoSPI Public Governance Data Unit
                </span>
                <button
                  onClick={triggerShareCelebration}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-black hover:bg-zinc-800 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Share2 className="w-4 h-4 text-white" />
                  Download / Share Branded Card
                </button>
              </div>
            </div>

            {/* Branded Card Preview */}
            <div className="lg:col-span-5">
              <div className="p-6 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 shadow-sm relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-500">
                      GOVERNMENT OF INDIA • MPLADS
                    </span>
                  </div>
                  <h4 className="text-xl font-bold text-zinc-950">{data?.mpInfo?.name}</h4>
                  <p className="text-xs text-zinc-500">Member of Parliament — {data?.mpInfo?.constituency}</p>

                  <div className="my-6 p-4 rounded-xl bg-white border border-zinc-200 text-center shadow-sm">
                    <span className="text-xs text-zinc-500 block uppercase font-mono">Transparency Grade</span>
                    <span className="text-5xl font-black font-inter text-zinc-950 my-1 block">A+</span>
                    <span className="text-xs text-zinc-500 font-medium">94/100 Composite Governance Score</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="p-2.5 rounded-lg bg-white border border-zinc-200">
                      <span className="text-zinc-500 block text-[10px]">Utilization</span>
                      <strong className="text-zinc-950 text-sm font-inter">{data?.mpInfo?.utilizationPct}%</strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-zinc-200">
                      <span className="text-zinc-500 block text-[10px]">Completed Works</span>
                      <strong className="text-zinc-950 text-sm font-inter">{data?.lifecycle?.completed} Works</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PRESS SUMMARY GENERATOR */}
        {activeTab === 'press' && (
          <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base text-zinc-950">1-Click Quarterly Press Summary Generator</h3>
                <p className="text-xs text-zinc-500">Auto-generated media release for local newspapers, press conferences, and constituency bulletins.</p>
              </div>

              <button
                onClick={() => {
                  const blob = new Blob([data?.pressSummary || ''], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `MPLADS_Press_Release_${data?.mpInfo?.constituency}.md`;
                  a.click();
                }}
                className="px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-black hover:bg-zinc-800 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Export Press Release (Markdown)
              </button>
            </div>

            <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-800 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {data?.pressSummary}
            </div>
          </div>
        )}

        {/* TAB 5: PREFERENCES & SETTINGS */}
        {activeTab === 'settings' && (
          <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm max-w-2xl">
            <h3 className="font-bold text-base text-zinc-950 mb-1">Constituency Reporting & Digest Settings</h3>
            <p className="text-xs text-zinc-500 mb-6">Manage language localization and direct communication preference toggles.</p>

            <div className="space-y-4">
              {/* Vernacular Language Toggle */}
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-xs text-zinc-950 flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-zinc-600" />
                    Vernacular Language Toggle
                  </h4>
                  <p className="text-xs text-zinc-500 mt-0.5">Switch all report outputs between English and Hindi.</p>
                </div>
                <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-200 text-xs font-semibold">
                  <button
                    onClick={() => setVernacularLang('en')}
                    className={`px-3 py-1 rounded transition-all cursor-pointer ${vernacularLang === 'en' ? 'bg-black text-white font-bold' : 'text-zinc-700 hover:text-black'}`}
                  >
                    English
                  </button>
                  <button
                    onClick={() => setVernacularLang('hi')}
                    className={`px-3 py-1 rounded transition-all cursor-pointer ${vernacularLang === 'hi' ? 'bg-black text-white font-bold' : 'text-zinc-700 hover:text-black'}`}
                  >
                    हिंदी (Hindi)
                  </button>
                </div>
              </div>

              {/* WhatsApp / SMS Digest Opt-In */}
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-xs text-zinc-950 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-zinc-600" />
                    WhatsApp & SMS Milestone Digest
                  </h4>
                  <p className="text-xs text-zinc-500 mt-0.5">Receive milestone completion and fund drawdown alerts directly on phone.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={whatsappDigest}
                    onChange={(e) => setWhatsappDigest(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black peer-checked:after:bg-white" />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Propose Work Modal */}
      <AnimatePresence>
        {showProposeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-zinc-200 shadow-2xl p-6 text-zinc-900"
            >
              <div className="flex items-center justify-between border-b border-zinc-200 pb-4 mb-5">
                <div>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                    Constituency Development Proposal
                  </span>
                  <h3 className="text-lg font-bold text-zinc-950 mt-1">
                    Suggest New Public Work & Letter of Recommendation
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Transmits directly to District Collector (DM) with instant AI risk pre-scoring.
                  </p>
                </div>
                <button
                  onClick={() => setShowProposeModal(false)}
                  className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {proposeError && (
                <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{proposeError}</span>
                </div>
              )}

              {proposeSuccess ? (
                <div className="space-y-4 py-4">
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      Work Proposal Successfully Submitted & Transmitted!
                    </div>
                    <p className="text-xs text-emerald-700 mt-1">
                      Your proposal has been logged with ID <strong className="font-mono">{proposeSuccess.work?.unique_work_number}</strong> and is now live on the District Collector's dashboard for administrative sanction.
                    </p>
                  </div>

                  {proposeSuccess.riskEvaluation && (
                    <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                          AI Pre-Sanction Evaluation
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          proposeSuccess.riskEvaluation.level === 'HIGH'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}>
                          {proposeSuccess.riskEvaluation.level} RISK (Score: {Math.round(proposeSuccess.riskEvaluation.score * 100)}%)
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600">
                        {proposeSuccess.riskEvaluation.reason}
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-3">
                    <button
                      onClick={() => {
                        setShowProposeModal(false);
                        setProposeSuccess(null);
                      }}
                      className="px-4 py-2 rounded-lg bg-zinc-900 text-white font-bold text-xs hover:bg-zinc-800 cursor-pointer"
                    >
                      Done & View Works
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleProposeSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">
                      Work Title / Project Description *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Construction of Modern Community Health Center & Solar Cold Storage"
                      value={proposeForm.work_name}
                      onChange={(e) => setProposeForm({ ...proposeForm, work_name: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:border-blue-600"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 mb-1">
                        Sector / Work Category *
                      </label>
                      <select
                        value={proposeForm.work_category}
                        onChange={(e) => setProposeForm({ ...proposeForm, work_category: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:border-blue-600"
                      >
                        <option value="Education">Education</option>
                        <option value="Health and Family Welfare">Health and Family Welfare</option>
                        <option value="Drinking Water Facility">Drinking Water Facility</option>
                        <option value="Sanitation">Sanitation</option>
                        <option value="Roads, Pathways and Bridges">Roads, Pathways and Bridges</option>
                        <option value="Electricity Facility">Electricity Facility</option>
                        <option value="Irrigation Facility">Irrigation Facility</option>
                        <option value="Other Public Facilities">Other Public Facilities</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-zinc-700 mb-1">
                        Proposed Sanction Amount (₹ INR) *
                      </label>
                      <input
                        type="number"
                        required
                        min="10000"
                        step="10000"
                        placeholder="e.g. 4500000"
                        value={proposeForm.sanction_amount}
                        onChange={(e) => setProposeForm({ ...proposeForm, sanction_amount: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:border-blue-600"
                      />
                      <span className="text-[10px] text-zinc-500 mt-0.5 block">
                        ₹{(Number(proposeForm.sanction_amount || 0) / 100000).toFixed(2)} Lakh
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 mb-1">
                        Nodal District *
                      </label>
                      <input
                        type="text"
                        required
                        value={proposeForm.nodal_district}
                        onChange={(e) => setProposeForm({ ...proposeForm, nodal_district: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-zinc-700 mb-1">
                        Implementing Agency
                      </label>
                      <input
                        type="text"
                        value={proposeForm.implementing_agency_name}
                        onChange={(e) => setProposeForm({ ...proposeForm, implementing_agency_name: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1 flex items-center justify-between">
                      <span>Official Letter of Recommendation Text *</span>
                      <span className="text-[10px] text-zinc-400 font-normal">MP Recommendation Mandate</span>
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={proposeForm.recommendation_letter_text}
                      onChange={(e) => setProposeForm({ ...proposeForm, recommendation_letter_text: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:border-blue-600"
                      placeholder="Enter official recommendation letter statement..."
                    />
                  </div>

                  <div className="p-3 rounded-lg bg-blue-50/60 border border-blue-200 text-xs text-blue-900 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileUp className="w-4 h-4 text-blue-600" />
                      <div>
                        <span className="font-semibold block">Attach Scanned Letter of Recommendation</span>
                        <span className="text-[10px] text-blue-700">Digital signature / PDF endorsement accepted</span>
                      </div>
                    </div>
                    <label className="px-3 py-1.5 rounded bg-white border border-blue-300 text-blue-700 font-bold text-[11px] cursor-pointer hover:bg-blue-50 transition-colors">
                      Upload PDF
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" />
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-200">
                    <button
                      type="button"
                      onClick={() => setShowProposeModal(false)}
                      className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-100 font-medium text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={proposing}
                      className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {proposing ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Evaluating AI Risk & Submitting...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5 text-white" />
                          <span>Transmit Proposal to District Collector</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
    </DashboardLayout>
  );
}

export default function MPDashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-zinc-500">Loading MP Workspace...</div>}>
      <MPDashboardContent />
    </Suspense>
  );
}
