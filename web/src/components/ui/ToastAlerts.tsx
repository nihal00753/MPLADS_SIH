'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, CheckCircle, Bell, X } from 'lucide-react';

interface Toast {
  id: string;
  title: string;
  message: string;
  type: 'warning' | 'alert' | 'success';
}

export function ToastAlerts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    // Scripted sequence of live toast alerts for presentation demo
    const scriptTimers = [
      setTimeout(() => {
        addToast({
          id: 't-1',
          title: 'New High-Risk Work Flagged',
          message: 'Work MPLW0000042 in Haveli block flagged for split-invoicing under ₹25L.',
          type: 'alert',
        });
      }, 8000),

      setTimeout(() => {
        addToast({
          id: 't-2',
          title: 'SLA Warning (< 12h Remaining)',
          message: 'District Collector action required on Alert ALT-10008 before State escalation.',
          type: 'warning',
        });
      }, 22000),

      setTimeout(() => {
        addToast({
          id: 't-3',
          title: 'Cross-Scheme Geo-Match Detected',
          message: '94% polygon overlap with PMGSY Rural Road Tender PMGSY-MH-2024.',
          type: 'alert',
        });
      }, 45000),
    ];

    return () => scriptTimers.forEach(clearTimeout);
  }, []);

  const addToast = (toast: Toast) => {
    setToasts((prev) => [...prev.slice(-2), toast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 6000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.12 } }}
            className="pointer-events-auto p-4 rounded-xl shadow-xl border border-zinc-200 bg-white text-zinc-900 flex items-start gap-3 text-xs"
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === 'alert' ? (
                <ShieldAlert className="w-5 h-5 text-black" />
              ) : toast.type === 'warning' ? (
                <Bell className="w-5 h-5 text-zinc-700" />
              ) : (
                <CheckCircle className="w-5 h-5 text-zinc-800" />
              )}
            </div>

            <div className="flex-1">
              <h5 className="font-bold text-sm leading-tight text-zinc-950">{toast.title}</h5>
              <p className="mt-1 text-zinc-600 leading-snug">{toast.message}</p>
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="text-zinc-400 hover:text-black p-1 rounded transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
