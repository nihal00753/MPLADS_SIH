'use client';

import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle } from 'lucide-react';

interface SLATimerProps {
  deadline: string | Date;
  status?: string;
  className?: string;
}

export function SLATimer({ deadline, status, className = '' }: SLATimerProps) {
  const [timeLeftStr, setTimeLeftStr] = useState<string>('');
  const [hoursLeft, setHoursLeft] = useState<number>(48);
  const [isOverdue, setIsOverdue] = useState<boolean>(false);

  useEffect(() => {
    const calculateTime = () => {
      const now = new Date().getTime();
      const target = new Date(deadline).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setIsOverdue(true);
        setTimeLeftStr('OVERDUE');
        setHoursLeft(0);
        return;
      }

      setIsOverdue(false);
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setHoursLeft(hours);

      if (hours > 24) {
        const days = Math.floor(hours / 24);
        const remHours = hours % 24;
        setTimeLeftStr(`${days}d ${remHours}h left`);
      } else {
        setTimeLeftStr(`${hours}h ${minutes}m ${seconds}s`);
      }
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  if (status === 'ACTIONED' || status === 'DISMISSED') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 ${className}`}>
        <Clock className="w-3.5 h-3.5 text-emerald-500" />
        <span>Resolved</span>
      </span>
    );
  }

  // Vibrant SLA status styles
  let badgeStyle = 'bg-blue-50 text-blue-700 border-blue-200';
  let iconClass = 'text-blue-500';
  let isPulsing = false;

  if (isOverdue) {
    badgeStyle = 'bg-rose-600 text-white font-bold border-rose-700 shadow-sm';
    iconClass = 'text-white';
    isPulsing = true;
  } else if (hoursLeft < 12) {
    badgeStyle = 'bg-rose-50 text-rose-700 border-rose-300 font-semibold';
    iconClass = 'text-rose-600';
    isPulsing = true;
  } else if (hoursLeft < 24) {
    badgeStyle = 'bg-amber-50 text-amber-800 border-amber-300 font-medium';
    iconClass = 'text-amber-600';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border ${badgeStyle} ${className}`}
      title={new Date(deadline).toLocaleString()}
    >
      {isPulsing ? <AlertCircle className={`w-3.5 h-3.5 ${iconClass}`} /> : <Clock className={`w-3.5 h-3.5 ${iconClass}`} />}
      <span>{timeLeftStr}</span>
    </span>
  );
}
