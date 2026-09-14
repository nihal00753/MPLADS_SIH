'use client';

import React from 'react';
import { AlertTriangle, CheckCircle, Info, Flame } from 'lucide-react';

interface RiskBadgeProps {
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | string;
  score?: number;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function RiskBadge({ severity, score, showIcon = true, size = 'md' }: RiskBadgeProps) {
  const norm = (severity || 'LOW').toUpperCase();

  const styles = {
    HIGH: 'bg-rose-50 text-rose-700 border-rose-200 font-bold',
    CRITICAL: 'bg-rose-600 text-white border-rose-700 font-bold shadow-sm',
    MEDIUM: 'bg-amber-50 text-amber-800 border-amber-200 font-semibold',
    LOW: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-medium',
  };

  const icons = {
    HIGH: Flame,
    CRITICAL: Flame,
    MEDIUM: AlertTriangle,
    LOW: CheckCircle,
  };

  const activeStyle = styles[norm as keyof typeof styles] || 'bg-emerald-50 text-emerald-700 border-emerald-200';
  const IconComponent = icons[norm as keyof typeof icons] || Info;

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center rounded-md border ${activeStyle} ${sizeClasses[size]}`}
    >
      {showIcon && <IconComponent className={size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />}
      <span>{norm} RISK</span>
      {score !== undefined && (
        <span className="font-mono opacity-80 ml-0.5">({(score * 100).toFixed(0)}%)</span>
      )}
    </span>
  );
}
