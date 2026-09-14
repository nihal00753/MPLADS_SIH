'use client';

import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { TrendingUp, TrendingDown, LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: number | string;
  prefix?: string;
  suffix?: string;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    value: number | string;
    isPositive: boolean;
    label?: string;
  };
  statusColor?: 'cyan' | 'amber' | 'orange' | 'emerald' | 'rose';
  delay?: number;
}

export function KPICard({
  title,
  value,
  prefix = '',
  suffix = '',
  subtitle,
  icon: Icon,
  trend,
  statusColor = 'cyan',
  delay = 0,
}: KPICardProps) {
  const prefersReducedMotion = useReducedMotion();
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]+/g, ''));
  const isNumber = !isNaN(numericValue);

  const [displayValue, setDisplayValue] = useState<number>(0);

  useEffect(() => {
    if (prefersReducedMotion || !isNumber) {
      setDisplayValue(numericValue);
      return;
    }

    let startTimestamp: number | null = null;
    const duration = 800; // ms

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplayValue(numericValue * easeProgress);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }, [numericValue, isNumber, prefersReducedMotion]);

  const formattedDisplay = isNumber
    ? numericValue % 1 === 0
      ? Math.round(displayValue).toLocaleString('en-IN')
      : displayValue.toFixed(1)
    : value;

  const iconColorStyles = {
    cyan: 'bg-blue-50 text-blue-600 border-blue-200',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    amber: 'bg-amber-50 text-amber-600 border-amber-200',
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
    rose: 'bg-rose-50 text-rose-600 border-rose-200',
  };

  const activeIconStyle = iconColorStyles[statusColor] || 'bg-blue-50 text-blue-600 border-blue-200';

  return (
    <div
      className="p-5 flex flex-col justify-between bg-white border border-zinc-200 rounded-xl transition-all hover:border-zinc-300 shadow-sm"
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</span>
        {Icon && (
          <div className={`p-2 rounded-lg border ${activeIconStyle}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="text-3xl font-bold font-inter tracking-tight text-zinc-950 flex items-baseline gap-1">
          {prefix && <span className="text-xl font-normal text-zinc-500">{prefix}</span>}
          <span>{formattedDisplay}</span>
          {suffix && <span className="text-lg font-normal text-zinc-500">{suffix}</span>}
        </div>

        {(subtitle || trend) && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            {trend && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                  trend.isPositive
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-rose-50 border-rose-200 text-rose-700'
                }`}
              >
                {trend.isPositive ? <TrendingUp className="w-3 h-3 text-emerald-600" /> : <TrendingDown className="w-3 h-3 text-rose-600" />}
                {trend.value}
              </span>
            )}
            {subtitle && <span className="text-zinc-500 truncate">{subtitle}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
