/**
 * DoctorPageShell.jsx
 * --------------------
 * Outer layout for the Doctor / Clinic Side.
 * Modern Light-Mode Healthcare SaaS design:
 *   - Crisp pure white header with teal-sky stethoscope branding
 *   - Pure white sidebar over a soft #f1f5f9 canvas
 *   - Soft-tinted sky active navigation pill highlights
 *   - Spacious, bright hospital-SaaS aesthetic
 */
import { Stethoscope, LayoutDashboard, ListOrdered, UserPlus, CalendarClock, Settings, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';

const NAV_ITEMS = [
  { key: 'dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
  { key: 'queue',      label: 'Live Queue',   icon: ListOrdered },
  { key: 'addPatient', label: 'Add Patient',  icon: UserPlus },
  { key: 'doctors',    label: 'My Schedule',  icon: CalendarClock },
  { key: 'settings',   label: 'Settings',     icon: Settings },
];

export default function DoctorPageShell({ children, activeNav, onNav, onLogout, doctorName, clinicName }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex flex-col font-sans selection:bg-teal-100 selection:text-teal-900 text-slate-800">

      {/* ── Top Header (Crisp Light Frosted Navbar) ──────────────── */}
      <header className="bg-white/95 border-b border-slate-200 shadow-xs sticky top-0 z-30 backdrop-blur-md text-slate-800">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Hamburger (mobile only) */}
          <button
            className="md:hidden flex-shrink-0 p-1.5 rounded-xl text-slate-500 hover:bg-slate-100"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          {/* Logo & Branding */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-500 via-teal-600 to-sky-600 text-white shadow-md shadow-teal-500/20 ring-2 ring-white">
              <Stethoscope size={22} className="drop-shadow-xs" />
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-extrabold text-[#0f172a] text-sm leading-tight tracking-tight truncate">
                  Smart Digital Queue
                </p>
                <span className="hidden sm:inline-block bg-sky-50 text-sky-700 border border-sky-200/80 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  Doctor Portal
                </span>
              </div>
              <p className="text-slate-500 text-xs leading-tight truncate">
                {clinicName || 'Clinic Queue Management Console'}
              </p>
            </div>
          </div>

          {/* Right Header: Doctor Badge & Logout */}
          <div className="flex items-center gap-3">
            {doctorName && (
              <div className="hidden sm:flex items-center gap-2 bg-slate-100 border border-slate-200/80 rounded-full px-3.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{doctorName}</span>
              </div>
            )}

            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-700 border border-slate-200 hover:border-red-200 text-slate-600 text-xs font-semibold transition-all shadow-2xs flex-shrink-0"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile slide-down nav ────────────────────────────────── */}
      {menuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 shadow-xl z-20">
          <nav className="px-4 py-3 flex flex-col gap-1.5">
            {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => { onNav(key); setMenuOpen(false); }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left
                  ${activeNav === key
                    ? 'bg-sky-50 text-sky-700 font-bold border-l-4 border-sky-600 pl-3'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                <Icon size={18} className={activeNav === key ? 'text-sky-600' : 'text-slate-400'} /> {label}
              </button>
            ))}
            <button
              onClick={() => { onLogout(); setMenuOpen(false); }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 text-left mt-1 border-t border-slate-100"
            >
              <LogOut size={18} /> Logout
            </button>
          </nav>
        </div>
      )}

      {/* ── Body: Pure White Sidebar + #f1f5f9 Content ─────────────── */}
      <div className="flex flex-1 max-w-screen-xl mx-auto w-full">

        {/* Desktop Pure White Light-Mode Sidebar */}
        <aside className="hidden md:flex flex-col w-64 flex-shrink-0 py-6 px-3.5 gap-1.5 bg-white border-r border-slate-200 shadow-xs text-slate-600">
          <div className="px-3 pb-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Navigation
          </div>

          {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onNav(key)}
              className={`flex items-center gap-3 py-3 text-sm transition-all text-left ${
                activeNav === key
                  ? 'bg-sky-50 text-sky-700 font-bold border-l-4 border-sky-600 rounded-r-xl rounded-l-none pl-3 pr-4 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-xl px-3.5 font-medium hover:translate-x-0.5'
              }`}
            >
              <Icon size={18} className={activeNav === key ? 'text-sky-600' : 'text-slate-400'} />
              <span>{label}</span>
            </button>
          ))}

          <div className="mt-auto pt-4 border-t border-slate-100">
            <button
              onClick={onLogout}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600 w-full text-left transition-all"
            >
              <LogOut size={18} /> Logout
            </button>
          </div>
        </aside>

        {/* Main Workspace Area */}
        <main className="flex-1 px-4 sm:px-6 py-6 min-w-0 bg-[#f1f5f9]">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom navigation ─────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 border-t border-slate-200 z-30 backdrop-blur-md">
        <div className="flex">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onNav(key)}
              className={`flex-1 flex flex-col items-center py-2.5 gap-1 text-xs font-semibold transition-all ${
                activeNav === key
                  ? 'text-sky-600 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon size={19} className={activeNav === key ? 'text-sky-600' : ''} />
              <span className="text-[10px] leading-tight">{label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Mobile spacing spacer */}
      <div className="md:hidden h-16" />
    </div>
  );
}
