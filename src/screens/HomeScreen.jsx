/**
 * HomeScreen.jsx
 * --------------
 * The very first screen patients see.
 * Features:
 *   • Rich multi-color healthcare aesthetic
 *   • Get Token: Inviting Teal-to-Blue gradient accent card with glowing icon badge
 *   • Check Token: Distinct Violet/Indigo-to-Cyan accent card
 */
import { ClipboardList, Search, Stethoscope, Clock, ShieldCheck, Sparkles, ArrowRight } from 'lucide-react';

export default function HomeScreen({ onGetToken, onCheckToken }) {
  return (
    <div className="flex flex-col gap-6">
      {/* ── Hero Banner ─────────────────────────────────────────── */}
      <div className="text-center py-4">
        {/* Stethoscope glowing icon badge */}
        <div className="relative inline-flex items-center justify-center mb-4">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-teal-400 via-emerald-400 to-indigo-500 blur-lg opacity-40 animate-pulse" />
          <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-tr from-teal-500 via-emerald-500 to-indigo-600 text-white shadow-xl shadow-teal-500/25 ring-4 ring-white">
            <Stethoscope size={42} className="drop-shadow-sm" />
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold mb-3 shadow-xs">
          <Sparkles size={13} className="text-teal-600" />
          Fast, Free & Transparent Healthcare
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 leading-tight tracking-tight">
          Smart Digital Queue <span className="bg-gradient-to-r from-teal-600 to-indigo-600 bg-clip-text text-transparent">Management</span>
        </h1>
        <p className="text-slate-500 mt-2 text-sm max-w-sm mx-auto leading-relaxed">
          Skip the crowded waiting room. Book your digital token and know your estimated consultation window before you arrive.
        </p>
      </div>

      {/* ── Action Cards ────────────────────────────────────────── */}
      {/* Get Token: Inviting Teal-to-Blue gradient accent card */}
      <div className="relative group rounded-2xl p-6 bg-gradient-to-br from-white via-teal-50/40 to-sky-50/50 border-2 border-teal-200/90 shadow-lg shadow-teal-900/5 hover:shadow-xl hover:shadow-teal-900/10 hover:border-teal-300 hover:-translate-y-1 transition-all duration-200 flex flex-col gap-4 items-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white shadow-md shadow-teal-500/30 group-hover:scale-105 transition-transform">
          <ClipboardList size={28} />
        </div>
        <div>
          <span className="inline-block text-[11px] font-bold text-teal-700 bg-teal-100/80 px-2.5 py-0.5 rounded-full uppercase tracking-wider mb-1">
            New Patient Visit
          </span>
          <h2 className="font-bold text-slate-800 text-xl">Get Queue Token</h2>
          <p className="text-slate-600 text-sm mt-1 max-w-xs">
            Register your name, select your clinic and doctor, and receive your digital queue token in seconds.
          </p>
        </div>
        <button
          onClick={onGetToken}
          className="w-full py-4 px-6 rounded-xl font-bold text-base bg-gradient-to-r from-teal-600 via-teal-500 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white shadow-md shadow-teal-600/25 hover:shadow-lg hover:shadow-teal-600/30 transition-all active:scale-[0.99] flex items-center justify-center gap-2"
          aria-label="Get a new token"
        >
          <ClipboardList size={20} />
          Get Token
          <ArrowRight size={18} />
        </button>
      </div>

      {/* Check Token: Distinct Violet/Indigo-to-Cyan accent card */}
      <div className="relative group rounded-2xl p-6 bg-gradient-to-br from-white via-indigo-50/40 to-cyan-50/50 border-2 border-indigo-200/90 shadow-lg shadow-indigo-900/5 hover:shadow-xl hover:shadow-indigo-900/10 hover:border-indigo-300 hover:-translate-y-1 transition-all duration-200 flex flex-col gap-4 items-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/30 group-hover:scale-105 transition-transform">
          <Search size={28} />
        </div>
        <div>
          <span className="inline-block text-[11px] font-bold text-indigo-700 bg-indigo-100/80 px-2.5 py-0.5 rounded-full uppercase tracking-wider mb-1">
            Returning Patient
          </span>
          <h2 className="font-bold text-slate-800 text-xl">Check Token Status</h2>
          <p className="text-slate-600 text-sm mt-1 max-w-xs">
            Already have a token? Look up your estimated consultation time window and live doctor status.
          </p>
        </div>
        <button
          onClick={onCheckToken}
          className="w-full py-4 px-6 rounded-xl font-bold text-base bg-white hover:bg-indigo-50/80 text-indigo-700 border-2 border-indigo-600/80 shadow-sm hover:shadow-md hover:border-indigo-700 transition-all active:scale-[0.99] flex items-center justify-center gap-2"
          aria-label="Check existing token"
        >
          <Search size={20} />
          Check Token
          <ArrowRight size={18} />
        </button>
      </div>

      {/* ── Feature Highlights Strip ─────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2 py-2 text-center text-xs text-slate-500">
        <div className="flex flex-col items-center gap-1 p-2 bg-white/70 rounded-xl border border-slate-100/80 shadow-2xs">
          <Clock size={16} className="text-teal-600" />
          <span className="font-medium">Live ETA Range</span>
        </div>
        <div className="flex flex-col items-center gap-1 p-2 bg-white/70 rounded-xl border border-slate-100/80 shadow-2xs">
          <ShieldCheck size={16} className="text-indigo-600" />
          <span className="font-medium">No Account Needed</span>
        </div>
        <div className="flex flex-col items-center gap-1 p-2 bg-white/70 rounded-xl border border-slate-100/80 shadow-2xs">
          <Sparkles size={16} className="text-amber-500" />
          <span className="font-medium">100% Free</span>
        </div>
      </div>

      {/* ── Doctor Portal Link ───────────────────────────────────── */}
      <div className="text-center pt-1">
        <a
          href="/doctor"
          className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-indigo-600 font-semibold bg-white/80 border border-slate-200 px-4 py-2 rounded-xl shadow-xs hover:border-indigo-200 transition-all"
        >
          <span>Doctor or Clinic Staff?</span>
          <span className="text-indigo-600 underline">Sign in to Doctor Portal →</span>
        </a>
      </div>
    </div>
  );
}
