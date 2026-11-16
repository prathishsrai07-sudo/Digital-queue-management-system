/**
 * HomeScreen.jsx
 * --------------
 * Modern Light-Mode Healthcare SaaS Home Screen.
 * Features:
 *   • Compact, high-impact hero header with 3 trust-pill badges
 *   • 2-Column Side-by-Side Bento Action Cards on Desktop
 *     - Left: Get Token with 3-step micro-list & Teal-to-Sky CTA button
 *     - Right: Check Token with 3-item preview & Indigo-Blue CTA button
 */
import { Ticket, Search, Clock, ShieldCheck, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function HomeScreen({ onGetToken, onCheckToken }) {
  return (
    <div className="flex flex-col gap-8 w-full max-w-4xl mx-auto">
      {/* ── Compact, High-Impact Hero Header ─────────────────────── */}
      <div className="text-center pt-2 pb-1">
        {/* Subtle Brand Tag */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200/80 text-teal-800 text-xs font-semibold mb-3 shadow-2xs">
          <Sparkles size={13} className="text-teal-600" />
          <span>Next-Generation Healthcare SaaS</span>
        </div>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#0f172a] tracking-tight leading-tight">
          Smart Digital <span className="bg-gradient-to-r from-teal-600 via-teal-500 to-sky-600 bg-clip-text text-transparent">Queue Management</span>
        </h1>
        <p className="text-slate-600 mt-2.5 text-sm sm:text-base max-w-lg mx-auto font-medium">
          Skip crowded waiting rooms. Book online, track your turn live, and arrive right on time.
        </p>

        {/* 3 Clean Trust-Pill Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-xs font-medium text-slate-600">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/90 border border-slate-200/80 shadow-2xs">
            <ShieldCheck size={14} className="text-teal-600" />
            <span>No Login Required</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/90 border border-slate-200/80 shadow-2xs">
            <Clock size={14} className="text-sky-600" />
            <span>Live Time Range</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/90 border border-slate-200/80 shadow-2xs">
            <Ticket size={14} className="text-indigo-600" />
            <span>Instant Digital Token</span>
          </span>
        </div>
      </div>

      {/* ── 2-Column Side-by-Side Bento Action Cards on Desktop ──── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* Left Card — Get Token */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-lg shadow-sky-900/5 hover:-translate-y-1 transition-all duration-200 p-6 sm:p-8 flex flex-col justify-between saas-card">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100/80 shadow-2xs">
                <Ticket size={28} />
              </div>
              <span className="text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200/80 px-3 py-1 rounded-full uppercase tracking-wider">
                New Visit
              </span>
            </div>

            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Get Queue Token</h2>
            <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">
              Book a live consultation token in seconds with no account or pre-registration.
            </p>

            {/* Clear 3-step micro-list */}
            <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col gap-2.5">
              <div className="flex items-center gap-3 text-xs text-slate-700 font-medium">
                <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 text-[11px] font-bold flex items-center justify-center flex-shrink-0">1</span>
                <span>Select active clinic and available doctor</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-700 font-medium">
                <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 text-[11px] font-bold flex items-center justify-center flex-shrink-0">2</span>
                <span>Enter patient name & mobile number</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-700 font-medium">
                <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 text-[11px] font-bold flex items-center justify-center flex-shrink-0">3</span>
                <span>Receive instant digital token & ETA window</span>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <button
              onClick={onGetToken}
              className="w-full py-3.5 px-6 rounded-2xl font-bold text-sm bg-gradient-to-r from-teal-600 to-sky-600 hover:from-teal-700 hover:to-sky-700 text-white shadow-md shadow-teal-600/20 hover:shadow-lg transition-all flex items-center justify-center gap-2 group"
              aria-label="Get a new token"
            >
              <span>Get Queue Token</span>
              <ArrowRight size={17} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* Right Card — Check Token */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-lg shadow-indigo-900/5 hover:-translate-y-1 transition-all duration-200 p-6 sm:p-8 flex flex-col justify-between saas-card">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100/80 shadow-2xs">
                <Search size={28} />
              </div>
              <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-3 py-1 rounded-full uppercase tracking-wider">
                Returning Patient
              </span>
            </div>

            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Check Token Status</h2>
            <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">
              Already have a token? Check your live queue position and estimated window.
            </p>

            {/* Clear 3-item preview */}
            <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col gap-2.5">
              <div className="flex items-center gap-3 text-xs text-slate-700 font-medium">
                <CheckCircle2 size={16} className="text-indigo-600 flex-shrink-0" />
                <span>Live Status & currently serving token</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-700 font-medium">
                <CheckCircle2 size={16} className="text-indigo-600 flex-shrink-0" />
                <span>Clinic location & assigned doctor details</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-700 font-medium">
                <CheckCircle2 size={16} className="text-indigo-600 flex-shrink-0" />
                <span>Dynamic estimated consultation window</span>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <button
              onClick={onCheckToken}
              className="w-full py-3.5 px-6 rounded-2xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-md shadow-indigo-600/20 hover:shadow-lg transition-all flex items-center justify-center gap-2 group"
              aria-label="Check existing token"
            >
              <span>Check Token Status</span>
              <ArrowRight size={17} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Doctor Portal Link ───────────────────────────────────── */}
      <div className="text-center pt-1 pb-4">
        <a
          href="/doctor"
          className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-slate-800 font-medium bg-white/90 border border-slate-200/80 px-4 py-2 rounded-full shadow-2xs hover:shadow-xs transition-all"
        >
          <span>Doctor or Clinic Staff?</span>
          <span className="text-teal-700 font-semibold underline">Sign in to Doctor Portal →</span>
        </a>
      </div>
    </div>
  );
}
