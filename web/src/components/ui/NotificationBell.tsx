'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, Clock, ShieldAlert } from 'lucide-react';

interface NotificationItem {
  id: string;
  type: 'NEW_ALERT' | 'SLA_WARNING' | 'ESCALATED' | 'DIGEST' | string;
  message: string;
  workId?: string;
  read: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    fetch('/api/notifications', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setUnreadCount(data.unreadCount || 0);
          setNotifications(data.notifications || []);
        }
      })
      .catch((err) => console.warn('Polling notifications error:', err));
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 25000); // Poll every 25 seconds

    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      clearInterval(interval);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const markAsRead = async (id: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (e) {
      console.error(e);
    }
  };

  const markAllAsRead = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      await fetch(`/api/notifications/read-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg bg-white hover:bg-zinc-100 text-zinc-700 hover:text-black border border-zinc-200 shadow-sm transition-all focus:outline-none cursor-pointer"
        title="Notifications & SLA Warnings"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black text-[9px] font-bold text-white ring-1 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white border border-zinc-200 shadow-2xl z-50 text-zinc-900 overflow-hidden animate-in fade-in duration-150">
          <div className="p-3.5 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-zinc-700" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900">Operational Alerts & SLA</h4>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-[11px] text-zinc-500 hover:text-black underline font-medium cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500">
                No active notifications or SLA warnings.
              </div>
            ) : (
              notifications.map((n) => {
                const isSla = n.type === 'SLA_WARNING';
                return (
                  <div
                    key={n.id}
                    onClick={() => !n.read && markAsRead(n.id)}
                    className={`p-3.5 text-xs transition-colors cursor-pointer hover:bg-zinc-50 flex items-start gap-2.5 ${
                      !n.read ? 'bg-zinc-50/80 font-medium' : 'text-zinc-600'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isSla ? (
                        <ShieldAlert className="w-4 h-4 text-zinc-700" />
                      ) : (
                        <Clock className="w-4 h-4 text-zinc-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-zinc-900 leading-snug">{n.message}</p>
                      <span className="text-[10px] text-zinc-500 mt-1 block font-mono">
                        {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {!n.read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-black shrink-0 mt-1.5" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
