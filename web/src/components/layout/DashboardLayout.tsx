'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ToastAlerts } from '../ui/ToastAlerts';
import { AIChatbot } from '../ui/AIChatbot';

interface DashboardLayoutProps {
  children: React.ReactNode;
  requiredRole?: string;
}

export function DashboardLayout({ children, requiredRole }: DashboardLayoutProps) {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check authentication from localStorage
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    if (!token || !storedUser) {
      router.push('/login');
      return;
    }

    try {
      const parsed = JSON.parse(storedUser);
      setUser(parsed);

      if (requiredRole && parsed.role !== requiredRole && parsed.role !== 'MINISTRY') {
        // Redirect if role is not authorized
        router.push(`/dashboard/${parsed.role.toLowerCase()}`);
        return;
      }
      setLoading(false);
    } catch (e) {
      router.push('/login');
    }
  }, [router, requiredRole]);

  if (loading || !user) {
    return (
      <div className="h-screen w-screen bg-[#fafafa] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-semibold text-zinc-600 tracking-wider uppercase">
            Verifying National Clearance & RBAC Token...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#fafafa] text-zinc-900 flex overflow-hidden relative">
      {/* Permanently Fixed Sidebar */}
      <Sidebar
        role={user.role}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
      />

      {/* Main Column: Fixed Topbar + Scrollable Main Content */}
      <div className="flex-1 flex flex-col h-screen min-w-0 z-10 relative overflow-hidden">
        {/* Permanently Fixed Navbar at Top */}
        <Topbar user={user} />

        {/* Scrollable Viewport for Main Page */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 max-w-7xl w-full mx-auto">
          {children}
          {/* Bottom spacing for aesthetics */}
          <div className="h-12" />
        </main>
      </div>

      {/* Real-time simulation toast alerts */}
      <ToastAlerts />

      {/* Floating Grounded AI Copilot Chatbot */}
      <AIChatbot />
    </div>
  );
}
