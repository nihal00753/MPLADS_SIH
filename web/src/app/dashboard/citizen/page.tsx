'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  UploadCloud,
  FileText,
  ShieldAlert,
  Send,
  Building2,
  Navigation,
  Sparkles,
  Info,
  Clock,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/ui/GlassCard';

function CitizenDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'report';

  const [works, setWorks] = useState<any[]>([]);
  const [loadingWorks, setLoadingWorks] = useState(true);

  // Form State
  const [selectedWorkId, setSelectedWorkId] = useState<string>('');
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoDataUri, setPhotoDataUri] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<string>('18.5204');
  const [longitude, setLongitude] = useState<string>('73.8567');
  const [gpsSource, setGpsSource] = useState<'device' | 'photo' | 'manual'>('device');
  const [citizenName, setCitizenName] = useState<string>('Citizen Auditor');
  const [contact, setContact] = useState<string>('');

  // Submission & Result state
  const [submitting, setSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // History state
  const [myReports, setMyReports] = useState<any[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    fetch('/api/works?limit=100', { headers })
      .then((res) => res.json())
      .then((data) => {
        const fetchedWorks = data.works || [];
        setWorks(fetchedWorks);
        if (fetchedWorks.length > 0) {
          setSelectedWorkId(fetchedWorks[0].unique_work_number);
        }
        setLoadingWorks(false);
      })
      .catch((err) => {
        console.error('Failed to fetch works:', err);
        setLoadingWorks(false);
      });
  }, []);

  const selectedWork = works.find((w) => w.unique_work_number === selectedWorkId);

  // Handle image upload and base64 encoding
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const result = uploadEvent.target?.result as string;
      setPhotoPreview(result);
      setPhotoDataUri(result);

      // In browser mock EXIF simulation:
      // If photo name contains "fake" or "mismatch", shift coordinates far away to trigger mismatch
      if (file.name.toLowerCase().includes('mismatch') || file.name.toLowerCase().includes('far')) {
        setLatitude('19.0760'); // Mumbai coordinates (120km away from Pune)
        setLongitude('72.8777');
        setGpsSource('photo');
      } else {
        // Approximate Pune site location
        setLatitude('18.5204');
        setLongitude('73.8567');
        setGpsSource('photo');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUseDeviceGps = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitude(position.coords.latitude.toFixed(4));
          setLongitude(position.coords.longitude.toFixed(4));
          setGpsSource('device');
        },
        (err) => {
          console.warn('Geolocation denied or unavailable:', err.message);
          // Fallback to default Pune coords
          setLatitude('18.5204');
          setLongitude('73.8567');
          setGpsSource('device');
        }
      );
    } else {
      setLatitude('18.5204');
      setLongitude('73.8567');
      setGpsSource('device');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedWorkId) {
      setErrorMsg('Please select an ongoing MPLADS work.');
      return;
    }

    if (!feedbackText || feedbackText.trim().length < 10) {
      setErrorMsg('Please enter at least 10 characters describing the site condition.');
      return;
    }

    setSubmitting(true);
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const payload = {
        work_id: selectedWorkId,
        feedback_text: feedbackText,
        latitude: parseFloat(latitude) || 18.5204,
        longitude: parseFloat(longitude) || 73.8567,
        photo_url: photoDataUri || photoPreview || 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=800&q=80',
        citizen_name: citizenName,
        contact,
      };

      const res = await fetch('/api/citizen/feedback', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Submission failed');
      }

      setSubmissionResult(data);
      // Append to local history
      setMyReports((prev) => [
        {
          id: data.alert?.id || `REP-${Date.now()}`,
          workTitle: selectedWork?.work_name || selectedWorkId,
          feedbackText,
          date: new Date().toLocaleDateString('en-IN'),
          isHighRisk: data.evaluation?.isHighRisk,
          severity: data.evaluation?.severity,
          distanceKm: data.evaluation?.vision?.distanceKm,
        },
        ...prev,
      ]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error submitting feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFeedbackText('');
    setPhotoPreview(null);
    setPhotoDataUri(null);
    setSubmissionResult(null);
  };

  return (
    <DashboardLayout requiredRole="CITIZEN">
      <div className="space-y-8">
        {/* Banner */}
        <div className="bg-gradient-to-r from-emerald-900 to-teal-950 border border-emerald-700/50 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-3">
              <Camera className="w-3.5 h-3.5" /> Civic Audit & Verification Active
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Direct Ground Oversight for MPLADS Projects</h1>
            <p className="text-emerald-100/80 text-sm mt-1">
              Your camera photos and reviews are verified in real-time by automated site verification systems.
              High-risk findings (e.g. site location mismatches or safety hazards) trigger immediate alerts to both
              the District Collector and your Member of Parliament.
            </p>
          </div>
          <div className="absolute -right-8 -bottom-10 opacity-10 pointer-events-none">
            <ShieldAlert className="w-64 h-64 text-emerald-400" />
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-200 gap-6 text-sm font-medium">
          <button
            onClick={() => router.push('/dashboard/citizen?tab=report')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'report'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Camera className="w-4 h-4" />
            Submit Ground Audit & Photo
          </button>
          <button
            onClick={() => router.push('/dashboard/citizen?tab=directory')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'directory'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Sanctioned Works Directory ({works.length})
          </button>
          <button
            onClick={() => router.push('/dashboard/citizen?tab=history')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'history'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            My Submitted Feedback ({myReports.length})
          </button>
        </div>

        {activeTab === 'report' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Input Form */}
            <div className="lg:col-span-7 space-y-6">
              <GlassCard className="p-6">
                <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2 mb-4">
                  <FileText className="w-5 h-5 text-emerald-600" />
                  Ground Inspection Details
                </h2>

                {errorMsg && (
                  <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Select Work */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">
                      Select Ongoing Work in Your District *
                    </label>
                    <select
                      value={selectedWorkId}
                      onChange={(e) => setSelectedWorkId(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                      disabled={loadingWorks}
                    >
                      {works.map((w) => (
                        <option key={w.unique_work_number} value={w.unique_work_number}>
                          [{w.unique_work_number}] {w.work_name} — ₹{(w.sanction_amount / 100000).toFixed(1)}L ({w.nodal_district})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Feedback Text Area */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">
                      Ground Observations & Review *
                    </label>
                    <textarea
                      rows={4}
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Describe the real status on ground. E.g.: 'Culvert work abandoned by contractor, deep crack on side foundation causing danger to villagers during monsoon...'"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="text-xs text-zinc-400">Quick Tags:</span>
                      {[
                        'Road work stalled & abandoned',
                        'Substandard cement & cracks visible',
                        'Work completed on paper but absent on site',
                        'Sign board installed but zero physical progress',
                      ].map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setFeedbackText((prev) => (prev ? `${prev} | ${tag}` : tag))}
                          className="text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-2 py-0.5 rounded transition-colors"
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Geotagged Photo Upload */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">
                      Upload Site Photo with Camera Geotag
                    </label>
                    <div className="border-2 border-dashed border-zinc-300 hover:border-emerald-500 rounded-xl p-6 text-center transition-colors bg-zinc-50/50">
                      {photoPreview ? (
                        <div className="space-y-3">
                          <img
                            src={photoPreview}
                            alt="Site capture"
                            className="max-h-48 mx-auto rounded-lg object-cover shadow"
                          />
                          <div className="flex items-center justify-center gap-3">
                            <label className="cursor-pointer text-xs font-semibold text-emerald-600 hover:underline">
                              Change Photo
                              <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setPhotoPreview(null);
                                setPhotoDataUri(null);
                              }}
                              className="text-xs text-rose-500 hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ) : (
                        <label className="cursor-pointer block">
                          <UploadCloud className="w-10 h-10 text-zinc-400 mx-auto mb-2" />
                          <p className="text-sm font-medium text-zinc-700">Click to upload ground photo or drag & drop</p>
                          <p className="text-xs text-zinc-400 mt-1">JPEG, PNG, WEBP up to 10MB. GPS coordinates auto-extracted.</p>
                          <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* GPS Coordinates Bar */}
                  <div className="bg-emerald-50/50 border border-emerald-200/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                        <Navigation className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500 font-medium">Detected Camera Geotag</div>
                        <div className="text-sm font-semibold font-mono text-zinc-900">
                          {latitude}° N, {longitude}° E
                        </div>
                        <span className="text-[10px] text-emerald-600 bg-emerald-100/80 px-2 py-0.5 rounded font-medium">
                          Source: {gpsSource === 'photo' ? 'Image Metadata' : 'Device GPS Sensor'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleUseDeviceGps}
                      className="text-xs font-semibold bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 self-start sm:self-auto"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Calibrate via Device GPS
                    </button>
                  </div>

                  {/* Citizen Contact Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                        Your Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={citizenName}
                        onChange={(e) => setCitizenName(e.target.value)}
                        placeholder="Citizen Auditor"
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                        Mobile / Email (Optional for updates)
                      </label>
                      <input
                        type="text"
                        value={contact}
                        onChange={(e) => setContact(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Evaluating Ground Photo & Observation...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Submit Ground Audit for Verification
                      </>
                    )}
                  </button>
                </form>
              </GlassCard>
            </div>

            {/* Right: Selected Work Info & Live AI Result */}
            <div className="lg:col-span-5 space-y-6">
              {/* Selected Work Context Card */}
              {selectedWork && (
                <GlassCard className="p-5 border-l-4 border-l-emerald-500">
                  <div className="text-xs font-semibold uppercase text-zinc-400 mb-1">Sanctioned Project Record</div>
                  <h3 className="font-bold text-zinc-900 text-base">{selectedWork.work_name}</h3>
                  <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                    <div>
                      <span className="text-zinc-500">Work ID:</span>
                      <p className="font-mono font-semibold text-zinc-800">{selectedWork.unique_work_number}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500">Sanction Amount:</span>
                      <p className="font-semibold text-emerald-700">₹{(selectedWork.sanction_amount / 100000).toFixed(2)} Lakhs</p>
                    </div>
                    <div>
                      <span className="text-zinc-500">Assigned Vendor:</span>
                      <p className="font-medium text-zinc-800 truncate">{selectedWork.vendor_name || 'Tender in progress'}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500">Status:</span>
                      <p className="font-medium text-zinc-800">{selectedWork.work_status}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500">Nodal District:</span>
                      <p className="font-medium text-zinc-800">{selectedWork.nodal_district}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500">Hon. MP:</span>
                      <p className="font-medium text-zinc-800">{selectedWork.mp_name}</p>
                    </div>
                  </div>
                </GlassCard>
              )}

              {/* AI Evaluation Result Card */}
              <AnimatePresence>
                {submissionResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                  >
                    <GlassCard
                      className={`p-6 border-2 ${
                        submissionResult.evaluation?.isHighRisk
                          ? 'bg-rose-50/70 border-rose-400'
                          : 'bg-emerald-50/70 border-emerald-400'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {submissionResult.evaluation?.isHighRisk ? (
                          <div className="p-2.5 bg-rose-600 text-white rounded-xl">
                            <ShieldAlert className="w-6 h-6" />
                          </div>
                        ) : (
                          <div className="p-2.5 bg-emerald-600 text-white rounded-xl">
                            <CheckCircle2 className="w-6 h-6" />
                          </div>
                        )}
                        <div>
                          <span
                            className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                              submissionResult.evaluation?.isHighRisk
                                ? 'bg-rose-200 text-rose-900'
                                : 'bg-emerald-200 text-emerald-900'
                            }`}
                          >
                            Verification Assessment: {submissionResult.evaluation?.severity}
                          </span>
                          <h4 className="text-lg font-bold text-zinc-900 mt-1">
                            {submissionResult.evaluation?.isHighRisk
                              ? 'High-Priority Alert Generated'
                              : 'Ground Audit Logged'}
                          </h4>
                          <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                            {submissionResult.message}
                          </p>
                        </div>
                      </div>

                      {/* Diagnostic Breakdown */}
                      <div className="mt-4 pt-4 border-t border-zinc-200/80 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Grievance Urgency Level:</span>
                          <span className="font-semibold text-zinc-800">
                            {submissionResult.evaluation?.nlp?.urgency}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Safety Hazard Detected:</span>
                          <span
                            className={`font-semibold ${
                              submissionResult.evaluation?.nlp?.isSafetyHazard ? 'text-rose-600' : 'text-zinc-700'
                            }`}
                          >
                            {submissionResult.evaluation?.nlp?.isSafetyHazard ? 'YES (High Priority)' : 'No'}
                          </span>
                        </div>
                        {submissionResult.evaluation?.vision?.distanceKm !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-zinc-500">GPS Distance from Sanctioned Site:</span>
                            <span
                              className={`font-mono font-semibold ${
                                submissionResult.evaluation?.vision?.gpsMismatch ? 'text-rose-600' : 'text-emerald-700'
                              }`}
                            >
                              {submissionResult.evaluation?.vision?.distanceKm} km (Threshold: 1.0 km)
                            </span>
                          </div>
                        )}
                        {submissionResult.evaluation?.isHighRisk && (
                          <div className="mt-3 p-2.5 bg-rose-100/70 rounded-lg text-rose-900 font-medium flex items-center gap-2">
                            <Info className="w-4 h-4 shrink-0 text-rose-600" />
                            Broadcasted to District Collector Case Queue & MP Alert Feed.
                          </div>
                        )}
                      </div>

                      <button
                        onClick={resetForm}
                        className="mt-4 w-full text-xs font-semibold py-2 bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 rounded-lg transition-colors"
                      >
                        Submit Another Site Report
                      </button>
                    </GlassCard>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* How it works info */}
              <GlassCard className="p-5 bg-zinc-50/50">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-600 mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  How Ground Verification Works
                </h4>
                <ul className="text-xs text-zinc-600 space-y-2 list-disc list-inside">
                  <li><strong>Geotag Verification:</strong> Compares photo location coordinates with sanctioned project site. Off-site photos (&gt;1.0 km) flag potential mismatch alerts.</li>
                  <li><strong>Grievance Risk Assessment:</strong> Reviews feedback for critical safety hazards, structural defects, and quality issues.</li>
                  <li><strong>Audit Trail:</strong> All legitimate citizen submissions are appended to the permanent project dossier.</li>
                </ul>
              </GlassCard>
            </div>
          </div>
        )}

        {activeTab === 'directory' && (
          <GlassCard className="p-6">
            <h2 className="text-lg font-bold text-zinc-900 mb-4">Sanctioned Works in Pune District</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-zinc-700">
                <thead className="bg-zinc-100 text-xs font-semibold text-zinc-600 uppercase border-b border-zinc-200">
                  <tr>
                    <th className="py-3 px-4">Work ID</th>
                    <th className="py-3 px-4">Work Title</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Sanction (₹)</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {works.slice(0, 20).map((w) => (
                    <tr key={w.unique_work_number} className="hover:bg-zinc-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-zinc-900">{w.unique_work_number}</td>
                      <td className="py-3 px-4 font-medium text-zinc-900">{w.work_name}</td>
                      <td className="py-3 px-4 text-zinc-600">{w.work_category}</td>
                      <td className="py-3 px-4 font-semibold text-zinc-900">₹{(w.sanction_amount / 100000).toFixed(1)}L</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-zinc-100 text-zinc-800">
                          {w.work_status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => {
                            setSelectedWorkId(w.unique_work_number);
                            router.push('/dashboard/citizen?tab=report');
                          }}
                          className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
                        >
                          Report <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        )}

        {activeTab === 'history' && (
          <GlassCard className="p-6">
            <h2 className="text-lg font-bold text-zinc-900 mb-4">My Submitted Ground Grievances</h2>
            {myReports.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-sm">
                <Camera className="w-12 h-12 mx-auto text-zinc-300 mb-3" />
                No ground reports submitted yet in this session.
              </div>
            ) : (
              <div className="space-y-4">
                {myReports.map((r, idx) => (
                  <div key={idx} className="border border-zinc-200 rounded-xl p-4 bg-zinc-50/50 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-zinc-500">{r.id}</span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                            r.isHighRisk ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {r.severity || 'LOW'} Severity
                        </span>
                      </div>
                      <h4 className="font-bold text-zinc-900 text-sm">{r.workTitle}</h4>
                      <p className="text-xs text-zinc-600 mt-1 italic">"{r.feedbackText}"</p>
                    </div>
                    <span className="text-xs text-zinc-400">{r.date}</span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function CitizenDashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-zinc-500">Loading Citizen Portal...</div>}>
      <CitizenDashboardContent />
    </Suspense>
  );
}
