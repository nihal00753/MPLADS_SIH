'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  FileCheck,
  AlertOctagon,
  Users,
  ShieldCheck,
  BarChart3,
  Sliders,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Layers,
  Sparkles,
  Camera,
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  tabKey?: string;
  icon: any;
  badge?: string;
}

export const roleNavConfig: Record<string, NavItem[]> = {
  MP: [
    { name: 'Constituency Overview', href: '/dashboard/mp', tabKey: 'overview', icon: LayoutDashboard },
    { name: 'Sanctioned Works List', href: '/dashboard/mp?tab=works', tabKey: 'works', icon: FileCheck },
    { name: 'Transparency Scorecard', href: '/dashboard/mp?tab=scorecard', tabKey: 'scorecard', icon: ShieldCheck },
    { name: 'Press Brief Generator', href: '/dashboard/mp?tab=press', tabKey: 'press', icon: FileText },
    { name: 'Constituency Settings', href: '/dashboard/mp?tab=settings', tabKey: 'settings', icon: Settings },
  ],
  DISTRICT: [
    { name: 'Case Queue (Live)', href: '/dashboard/district', tabKey: 'queue', icon: AlertOctagon, badge: 'Active' },
    { name: 'Works & Audits', href: '/dashboard/district?tab=works', tabKey: 'works', icon: FileCheck },
    { name: 'Vendor Scorecards', href: '/dashboard/district?tab=vendors', tabKey: 'vendors', icon: Users },
    { name: 'Evidence Vault', href: '/dashboard/district?tab=evidence', tabKey: 'evidence', icon: Layers },
    { name: 'Action History Log', href: '/dashboard/district?tab=history', tabKey: 'history', icon: ShieldCheck },
  ],
  STATE: [
    { name: 'State Heatmap & Overview', href: '/dashboard/state', tabKey: 'overview', icon: LayoutDashboard },
    { name: 'District Comparisons', href: '/dashboard/state?tab=districts', tabKey: 'districts', icon: BarChart3 },
    { name: 'SLA Escalation Queue', href: '/dashboard/state?tab=escalations', tabKey: 'escalations', icon: AlertOctagon, badge: 'Urgent' },
    { name: 'Category Cost Benchmarks', href: '/dashboard/state?tab=benchmarks', tabKey: 'benchmarks', icon: Sliders },
  ],
  MINISTRY: [
    { name: 'National Overview', href: '/dashboard/ministry', tabKey: 'overview', icon: Landmark },
    { name: 'Top-N National Risk Queue', href: '/dashboard/ministry?tab=risk-queue', tabKey: 'risk-queue', icon: AlertOctagon },
    { name: 'Double-Funding Matrix', href: '/dashboard/ministry?tab=cross-scheme', tabKey: 'cross-scheme', icon: Layers },
    { name: 'National Debarment List', href: '/dashboard/ministry?tab=blacklist', tabKey: 'blacklist', icon: ShieldCheck },
    { name: 'Policy Sandbox Simulation', href: '/dashboard/ministry?tab=sandbox', tabKey: 'sandbox', icon: Sliders },
    { name: 'Audit Brief Generator', href: '/dashboard/ministry?tab=audit-brief', tabKey: 'audit-brief', icon: FileText },
  ],
  CITIZEN: [
    { name: 'Report Ground Status', href: '/dashboard/citizen', tabKey: 'report', icon: Camera, badge: 'Live GPS' },
    { name: 'Civic Works Directory', href: '/dashboard/citizen?tab=directory', tabKey: 'directory', icon: FileCheck },
    { name: 'My Ground Grievances', href: '/dashboard/citizen?tab=history', tabKey: 'history', icon: ShieldCheck },
  ],
};

interface SidebarProps {
  role?: string;
  isCollapsed: boolean;
  setIsCollapsed: (val: boolean) => void;
}

function SidebarContent({ role = 'DISTRICT', isCollapsed, setIsCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTabParam = searchParams.get('tab');
  const navItems = roleNavConfig[role] || roleNavConfig.DISTRICT;

  return (
    <aside
      className={`h-screen bg-white border-r border-zinc-200 transition-all duration-300 flex flex-col shrink-0 z-30 select-none ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-zinc-200 shrink-0">
        <Link href="/" className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
            M
          </div>
          {!isCollapsed && (
            <div className="truncate">
              <h1 className="font-bold text-sm tracking-tight text-zinc-900 leading-tight">
                MPLADS <span className="text-blue-600 font-semibold">AI</span>
              </h1>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold block">
                Gov Intelligence
              </span>
            </div>
          )}
        </Link>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-zinc-600 hover:text-black transition-colors cursor-pointer"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Role Tag Pill */}
      {!isCollapsed && (
        <div className="px-3 py-2.5 border-b border-zinc-100">
          <div className="p-2 rounded-lg bg-zinc-50 border border-zinc-200 flex items-center justify-between">
            <span className="text-[11px] text-zinc-500">Clearance:</span>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 border border-blue-200 text-blue-700">
              {role}
            </span>
          </div>
        </div>
      )}

      {/* Navigation Items */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          const isBasePath = pathname === item.href.split('?')[0];

          let isActive = false;
          if (item.tabKey && activeTabParam) {
            isActive = isBasePath && activeTabParam === item.tabKey;
          } else if (!activeTabParam) {
            isActive = isBasePath && (idx === 0 || !item.tabKey || item.tabKey === 'queue' || item.tabKey === 'overview');
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors relative ${
                isActive
                  ? 'bg-blue-50/80 text-blue-700 font-semibold border border-blue-200'
                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-black'
              }`}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-blue-600" />
              )}
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  isActive ? 'text-blue-600' : 'text-zinc-500'
                }`}
              />
              {!isCollapsed && (
                <div className="flex-1 flex items-center justify-between truncate">
                  <span className="truncate">{item.name}</span>
                  {item.badge && (
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${
                      item.badge === 'Urgent'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </Link>
          );
        })}

        {/* Quick Portal Switcher inside Sidebar */}
        {!isCollapsed && (
          <div className="pt-4 mt-4 border-t border-zinc-200">
            <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-2">
              Cross-Portal Switch
            </span>
            <div className="grid grid-cols-2 gap-1.5 px-1">
              {[
                { label: 'District', href: '/dashboard/district', active: pathname.includes('district') },
                { label: 'MP', href: '/dashboard/mp', active: pathname.includes('/mp') },
                { label: 'State', href: '/dashboard/state', active: pathname.includes('state') },
                { label: 'Ministry', href: '/dashboard/ministry', active: pathname.includes('ministry') },
              ].map((p) => (
                <Link
                  key={p.label}
                  href={p.href}
                  className={`text-center py-1.5 rounded-md text-[11px] font-semibold border transition-all ${
                    p.active
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200'
                  }`}
                >
                  {p.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* System Status Footer */}
      {!isCollapsed && (
        <div className="p-3 border-t border-zinc-200 shrink-0">
          <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 flex items-center gap-2.5">
            <span className="relative flex h-2 w-2 ml-0.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <div className="flex-1 truncate">
              <p className="text-[11px] font-semibold text-zinc-900 truncate leading-none">
                System Status: Active
              </p>
              <span className="text-[10px] text-zinc-500">12,937 works monitored</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

export function Sidebar(props: SidebarProps) {
  return (
    <Suspense fallback={<aside className="h-screen w-64 bg-white border-r border-zinc-200 shrink-0" />}>
      <SidebarContent {...props} />
    </Suspense>
  );
}
