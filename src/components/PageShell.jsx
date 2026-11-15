/**
 * PageShell.jsx
 * -------------
 * The outer layout for the Patient Portal.
 * Uses a soft gradient mesh background (Teal, Sky, Indigo) and glassmorphism.
 */
import { Stethoscope, Sparkles } from 'lucide-react';

export default function PageShell({ children }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-50/60 via-slate-50 to-indigo-50/50 flex flex-col font-sans selection:bg-teal-100 selection:text-teal-900">
      {/* ── Top Header Bar ─────────────────────────────────────── */}
      <header className="bg-white/85 backdrop-blur-md border-b border-slate-200/70 shadow-sm sticky top-0 z-20 transition-all">
        <div className="max-w-screen-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Stethoscope logo with vibrant gradient & glow */}
            <span className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 via-teal-600 to-indigo-600 text-white shadow-md shadow-teal-500/25 ring-2 ring-teal-100/80">
              <Stethoscope size={22} className="drop-shadow-xs" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-extrabold text-slate-800 text-sm leading-tight tracking-tight">
                  Smart Digital Queue
                </p>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Network
                </span>
              </div>
              <p className="text-slate-500 text-xs leading-tight truncate">
                Healthcare Queue Management System
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/doctor"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50/80 hover:bg-indigo-100/80 border border-indigo-200/60 px-3 py-1.5 rounded-xl transition-all shadow-2xs flex items-center gap-1"
            >
              Doctor Portal →
            </a>
          </div>
        </div>
      </header>

      {/* ── Main Content Area ───────────────────────────────────── */}
      <main className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {children}
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="text-center py-4 text-xs text-slate-400">
        Smart Digital Queue Management System &mdash; Modern Community Healthcare
      </footer>
    </div>
  );
}
