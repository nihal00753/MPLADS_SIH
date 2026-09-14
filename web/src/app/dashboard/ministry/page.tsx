'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Landmark,
  ShieldAlert,
  Layers,
  Sliders,
  FileText,
  Download,
  AlertTriangle,
  Building2,
  TrendingUp,
  Search,
  ExternalLink,
  Bot,
  Sparkles,
  BarChart2,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { KPICard } from '@/components/ui/KPICard';
import { WorkDetailModal } from '@/components/ui/WorkDetailModal';

function MinistryDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTabParam = searchParams.get('tab') || 'overview';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'risk-queue' | 'cross-scheme' | 'blacklist' | 'sandbox' | 'audit-brief'>(
    (activeTabParam as any) || 'overview'
  );

  useEffect(() => {
    if (activeTabParam) {
      setActiveTab(activeTabParam as any);
    }
  }, [activeTabParam]);

  // Policy Sandbox State
  const [tenderThresholdLakh, setTenderThresholdLakh] = useState(25);
  const [benchmarkMultiplier, setBenchmarkMultiplier] = useState(1.4);
  const [simulationResults, setSimulationResults] = useState<any>(null);
  const [simulating, setSimulating] = useState(false);

  // Auto-Drafted Audit Brief State
  const [selectedState, setSelectedState] = useState('Maharashtra');
  const [draftBriefText, setDraftBriefText] = useState('');

  // Selected Work Detail
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    fetch('/api/dashboards/ministry', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching Ministry data:', err);
        setLoading(false);
      });
  }, []);

  // Run Policy Sandbox Simulation
  const runSimulation = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    setSimulating(true);
    try {
      const res = await fetch('/api/dashboards/ministry/policy-sandbox', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tenderThresholdLakh, benchmarkMultiplier }),
      });
      const simData = await res.json();
      setSimulationResults(simData.simulationResults);
    } catch (e) {
      console.error(e);
    } finally {
      setSimulating(false);
    }
  };

  const generateAuditBrief = () => {
    const text = `PARLIAMENTARY AUDIT BRIEF — MPLADS FUND SURVEILLANCE
Union Ministry of Statistics and Programme Implementation (MoSPI)
Target State: ${selectedState}
Surveillance Period: FY 2024-25 Q3 Audit Cycle

1. EXECUTIVE SUMMARY:
Under national automated anomaly surveillance, ${selectedState} has registered active works monitoring with an aggregate fund utilization of 76%. Automated verification systems have evaluated tender milestones and geospatial photo records.

2. DETECTED RISK PATTERNS:
- Sequential Split-Invoicing: Works clustered immediately below the ₹${tenderThresholdLakh} Lakh threshold have been identified for independent vigilance audit.
- Cross-Scheme Overlap: ${selectedState} has 26 flagged project coordinates displaying geographical polygon concordance with PMGSY and State Mining (DMF) grants.

3. DIRECTIVE TO STATE NODAL DEPARTMENT:
- Issue immediate technical inspection notice to concerned District Implementing Agencies.
- Freeze milestone drawdown on unverified works pending Section 65B certified photo submission.`;

    setDraftBriefText(text);
  };

  return (
    <DashboardLayout requiredRole="MINISTRY">
      <div className="space-y-6">
        {/* Executive KPI Ribbon */}
        {data?.kpiRibbon && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
            <KPICard
              title="National Entitlement"
              value={data.kpiRibbon.nationalEntitlementCr}
              prefix="₹"
              suffix=" Cr"
              subtitle="All 543 Lok Sabha Seats"
              statusColor="cyan"
            />
            <KPICard
              title="Funds Released"
              value={data.kpiRibbon.fundsReleasedCr}
              prefix="₹"
              suffix=" Cr"
              subtitle="Disbursed to District Nodal"
              statusColor="cyan"
            />
            <KPICard
              title="National Utilization"
              value={data.kpiRibbon.utilizationPct}
              suffix="%"
              subtitle="Ground drawdown rate"
              statusColor="emerald"
            />
            <KPICard
              title="Total Active Works"
              value={data.kpiRibbon.activeWorks}
              subtitle="Covering 28 States & UTs"
              statusColor="orange"
            />
            <KPICard
              title="National Flag Rate"
              value={data.kpiRibbon.nationalFlagRatePct}
              suffix="%"
              subtitle="Anomalies under scrutiny"
              statusColor="rose"
            />
            <KPICard
              title="MPs Monitored"
              value={data.kpiRibbon.totalMPs}
              subtitle="Lok Sabha Sitting Members"
              statusColor="emerald"
            />
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-zinc-200 text-xs font-medium overflow-x-auto">
          {[
            { id: 'overview', label: 'National Surveillance Overview' },
            { id: 'risk-queue', label: `Top-N National Risk Queue (${data?.topNationalRiskQueue?.length || 0})` },
            { id: 'cross-scheme', label: 'Double-Funding Matrix' },
            { id: 'blacklist', label: 'Debarment & Blacklist' },
            { id: 'sandbox', label: 'Policy Simulation Sandbox' },
            { id: 'audit-brief', label: 'Auto-Drafted Audit Brief' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                router.push('/dashboard/ministry' + (tab.id === 'overview' ? '' : `?tab=${tab.id}`), { scroll: false });
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
            <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm">
              <h3 className="font-bold text-base text-zinc-950 mb-1">State-by-State Anomaly Concentration & Fund Release</h3>
              <p className="text-xs text-zinc-500 mb-4">National ranking of states by anomaly frequency and budget at risk.</p>

              <div className="overflow-x-auto rounded-lg border border-zinc-200">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-100 text-zinc-700 uppercase font-semibold">
                    <tr>
                      <th className="p-3">State / UT</th>
                      <th className="p-3">Total Works</th>
                      <th className="p-3">Sanctioned (₹ Cr)</th>
                      <th className="p-3">Utilization</th>
                      <th className="p-3">Flagged Anomalies</th>
                      <th className="p-3">Anomaly Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {data?.stateStats?.map((st: any) => (
                      <tr key={st.state} className="hover:bg-zinc-50 text-zinc-800 transition-colors">
                        <td className="p-3 font-bold text-zinc-950">{st.state}</td>
                        <td className="p-3 font-inter">{st.totalWorks}</td>
                        <td className="p-3 font-inter font-semibold text-zinc-900">₹{st.sanctionedCr} Cr</td>
                        <td className="p-3">
                          <span className="font-mono text-zinc-800 font-semibold">{st.utilizationPct}%</span>
                        </td>
                        <td className="p-3 font-inter text-zinc-950 font-bold">{st.anomalies}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-800 border border-zinc-200">
                            {st.ratePct}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TOP-N NATIONAL RISK QUEUE */}
        {activeTab === 'risk-queue' && (
          <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base text-zinc-950 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-zinc-800" />
                  Curated National High-Risk Case Queue
                </h3>
                <p className="text-xs text-zinc-500">
                  Read-only drill-down for Union Ministry oversight. Enforcement actions reside with District Collectors.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {data?.topNationalRiskQueue?.map((item: any) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-zinc-400 transition-all"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black text-white font-mono">
                        RISK SCORE: {(item.riskScore * 100).toFixed(0)}%
                      </span>
                      <span className="text-xs font-mono text-zinc-500">{item.workId}</span>
                      <span className="text-xs text-zinc-400">•</span>
                      <span className="text-xs font-medium text-zinc-700">{item.district}, {item.state}</span>
                    </div>
                    <h4 className="text-sm font-bold text-zinc-950">{item.workTitle}</h4>
                    <p className="text-xs text-zinc-600 mt-1">{item.reason}</p>
                  </div>

                  <div className="text-left md:text-right shrink-0">
                    <span className="text-xs text-zinc-500 block">Sanctioned Amount</span>
                    <span className="text-lg font-bold font-inter text-zinc-950">₹{item.sanctionAmountCr} Cr</span>
                    <button
                      onClick={() => {
                        setSelectedWorkId(item.workId);
                        setIsDetailOpen(true);
                      }}
                      className="mt-2 px-3 py-1 rounded bg-zinc-100 border border-zinc-300 hover:bg-black hover:text-white text-xs font-semibold text-zinc-800 transition-colors block md:inline-block cursor-pointer"
                    >
                      Audit Drill-Down
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: CROSS-SCHEME DOUBLE-FUNDING MATRIX */}
        {activeTab === 'cross-scheme' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm">
                <span className="text-xs uppercase font-mono text-zinc-500">Total National Funds at Risk</span>
                <p className="text-3xl font-extrabold text-zinc-950 font-inter mt-1">
                  ₹{data?.crossSchemeDoubleFunding?.totalEstimatedRiskCr} Crore
                </p>
                <p className="text-xs text-zinc-500 mt-1">Estimated overlapping public capital expenditure.</p>
              </div>
              <div className="p-5 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm">
                <span className="text-xs uppercase font-mono text-zinc-500">Flagged Coordinate Overlaps</span>
                <p className="text-3xl font-extrabold text-zinc-950 font-inter mt-1">
                  {data?.crossSchemeDoubleFunding?.totalFlaggedPairs} Project Pairs
                </p>
                <p className="text-xs text-zinc-500 mt-1">Matched across PMGSY, DMF, and Smart Cities.</p>
              </div>
            </div>

            <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm">
              <h3 className="font-bold text-base text-zinc-950 mb-1">State Cross-Scheme Double-Funding Concentration</h3>
              <p className="text-xs text-zinc-500 mb-4">Aggregated rollups of works sharing identical polygon footprints with other central schemes.</p>

              <div className="overflow-x-auto rounded-lg border border-zinc-200">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-100 text-zinc-700 uppercase font-semibold">
                    <tr>
                      <th className="p-3">State</th>
                      <th className="p-3">Flagged Overlap Count</th>
                      <th className="p-3">Estimated ₹ at Risk</th>
                      <th className="p-3">Concordant Schemes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {data?.crossSchemeDoubleFunding?.byState?.map((row: any) => (
                      <tr key={row.state} className="hover:bg-zinc-50 text-zinc-800">
                        <td className="p-3 font-bold text-zinc-950">{row.state}</td>
                        <td className="p-3 font-inter font-medium text-zinc-700">{row.count} works</td>
                        <td className="p-3 font-inter font-bold text-zinc-950">₹{row.amountCr} Cr</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1.5">
                            {row.matchedSchemes.map((s: string) => (
                              <span key={s} className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-100 border border-zinc-200 text-zinc-800">
                                {s}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: DEBARMENT & BLACKLIST */}
        {activeTab === 'blacklist' && (
          <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base text-zinc-950 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-zinc-800" />
                  National Contractor Blacklist & CVC Referral Registry
                </h3>
                <p className="text-xs text-zinc-500">
                  Cross-state contractor syndicates recommended for central debarment on GeM (Government e-Marketplace).
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-100 text-zinc-700 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Vendor Name & ID</th>
                    <th className="p-3">Active States</th>
                    <th className="p-3">Total Sanctioned</th>
                    <th className="p-3">Delay Rate</th>
                    <th className="p-3">Vigilance Action</th>
                    <th className="p-3">Primary Irregularity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {data?.nationalBlacklist?.map((v: any) => (
                    <tr key={v.vendorId} className="hover:bg-zinc-50 text-zinc-800">
                      <td className="p-3">
                        <span className="font-bold text-zinc-950 block">{v.vendorName}</span>
                        <span className="font-mono text-[10px] text-zinc-500">{v.vendorId}</span>
                      </td>
                      <td className="p-3 text-zinc-600">{v.activeStates.join(', ')}</td>
                      <td className="p-3 font-bold font-inter text-zinc-950">₹{v.totalSanctionsCr} Cr</td>
                      <td className="p-3 font-mono text-zinc-700 font-semibold">{v.delayRatePct}%</td>
                      <td className="p-3">
                        <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-black text-white">
                          {v.referralStatus}
                        </span>
                      </td>
                      <td className="p-3 text-zinc-600 max-w-xs">{v.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: POLICY SIMULATION SANDBOX */}
        {activeTab === 'sandbox' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm lg:col-span-5">
              <div className="flex items-center gap-2 text-zinc-950 mb-2">
                <Sliders className="w-5 h-5 text-zinc-800" />
                <h3 className="font-bold text-base">Surveillance Policy Sandbox</h3>
              </div>
              <p className="text-xs text-zinc-500 mb-6">
                Adjust regulatory sanction parameters to simulate impact across 10,000 historical projects.
              </p>

              <div className="space-y-6">
                {/* Parameter 1 */}
                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1.5">
                    <span className="text-zinc-700">Tender Threshold Limit (Split-Invoicing)</span>
                    <span className="font-mono text-zinc-950 font-bold">₹{tenderThresholdLakh} Lakh</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={50}
                    step={5}
                    value={tenderThresholdLakh}
                    onChange={(e) => setTenderThresholdLakh(parseInt(e.target.value))}
                    className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-black"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                    <span>₹10L (Aggressive)</span>
                    <span>₹25L (Standard)</span>
                    <span>₹50L (Relaxed)</span>
                  </div>
                </div>

                {/* Parameter 2 */}
                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1.5">
                    <span className="text-zinc-700">Category Cost Benchmark Multiplier</span>
                    <span className="font-mono text-zinc-950 font-bold">{benchmarkMultiplier}x Median</span>
                  </div>
                  <input
                    type="range"
                    min={1.1}
                    max={2.0}
                    step={0.1}
                    value={benchmarkMultiplier}
                    onChange={(e) => setBenchmarkMultiplier(parseFloat(e.target.value))}
                    className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-black"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                    <span>1.1x (Strict)</span>
                    <span>1.4x (Recommended)</span>
                    <span>2.0x (Lenient)</span>
                  </div>
                </div>

                <button
                  onClick={runSimulation}
                  disabled={simulating}
                  className="w-full py-2.5 px-4 rounded-lg text-xs font-bold text-white bg-black hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {simulating ? 'Calculating Counterfactual...' : 'Recalculate Historical Dataset'}
                </button>
              </div>
            </div>

            <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm lg:col-span-7 flex flex-col justify-between">
              <div>
                <h4 className="font-bold text-base text-zinc-950 mb-1">Projected Regulatory Impact</h4>
                <p className="text-xs text-zinc-500 mb-4">Counterfactual audit outcome over the national works datastore.</p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200">
                    <span className="text-[11px] uppercase font-mono text-zinc-500 block">Split-Invoicing Cases Captured</span>
                    <span className="text-3xl font-extrabold text-zinc-950 font-inter mt-1 block">
                      {simulationResults?.splitInvoicingImpactCases ?? 429} Works
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200">
                    <span className="text-[11px] uppercase font-mono text-zinc-500 block">Cost-Overruns Screened</span>
                    <span className="text-3xl font-extrabold text-zinc-950 font-inter mt-1 block">
                      {simulationResults?.costOverrunCasesCaptured ?? 347} Works
                    </span>
                  </div>
                </div>

                <div className="mt-4 p-4 rounded-xl bg-zinc-50 border border-zinc-200">
                  <span className="text-xs font-mono uppercase text-zinc-500 block">Estimated Annual Capital Savings</span>
                  <span className="text-2xl font-black text-zinc-950 font-inter mt-0.5 block">
                    ₹{simulationResults?.estimatedAnnualSavingsCr ?? 85.74} Crore
                  </span>
                  <p className="text-xs text-zinc-700 mt-1">
                    {simulationResults?.policyRecommendation ??
                      'Optimal threshold: achieves 86% anomaly capture with minimal compliance friction.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: AUTO-DRAFTED AUDIT BRIEF */}
        {activeTab === 'audit-brief' && (
          <div className="p-6 rounded-xl bg-white border border-zinc-200 text-zinc-900 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-bold text-base text-zinc-950">Parliamentary & Vigilance Brief Generator</h3>
                <p className="text-xs text-zinc-500">Auto-draft comprehensive inquiry memos for Parliamentary questions and audit committees.</p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedState}
                  onChange={(e) => setSelectedState(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:border-black"
                >
                  <option value="Maharashtra">Maharashtra</option>
                  <option value="Uttar Pradesh">Uttar Pradesh</option>
                  <option value="Bihar">Bihar</option>
                  <option value="West Bengal">West Bengal</option>
                </select>

                <button
                  onClick={generateAuditBrief}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-black text-white hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  Draft Official Brief
                </button>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-800 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {draftBriefText || 'Select a state and click "Draft Official Brief" to generate templated inquiry brief.'}
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
    </DashboardLayout>
  );
}

export default function MinistryDashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-zinc-500">Loading Ministry Workspace...</div>}>
      <MinistryDashboardContent />
    </Suspense>
  );
}
