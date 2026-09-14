'use client';

import React from 'react';
import { Bot, UserCheck, ArrowRight, ShieldAlert, Paperclip, XCircle, Send } from 'lucide-react';
import { RiskBadge } from './RiskBadge';
import { SLATimer } from './SLATimer';

export interface AlertData {
  id: string;
  workId: string;
  workTitle: string;
  workCategory: string;
  district: string;
  state: string;
  mpName?: string;
  sanctionAmount: number;
  spentAmount: number;
  riskScore: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
  source: 'AI_FLAGGED' | 'CITIZEN_REPORTED';
  status: 'OPEN' | 'ACTIONED' | 'ESCALATED' | 'DISMISSED';
  slaDeadline: string;
  vendorId?: string;
  vendorName?: string;
}

interface AlertCardProps {
  alert: AlertData;
  onInvestigate: (alert: AlertData) => void;
  onAction?: (alert: AlertData) => void;
  onEscalate?: (alert: AlertData) => void;
  onDismiss?: (alert: AlertData) => void;
  onAttachEvidence?: (alert: AlertData) => void;
  userRole?: string;
}

export function AlertCard({
  alert,
  onInvestigate,
  onAction,
  onEscalate,
  onDismiss,
  onAttachEvidence,
  userRole = 'DISTRICT',
}: AlertCardProps) {
  const isCitizen = alert.source === 'CITIZEN_REPORTED';

  const severityBorder =
    alert.severity === 'HIGH'
      ? 'border-l-4 border-l-rose-500'
      : alert.severity === 'MEDIUM'
      ? 'border-l-4 border-l-amber-500'
      : 'border-l-4 border-l-blue-500';

  return (
    <div
      className={`p-5 mb-3.5 bg-white border border-zinc-200 rounded-xl transition-all hover:border-zinc-300 ${severityBorder} text-zinc-900 shadow-sm`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Provenance Badge */}
          {isCitizen ? (
            alert.severity === 'HIGH' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-xs">
                <UserCheck className="w-3.5 h-3.5 text-rose-600" />
                CITIZEN HIGH RISK
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                Citizen Reported
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
              <Bot className="w-3.5 h-3.5 text-blue-600" />
              AI Flagged
            </span>
          )}

          {/* Risk Level Badge */}
          <RiskBadge severity={alert.severity} score={alert.riskScore} size="sm" />

          {/* Alert ID */}
          <span className="text-xs font-mono text-zinc-400">{alert.id}</span>
        </div>

        {/* Live SLA Countdown */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-[11px] text-zinc-500 font-medium">SLA:</span>
          <SLATimer deadline={alert.slaDeadline} status={alert.status} />
        </div>
      </div>

      {/* Main Body */}
      <div className="mt-3.5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-2">
          <div>
            <h4
              onClick={() => onInvestigate(alert)}
              className="text-sm font-semibold text-zinc-900 hover:text-black cursor-pointer transition-colors line-clamp-1"
            >
              {alert.workTitle}
            </h4>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-zinc-500">
              <span>
                Work ID: <strong className="font-mono text-zinc-800 font-medium">{alert.workId}</strong>
              </span>
              <span>•</span>
              <span>Category: <strong className="text-zinc-800 font-medium">{alert.workCategory}</strong></span>
              <span>•</span>
              <span>District: <strong className="text-zinc-800 font-medium">{alert.district}, {alert.state}</strong></span>
              {alert.vendorName && (
                <>
                  <span>•</span>
                  <span>Vendor: <strong className="text-zinc-800 font-medium">{alert.vendorName}</strong></span>
                </>
              )}
            </div>
          </div>

          <div className="text-left md:text-right shrink-0">
            <span className="text-xs text-zinc-500 block">Sanctioned Value</span>
            <span className="text-sm font-bold font-inter text-zinc-950">
              ₹{(alert.sanctionAmount / 100000).toFixed(2)} Lakh
            </span>
          </div>
        </div>

        {/* Explainable Flag Reason */}
        <div className="mt-3 p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-xs text-zinc-700 leading-relaxed flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
          <p className="flex-1 font-normal">{alert.reason}</p>
        </div>
      </div>

      {/* Action Strip */}
      <div className="mt-4 pt-3 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500">Status:</span>
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 text-zinc-800 border border-zinc-300">
            {alert.status}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onAttachEvidence && (
            <button
              onClick={() => onAttachEvidence(alert)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-zinc-700 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Paperclip className="w-3.5 h-3.5 text-zinc-500" />
              Evidence
            </button>
          )}

          {alert.status === 'OPEN' && onDismiss && (
            <button
              onClick={() => onDismiss(alert)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-zinc-500 hover:text-black hover:bg-zinc-100 border border-transparent transition-colors flex items-center gap-1 cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" />
              Dismiss
            </button>
          )}

          {alert.status === 'OPEN' && onEscalate && (
            <button
              onClick={() => onEscalate(alert)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-zinc-900 bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5 text-zinc-600" />
              Escalate
            </button>
          )}

          {alert.status === 'OPEN' && onAction && (
            <button
              onClick={() => onAction(alert)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg text-white shadow-sm transition-all cursor-pointer ${
                alert.severity === 'HIGH'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              Action Case
            </button>
          )}

          <button
            onClick={() => onInvestigate(alert)}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            Investigate
            <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
          </button>
        </div>
      </div>
    </div>
  );
}
