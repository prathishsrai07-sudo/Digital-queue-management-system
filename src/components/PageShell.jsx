/**
 * PageShell.jsx
 * -------------
 * The outer layout for the Patient Portal.
 * Clean, airy Modern Healthcare SaaS aesthetic with subtle dot-grid texture
 * and frosted-glass top navbar.
 */
import { Stethoscope } from 'lucide-react';

export default function PageShell({ children }) {
  return (
    <div className="min-h-screen saas-dot-grid flex flex-col font-sans selection:bg-teal-100 selection:text-teal-900 relative overflow-x-hidden">
      {/* ── Soft Pastel Ambient Light Halos ─────────────────────── */}
      <div
        className="fixed -top-32 -left-32 w-96 h-96 rounded-full pointer-events-none -z-10"
        style={{
          background: 'radial-gradient(circle, rgba(224, 242, 254, 0.75) 0%, rgba(240, 249, 255, 0.2) 70%, transparent 100%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        className="fixed -top-32 -right-32 w-96 h-96 rounded-full pointer-events-none -z-10"
        style={{
          background: 'radial-gradient(circle, rgba(209, 250, 229, 0.65) 0%, rgba(236, 253, 245, 0.2) 70%, transparent 100%)',
          filter: 'blur(60px)',
        }}
      />

      {/* ── Sleek Frosted Top Navbar ────────────────────────────── */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-white/80 border-b border-slate-200/70 shadow-xs transition-all">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Crisp Teal-Blue Stethoscope Badge */}
            <span className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-500 to-sky-600 text-white shadow-md shadow-teal-500/20 ring-2 ring-white">
              <Stethoscope size={22} className="drop-shadow-xs" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-extrabold text-[#0f172a] text-sm leading-tight tracking-tight">
                  Smart Digital Queue
                </p>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live System
                </span>
              </div>
              <p className="text-slate-500 text-xs font-medium leading-tight truncate">
                Digital Healthcare Queue Platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/doctor"
              className="text-xs font-bold text-slate-700 hover:text-teal-700 bg-white hover:bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-full transition-all shadow-2xs hover:shadow-xs flex items-center gap-1.5 group"
            >
              <span>Doctor Portal</span>
              <span className="text-teal-600 group-hover:translate-x-0.5 transition-transform">→</span>
            </a>
          </div>
        </div>
      </header>

      {/* ── Main Content Area ───────────────────────────────────── */}
      <main className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-4xl mx-auto">
          {children}
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="text-center py-6 text-xs text-slate-400 font-medium">
        Smart Digital Queue Management System &mdash; Modern Healthcare SaaS
      </footer>
    </div>
  );
}
