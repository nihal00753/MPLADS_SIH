'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  AlertOctagon,
  TrendingUp,
  BarChart3,
  Sliders,
  Send,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ShieldAlert,
  Bell,
  Search,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { WorkDetailModal } from '@/components/ui/WorkDetailModal';

function StateDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTabParam = searchParams.get('tab') || 'overview';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'districts' | 'escalations' | 'benchmarks'>(
    (activeTabParam as any) || 'overview'
  );

  useEffect(() => {
    if (activeTabParam) {
      setActiveTab(activeTabParam as any);
    }
  }, [activeTabParam]);

  // Nudge Modal State
  const [nudgeDistrict, setNudgeDistrict] = useState<string | null>(null);
  const [nudgeMessage, setNudgeMessage] = useState('');
  const [nudgeSent, setNudgeSent] = useState(false);

  // Selected Work Detail
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    fetch('/api/dashboards/state', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching State data:', err);
        setLoading(false);
      });
  }, []);

  const handleSendNudge = async () => {
    if (!nudgeDistrict) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const res = await fetch('/api/dashboards/state/nudge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ district: nudgeDistrict, message: nudgeMessage }),
      });

      if (res.ok) {
        setNudgeSent(true);
        setTimeout(() => {
          setNudgeSent(false);
          setNudgeDistrict(null);
          setNudgeMessage('');
        }, 2000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <DashboardLayout requiredRole="STATE">
      <div className="space-y-6">
        {/* Top Header */}
        <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs uppercase font-mono text-zinc-500 tracking-wider">
                State Nodal Surveillance Command
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 tracking-tight mt-1">
                {data?.stateName || 'Maharashtra'} State Planning Department
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                Inter-District Coordination, SLA Escalation Oversight & Uniform Cost Benchmark Governance
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-lg text-xs font-medium bg-zinc-100 border border-zinc-200 text-zinc-700">
                Tier: State Nodal Officer
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-zinc-200 text-xs font-medium overflow-x-auto">
          {[
            { id: 'overview', label: 'District Risk Heatmap & Overview' },
            { id: 'districts', label: `District Comparisons (${data?.districtComparisons?.length || 0})` },
            { id: 'escalations', label: `SLA Escalation Queue (${data?.escalationQueue?.length || 0})` },
            { id: 'benchmarks', label: 'Cross-District Category Benchmarks' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                router.push('/dashboard/state' + (tab.id === 'overview' ? '' : `?tab=${tab.id}`), { scroll: false });
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

        {/* TAB 1: HEATMAP & OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm">
              <h3 className="font-bold text-base text-zinc-950 mb-1">State District Risk Concentration Heatmap</h3>
              <p className="text-xs text-zinc-500 mb-6">Visual matrix of districts by risk level and pending SLA alerts.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data?.districtComparisons?.map((d: any) => {
                  const isHigh = d.riskLevel === 'HIGH';
                  const isMed = d.riskLevel === 'MEDIUM';

                  return (
                    <div
                      key={d.district}
                      className={`p-4 rounded-xl border bg-zinc-50 hover:shadow-sm transition-all ${
                        isHigh ? 'border-rose-200 hover:border-rose-400' :
                        isMed ? 'border-amber-200 hover:border-amber-400' :
                        'border-zinc-200 hover:border-zinc-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-base text-zinc-950">{d.district}</h4>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isHigh
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : isMed
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {d.riskLevel} RISK
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs mt-3 pt-3 border-t border-zinc-200">
                        <div>
                          <span className="text-[10px] text-zinc-500 block font-medium">Works</span>
                          <strong className="text-zinc-950 font-inter">{d.totalWorks}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 block font-medium">Flags</span>
                          <strong className={`font-inter ${isHigh ? 'text-rose-600 font-extrabold' : 'text-zinc-950'}`}>{d.flagCount}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 block font-medium">Avg Action</span>
                          <strong className="text-zinc-700 font-inter">{d.avgActionDays}d</strong>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-zinc-200 flex items-center justify-between">
                        <span className="text-[11px] text-zinc-600 font-medium font-inter">
                          Utilization: <strong className="text-emerald-700">{d.utilizationPct}%</strong>
                        </span>
                        <button
                          onClick={() => {
                            setNudgeDistrict(d.district);
                            setNudgeMessage(`URGENT: District Collector ${d.district} is requested to resolve ${d.flagCount} pending anomaly flags.`);
                          }}
                          className="px-2.5 py-1 rounded text-[11px] font-semibold bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-500 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Bell className="w-3 h-3 text-amber-600" />
                          Nudge
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DISTRICT COMPARISON TABLE */}
        {activeTab === 'districts' && (
          <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm">
            <h3 className="font-bold text-base text-zinc-950 mb-1">Comparative District Execution Metrics</h3>
            <p className="text-xs text-zinc-500 mb-4">Benchmark analysis of fund utilization, flag resolution velocity, and administrative delays.</p>

            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-100 text-zinc-700 uppercase font-semibold">
                  <tr>
                    <th className="p-3">District Name</th>
                    <th className="p-3">Sanctioned (₹ Cr)</th>
                    <th className="p-3">Fund Utilization</th>
                    <th className="p-3">Active Flags</th>
                    <th className="p-3">Avg Time-to-Action</th>
                    <th className="p-3">Risk Assessment</th>
                    <th className="p-3">Administrative Directive</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {data?.districtComparisons?.map((d: any) => (
                    <tr key={d.district} className="hover:bg-zinc-50 text-zinc-800">
                      <td className="p-3 font-bold text-zinc-950">{d.district}</td>
                      <td className="p-3 font-inter font-semibold text-zinc-900">₹{d.sanctionedCr} Cr</td>
                      <td className="p-3">
                        <span className="font-mono text-zinc-900 font-bold">{d.utilizationPct}%</span>
                      </td>
                      <td className="p-3 font-inter text-zinc-950 font-bold">{d.flagCount}</td>
                      <td className="p-3 font-mono text-zinc-500">{d.avgActionDays} Days</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-100 border border-zinc-200 text-zinc-800`}
                        >
                          {d.riskLevel}
                        </span>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => {
                            setNudgeDistrict(d.district);
                            setNudgeMessage(`STATE DIRECTIVE: District Collector ${d.district} is directed to expedite resolution of ${d.flagCount} flagged works within 48 hours.`);
                          }}
                          className="px-2.5 py-1 rounded text-xs font-semibold bg-zinc-100 border border-zinc-300 hover:bg-black hover:text-white text-zinc-800 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          Send Nudge
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: SLA ESCALATION QUEUE */}
        {activeTab === 'escalations' && (
          <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base text-zinc-950 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-zinc-800" />
                  State Escalation Queue (Overdue SLA Cases)
                </h3>
                <p className="text-xs text-zinc-500">
                  Cases that districts failed to action within the mandatory SLA period, automatically escalated to the State Nodal Officer.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {data?.escalationQueue?.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 bg-zinc-50 rounded-xl border border-dashed border-zinc-300">
                  <CheckCircle2 className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
                  <p className="text-xs">No overdue SLA cases at this time. All districts are within operational compliance windows.</p>
                </div>
              ) : (
                data?.escalationQueue?.map((esc: any) => (
                  <div
                    key={esc.id}
                    className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black text-white font-mono">
                          SLA BREACHED
                        </span>
                        <span className="font-mono text-xs text-zinc-500">{esc.id}</span>
                        <span className="text-xs text-zinc-400">•</span>
                        <span className="font-semibold text-xs text-zinc-800">{esc.district} District</span>
                      </div>
                      <h4 className="text-sm font-bold text-zinc-950">{esc.workTitle}</h4>
                      <p className="text-xs text-zinc-600 mt-1">{esc.reason}</p>
                    </div>

                    <div className="text-left md:text-right shrink-0">
                      <span className="text-xs text-zinc-500 block">Sanctioned</span>
                      <span className="text-base font-bold font-inter text-zinc-950">
                        ₹{(esc.sanctionAmount / 100000).toFixed(2)} L
                      </span>
                      <button
                        onClick={() => {
                          setSelectedWorkId(esc.workId);
                          setIsDetailOpen(true);
                        }}
                        className="mt-2 px-3 py-1 rounded text-xs font-semibold bg-zinc-100 border border-zinc-300 hover:bg-black hover:text-white text-zinc-800 transition-colors block md:inline-block cursor-pointer"
                      >
                        Intervene Case
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 4: CATEGORY BENCHMARKS */}
        {activeTab === 'benchmarks' && (
          <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm">
            <h3 className="font-bold text-base text-zinc-950 mb-1">Same-Work Category Speed & Unit-Cost Comparison</h3>
            <p className="text-xs text-zinc-500 mb-4">Cross-district comparison for like-for-like public infrastructure categories.</p>

            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-100 text-zinc-700 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Work Category</th>
                    <th className="p-3">Standard Schedule of Rates (Unit Cost)</th>
                    <th className="p-3">State Average Execution Speed</th>
                    <th className="p-3">Fastest District Delivery</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {data?.categoryBenchmarks?.map((cat: any) => (
                    <tr key={cat.category} className="hover:bg-zinc-50 text-zinc-800">
                      <td className="p-3 font-bold text-zinc-950">{cat.category}</td>
                      <td className="p-3 font-inter font-semibold text-zinc-900">
                        ₹{cat.unitCostMinLakh}L – ₹{cat.unitCostMaxLakh}L
                      </td>
                      <td className="p-3 font-mono text-zinc-500">{cat.stateAvgDays} Days</td>
                      <td className="p-3 font-semibold text-zinc-950">{cat.fastestDistrict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Nudge Modal */}
      {nudgeDistrict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-zinc-200 animate-in fade-in duration-150 text-zinc-900">
            <div className="flex items-center gap-2 text-zinc-950 mb-2">
              <Bell className="w-5 h-5 text-zinc-700" />
              <h3 className="font-bold text-base">Dispatch State Directive (Nudge)</h3>
            </div>
            <p className="text-xs text-zinc-600 mb-3">
              Transmit an official administrative priority nudge to the Collectorate of <strong className="text-zinc-950">{nudgeDistrict}</strong>.
            </p>

            <textarea
              rows={3}
              value={nudgeMessage}
              onChange={(e) => setNudgeMessage(e.target.value)}
              className="w-full p-2.5 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 placeholder-zinc-400 mb-4 focus:outline-none focus:border-black"
            />

            {nudgeSent ? (
              <div className="p-2.5 rounded-lg bg-zinc-100 border border-zinc-300 text-zinc-900 font-medium text-xs text-center">
                Directive dispatched successfully to {nudgeDistrict} Collectorate.
              </div>
            ) : (
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setNudgeDistrict(null)}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg text-zinc-600 hover:text-black hover:bg-zinc-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendNudge}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-black text-white hover:bg-zinc-800 flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Dispatch Directive
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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

export default function StateDashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-zinc-500">Loading State Workspace...</div>}>
      <StateDashboardContent />
    </Suspense>
  );
}
