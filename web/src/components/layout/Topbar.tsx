'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Shield,
  ChevronDown,
  LogOut,
  MapPin,
  Bot,
  Sparkles,
} from 'lucide-react';
import { NotificationBell } from '../ui/NotificationBell';

interface TopbarProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    scopeId?: string;
  };
}

function TopbarContent({ user }: TopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTabParam = searchParams.get('tab');
  const [isPersonaOpen, setIsPersonaOpen] = useState(false);

  const personas = [
    { name: 'Dr. Rajesh Deshmukh, IAS', role: 'DISTRICT', scope: 'Pune', email: 'district@mplads.gov.in' },
    { name: 'Shri Aashtikar Patil Nagesh Bapurao', role: 'MP', scope: 'HINGOLI', email: 'mp@mplads.gov.in' },
    { name: 'Dr. Saurabh Garg, IAS', role: 'MINISTRY', scope: 'National (MoSPI)', email: 'ministry@mplads.gov.in' },
    { name: 'Shri Vikram Kumar, IAS', role: 'STATE', scope: 'Maharashtra', email: 'state@mplads.gov.in' },
  ];

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  const handleSelectPersona = async (email: string) => {
    setIsPersonaOpen(false);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = data.redirectPath;
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <header className="sticky top-0 z-40 h-16 bg-white text-zinc-900 px-4 lg:px-6 flex items-center justify-between border-b border-zinc-200 shrink-0">
      {/* Left Section: Scope Pill & Current Page */}
      <div className="flex items-center gap-3 min-w-0 overflow-hidden">
        {/* Scope Pill */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50/70 border border-blue-200 text-xs font-medium text-blue-900 shrink-0">
          <MapPin className="w-3.5 h-3.5 text-blue-600" />
          <span className="truncate">Scope: <strong className="text-blue-950 font-bold">{user.scopeId || 'Union of India'}</strong></span>
        </div>

        {/* Current Dashboard Label */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-100 border border-zinc-200 text-xs text-zinc-700">
          <span className="text-zinc-500">Portal:</span>
          <span className="text-zinc-900 font-medium">
            {user.role === 'MINISTRY' ? 'Ministry Dashboard' : user.role === 'STATE' ? 'State Dashboard' : user.role === 'MP' ? 'MP Dashboard' : 'District Dashboard'}
          </span>
          {activeTabParam && (
            <>
              <span className="text-zinc-400">/</span>
              <span className="text-zinc-800 capitalize font-medium">{activeTabParam.replace('-', ' ')}</span>
            </>
          )}
        </div>

        {/* Live System Status */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-700 font-semibold">
          <span className="relative flex h-2 w-2 ml-0.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="mr-1">Guidelines Active</span>
        </div>
      </div>

      {/* Right Section: AI Copilot Button, Persona Switcher, User Profile */}
      <div className="flex items-center gap-3 shrink-0">
        {/* AI Copilot Quick Launch Button (Vibrant Violet / Indigo) */}
        <button
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('toggle-ai-copilot'));
            }
          }}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold text-xs shadow-sm transition-all hover:shadow cursor-pointer"
          title="Open MPLADS AI Copilot Chatbot"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-200" />
          <span>Ask Copilot</span>
        </button>

        {/* Notification Bell */}
        <NotificationBell />

        {/* 1-Click Persona Switcher */}
        <div className="relative">
          <button
            onClick={() => setIsPersonaOpen(!isPersonaOpen)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-xs font-medium text-zinc-800 transition-colors cursor-pointer"
            title="Switch demo persona"
          >
            <Shield className="w-3.5 h-3.5 text-zinc-600" />
            <span className="hidden md:inline text-zinc-500">Role:</span>
            <span className="font-semibold text-zinc-900">{user.role}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${isPersonaOpen ? 'rotate-180' : ''}`} />
          </button>

          {isPersonaOpen && (
            <div className="absolute right-0 mt-2 w-72 rounded-xl bg-white border border-zinc-200 shadow-2xl z-50 p-2 text-zinc-900">
              <div className="px-3 py-2 border-b border-zinc-100 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Switch Active Role
                </span>
                <span className="text-[10px] bg-zinc-100 text-zinc-700 font-medium px-2 py-0.5 rounded">
                  Demo Fast-Switch
                </span>
              </div>
              <div className="space-y-1 mt-2">
                {personas.map((p) => (
                  <button
                    key={p.email}
                    onClick={() => handleSelectPersona(p.email)}
                    className={`w-full text-left p-2.5 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                      p.role === user.role
                        ? 'bg-zinc-100 text-black font-semibold border border-zinc-300'
                        : 'hover:bg-zinc-50 text-zinc-700'
                    }`}
                  >
                    <div>
                      <p className="leading-tight text-zinc-900">{p.name}</p>
                      <span className="text-[10px] text-zinc-500">{p.scope}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200 shrink-0 ml-2">
                      {p.role}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Avatar & Logout */}
        <div className="flex items-center gap-2 pl-2 border-l border-zinc-200">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-sm">
            {user.name.charAt(0)}
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-zinc-600 hover:text-black transition-colors cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

export function Topbar(props: TopbarProps) {
  return (
    <Suspense fallback={<div className="h-16 bg-white border-b border-zinc-200 w-full" />}>
      <TopbarContent {...props} />
    </Suspense>
  );
}
