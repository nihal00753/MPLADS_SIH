'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Lock,
  Mail,
  ArrowRight,
  Landmark,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('district@mplads.gov.in');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const demoPersonas = [
    {
      role: 'DISTRICT',
      name: 'Dr. Rajesh Deshmukh, IAS',
      title: 'District Collector (Pune)',
      email: 'district@mplads.gov.in',
      badge: 'Case Queue & Audits',
    },
    {
      role: 'MP',
      name: 'Shri Aashtikar Patil',
      title: 'Member of Parliament (Hingoli)',
      email: 'mp@mplads.gov.in',
      badge: 'Transparency Scorecard',
    },
    {
      role: 'MINISTRY',
      name: 'Dr. Saurabh Garg, IAS',
      title: 'Secretary, MoSPI (New Delhi)',
      email: 'ministry@mplads.gov.in',
      badge: 'National Double-Funding Matrix',
    },
    {
      role: 'STATE',
      name: 'Shri Vikram Kumar, IAS',
      title: 'State Nodal Officer (Maharashtra)',
      email: 'state@mplads.gov.in',
      badge: 'Escalation & District Heatmap',
    },
    {
      role: 'CITIZEN',
      name: 'Citizen / Resident',
      title: 'Civic Auditor (Pune District)',
      email: 'citizen@mplads.gov.in',
      badge: 'Ground Geotag & Grievances',
    },
  ];

  const handleLogin = async (loginEmail?: string) => {
    setLoading(true);
    setError('');

    const targetEmail = loginEmail || email;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      router.push(data.redirectPath || '/dashboard/district');
    } catch (err: any) {
      setError(err.message || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 flex flex-col justify-center items-center p-4 relative">
      {/* Main Container */}
      <div className="w-full max-w-5xl z-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center my-8">
        {/* Left Column: Brand Story & Technological Edge */}
        <div className="lg:col-span-6 space-y-6 px-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold shadow-xs">
            <Landmark className="w-4 h-4 text-blue-600" />
            <span>Ministry of Statistics and Programme Implementation</span>
          </div>

          <div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-zinc-950 leading-tight">
              MPLADS <span className="text-blue-600 font-extrabold">INTELLIGENCE</span>
            </h1>
            <p className="mt-3 text-zinc-600 text-sm sm:text-base leading-relaxed">
              National Fund Integrity, Anomaly Detection & Transparency Intelligence System.
              Continuous audit over ₹19,000+ Crore in public infrastructure allocations.
            </p>
          </div>

          <div className="space-y-2.5 pt-2">
            {[
              'Pre-Sanction Risk Scoring & Cost Overrun Checks',
              'Automated Photo Geotag Verification & Site Duplicate Detection',
              'Contractor Network Analysis & Collusion Detection',
              'Cross-Scheme Double-Funding Detection (PMGSY / DMF / Smart Cities)',
            ].map((feat, i) => (
              <div key={i} className="flex items-center gap-2.5 text-xs text-zinc-700 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{feat}</span>
              </div>
            ))}
          </div>

          {/* Quick Persona Switcher for Evaluation */}
          <div className="pt-4 border-t border-zinc-200">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 block mb-2.5">
              1-Click Demo Evaluation Personas:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {demoPersonas.map((persona) => {
                const roleStyles = {
                  DISTRICT: 'hover:border-emerald-500 bg-white text-emerald-700 badge-emerald',
                  MP: 'hover:border-blue-500 bg-white text-blue-700 badge-blue',
                  MINISTRY: 'hover:border-violet-500 bg-white text-violet-700 badge-violet',
                  STATE: 'hover:border-amber-500 bg-white text-amber-700 badge-amber',
                };
                const badgeStyles = {
                  DISTRICT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                  MP: 'bg-blue-50 text-blue-700 border-blue-200',
                  MINISTRY: 'bg-violet-50 text-violet-700 border-violet-200',
                  STATE: 'bg-amber-50 text-amber-700 border-amber-200',
                };

                return (
                  <button
                    key={persona.email}
                    type="button"
                    onClick={() => {
                      setEmail(persona.email);
                      handleLogin(persona.email);
                    }}
                    className={`p-3 rounded-lg border border-zinc-200 bg-white text-left shadow-sm transition-all flex flex-col justify-between cursor-pointer ${
                      persona.role === 'DISTRICT' ? 'hover:border-emerald-400 hover:bg-emerald-50/30' :
                      persona.role === 'MP' ? 'hover:border-blue-400 hover:bg-blue-50/30' :
                      persona.role === 'MINISTRY' ? 'hover:border-violet-400 hover:bg-violet-50/30' :
                      'hover:border-amber-400 hover:bg-amber-50/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${badgeStyles[persona.role as keyof typeof badgeStyles]}`}>
                        {persona.role}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono truncate">{persona.badge}</span>
                    </div>
                    <p className="text-xs font-medium text-zinc-900 mt-2 truncate">{persona.name}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Solid Monochrome Login Card */}
        <div className="lg:col-span-6">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="p-8 rounded-xl bg-white border border-zinc-200 shadow-xl relative"
          >
            <div className="mb-6">
              <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center mb-3 shadow-sm">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-zinc-950">National Single Sign-On</h2>
              <p className="text-xs text-zinc-500 mt-1">
                Enter authorized credentials. Jurisdictional role is resolved server-side.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                  Official Gov ID / Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. district@mplads.gov.in"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-xs text-zinc-900 bg-white placeholder-zinc-400 transition-all outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                  Security Passphrase / Token
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-xs text-zinc-900 bg-white placeholder-zinc-400 transition-all outline-none"
                  />
                </div>
                <div className="mt-1.5 flex justify-between items-center text-[11px] text-zinc-500">
                  <span>Demo password is prefilled</span>
                  <span className="font-mono text-zinc-700">admin123</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 px-4 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1"></div>
                    Authenticating & Resolving Role...
                  </>
                ) : (
                  <>
                    Authorize & Enter Command Center
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-zinc-200 text-center">
              <span className="text-[11px] text-zinc-500">
                Secured by Government of India Public Key Infrastructure & JWT RBAC.
              </span>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
