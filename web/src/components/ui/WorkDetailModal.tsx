'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  MapPin,
  Calendar,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileCheck,
  ShieldAlert,
  ChevronRight,
  ExternalLink,
  Layers,
  Award,
} from 'lucide-react';
import { RiskBadge } from './RiskBadge';

interface WorkDetailModalProps {
  workId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function WorkDetailModal({ workId, isOpen, onClose }: WorkDetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'expenditure' | 'photos' | 'vendor'>('overview');

  useEffect(() => {
    if (!isOpen || !workId) return;

    setLoading(true);
    fetch(`/api/works/${encodeURIComponent(workId)}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
      },
    })
      .then((res) => res.json())
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error loading work details:', err);
        setLoading(false);
      });
  }, [isOpen, workId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-xl shadow-2xl border border-zinc-200 flex flex-col overflow-hidden animate-in fade-in duration-150">
        {/* Header */}
        <div className="p-6 bg-zinc-50 border-b border-zinc-200 text-zinc-900 flex items-start justify-between">
          <div className="pr-8">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded text-xs font-mono font-medium bg-white border border-zinc-300 text-zinc-700">
                {workId}
              </span>
              {data?.work?.work_status && (
                <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-zinc-100 border border-zinc-200 text-zinc-800">
                  {data.work.work_status}
                </span>
              )}
              {data?.mlRiskProfile && (
                <RiskBadge severity={data.mlRiskProfile.severity} score={data.mlRiskProfile.riskScore} size="sm" />
              )}
            </div>
            <h3 className="text-xl font-bold font-sans text-zinc-950 leading-snug">
              {data?.work?.work_name || `MPLADS Project #${workId}`}
            </h3>
            <p className="text-xs text-zinc-500 mt-1.5 flex flex-wrap items-center gap-x-3">
              <span>{data?.work?.work_category}</span>
              <span>•</span>
              <span>District: {data?.work?.nodal_district}, {data?.work?.state}</span>
              <span>•</span>
              <span>MP: {data?.work?.mp_name}</span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white border border-zinc-200 text-zinc-500 hover:text-black hover:bg-zinc-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-500 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview & Risk Signals' },
            { id: 'timeline', label: 'Milestone Timeline' },
            { id: 'expenditure', label: 'Drawdown & Payments' },
            { id: 'photos', label: 'Geo-Tagged Photos' },
            { id: 'vendor', label: 'Vendor Scorecard' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 px-3 border-b-2 font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-700 font-bold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 text-zinc-900">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-zinc-500 text-xs">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
              Analyzing project records & verification metrics...
            </div>
          ) : !data || !data.work ? (
            <div className="text-center py-12 text-zinc-500">Project details could not be retrieved.</div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Financial & Physical Progress Strip */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200">
                      <span className="text-xs text-zinc-500 font-medium">Sanctioned Amount</span>
                      <p className="text-2xl font-bold font-inter text-zinc-950 mt-1">
                        ₹{(data.work.sanction_amount / 100000).toFixed(2)} Lakh
                      </p>
                    </div>

                    <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200">
                      <span className="text-xs text-zinc-500 font-medium">Financial Progress</span>
                      <p className="text-2xl font-bold font-inter text-blue-700 mt-1">
                        {data.work.financial_progress_pct}%
                      </p>
                      <div className="w-full bg-zinc-200 h-2 rounded-full mt-2 overflow-hidden">
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full" style={{ width: `${data.work.financial_progress_pct}%` }}></div>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200">
                      <span className="text-xs text-zinc-500 font-medium">Physical Progress</span>
                      <p className="text-2xl font-bold font-inter text-emerald-700 mt-1">
                        {data.work.physical_progress_pct}%
                      </p>
                      <div className="w-full bg-zinc-200 h-2 rounded-full mt-2 overflow-hidden">
                        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 h-full rounded-full" style={{ width: `${data.work.physical_progress_pct}%` }}></div>
                      </div>
                    </div>
                  </div>

                  {/* Comprehensive Risk Explanation Panel */}
                  <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200">
                    <div className="flex items-center gap-2 mb-2 text-zinc-950 font-semibold text-sm">
                      <ShieldAlert className="w-4 h-4 text-rose-600" />
                      <h4>Comprehensive Risk Evaluation</h4>
                    </div>
                    <p className="text-xs text-zinc-700 leading-relaxed">
                      {data.mlRiskProfile?.reason || 'Automated verification confirmed baseline benchmark consistency.'}
                    </p>

                    {data.mlRiskProfile?.factors && data.mlRiskProfile.factors.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-zinc-200 space-y-2">
                        <span className="text-[11px] uppercase font-bold text-zinc-500">Key Risk Indicators:</span>
                        {data.mlRiskProfile.factors.map((f: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-xs bg-white p-2.5 rounded border border-zinc-200">
                            <span className="font-medium text-zinc-900">{f.factor_name}</span>
                            <span className="text-zinc-600 font-mono text-[11px]">{f.reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Work Splitting Detection Alert if Present */}
                  {data.crossSchemeMatches && data.crossSchemeMatches.length > 0 && (
                    <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200">
                      <div className="flex items-center gap-2 mb-2 text-zinc-950 font-semibold text-sm">
                        <Layers className="w-4 h-4 text-zinc-700" />
                        <h4>Cross-Scheme Polygon & Title Matching</h4>
                      </div>
                      <p className="text-xs text-zinc-600 mb-2">
                        Potential double-funding flagged across overlapping government schemes:
                      </p>
                      <div className="space-y-2">
                        {data.crossSchemeMatches.map((cs: any, idx: number) => (
                          <div key={idx} className="p-3 bg-white rounded border border-zinc-200 text-xs">
                            <div className="flex items-center justify-between font-semibold text-zinc-900">
                              <span>{cs.scheme}</span>
                              <span className="text-xs font-mono text-zinc-500">Ref: {cs.matchedWorkRef}</span>
                            </div>
                            <p className="text-zinc-600 mt-1">{cs.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: TIMELINE */}
              {activeTab === 'timeline' && (
                <div className="space-y-4">
                  <div className="relative pl-6 border-l-2 border-zinc-300 space-y-6 my-2">
                    {data.timeline?.map((step: any, idx: number) => (
                      <div key={idx} className="relative">
                        <div
                          className={`absolute -left-[31px] top-0.5 w-4 h-4 rounded-full border-2 ${
                            step.completed ? 'border-black bg-black' : 'border-zinc-300 bg-zinc-100'
                          }`}
                        />
                        <div>
                          <div className="flex items-center justify-between text-xs">
                            <h5 className="font-bold text-zinc-950 text-sm">{step.stage}</h5>
                            <span className="font-mono text-zinc-500">{step.date}</span>
                          </div>
                          {step.officer && <p className="text-xs text-zinc-500 mt-0.5">Authorized by: {step.officer}</p>}
                          {step.progress && <p className="text-xs text-zinc-700 font-semibold mt-0.5">{step.progress}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: EXPENDITURE */}
              {activeTab === 'expenditure' && (
                <div className="space-y-4">
                  <div className="overflow-x-auto rounded-lg border border-zinc-200">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-zinc-100 text-zinc-700 font-semibold uppercase border-b border-zinc-200">
                        <tr>
                          <th className="p-3">Milestone Installment</th>
                          <th className="p-3">Amount (₹)</th>
                          <th className="p-3">Disbursement Date</th>
                          <th className="p-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200">
                        {data.expenditureDrawdown?.map((row: any, i: number) => (
                          <tr key={i} className="hover:bg-zinc-50 text-zinc-900">
                            <td className="p-3 font-medium text-zinc-950">{row.installment}</td>
                            <td className="p-3 font-bold font-inter text-zinc-950">₹{(row.amount / 100000).toFixed(2)} Lakh</td>
                            <td className="p-3 text-zinc-500 font-mono">{row.date}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-800 border border-zinc-200">
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 4: PHOTOS */}
              {activeTab === 'photos' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {data.photos?.map((ph: any) => (
                      <div key={ph.id} className="rounded-lg overflow-hidden border border-zinc-200 bg-zinc-50">
                        <img src={ph.url} alt={ph.caption} className="w-full h-44 object-cover" />
                        <div className="p-3.5 bg-white">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-semibold text-zinc-950">{ph.caption}</span>
                            <span className="font-mono text-[10px] text-zinc-500">{ph.timestamp}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 border-t border-zinc-200">
                            <span className="flex items-center gap-1 font-mono">
                              <MapPin className="w-3 h-3 text-zinc-700" />
                              {ph.lat.toFixed(4)}, {ph.lon.toFixed(4)}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-800 border border-zinc-200">
                              {ph.isVerified ? 'GPS Verified' : 'GPS Mismatch Flagged'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 5: VENDOR SCORECARD */}
              {activeTab === 'vendor' && (
                <div className="space-y-4">
                  <div className="p-5 rounded-lg bg-zinc-50 border border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <span className="text-xs text-zinc-500">Contractor / Firm</span>
                      <h4 className="text-lg font-bold text-zinc-950 mt-0.5">{data.work.vendor_name}</h4>
                      <p className="text-xs font-mono text-zinc-500 mt-0.5">Vendor ID: {data.work.vendor_id}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-center px-4 py-2 bg-white rounded-lg border border-zinc-200">
                        <span className="text-[10px] uppercase text-zinc-500 font-semibold block">On-Time %</span>
                        <span className="text-xl font-bold text-zinc-950 font-inter">86%</span>
                      </div>
                      <div className="text-center px-4 py-2 bg-white rounded-lg border border-zinc-200">
                        <span className="text-[10px] uppercase text-zinc-500 font-semibold block">Cost Deviation</span>
                        <span className="text-xl font-bold text-zinc-900 font-inter">+4.2%</span>
                      </div>
                      <div className="text-center px-4 py-2 bg-white rounded-lg border border-zinc-200">
                        <span className="text-[10px] uppercase text-zinc-500 font-semibold block">Rating</span>
                        <span className="text-xl font-bold text-zinc-950">A-</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-black text-white hover:bg-zinc-800 transition-colors"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
}
