/**
 * DoctorPageShell.jsx
 * --------------------
 * Outer layout for the Doctor / Clinic Side.
 * Includes:
 *   - Deep slate/indigo glassmorphic header with stethoscope branding
 *   - Deep slate/indigo sidebar navigation with vibrant active tab pills
 *   - Bright, clean high-contrast main workspace for colorful cards and stats
 *   - Mobile bottom navigation
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
    <div className="min-h-screen bg-slate-100/60 flex flex-col font-sans selection:bg-teal-100 selection:text-teal-900">

      {/* ── Top Header ───────────────────────────────────────────── */}
      <header className="bg-slate-900/95 border-b border-slate-800 shadow-md sticky top-0 z-30 backdrop-blur-md text-white">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Hamburger (mobile only) */}
          <button
            className="md:hidden flex-shrink-0 p-1.5 rounded-xl text-slate-300 hover:bg-slate-800"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          {/* Logo & Branding */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 via-teal-600 to-indigo-600 text-white shadow-md shadow-teal-500/25 ring-2 ring-teal-500/30">
              <Stethoscope size={22} />
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-extrabold text-white text-sm leading-tight tracking-tight truncate">
                  Smart Digital Queue
                </p>
                <span className="hidden sm:inline-block bg-teal-950 text-teal-300 border border-teal-800/80 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  Doctor Portal
                </span>
              </div>
              <p className="text-slate-400 text-xs leading-tight truncate">
                {clinicName || 'Clinic Queue Management Console'}
              </p>
            </div>
          </div>

          {/* Right Header: Doctor Badge & Logout */}
          <div className="flex items-center gap-3">
            {doctorName && (
              <div className="hidden sm:flex items-center gap-2 bg-slate-800/80 border border-slate-700/80 rounded-full px-3.5 py-1 text-xs font-semibold text-teal-300 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{doctorName}</span>
              </div>
            )}

            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-800/40 text-red-300 text-xs font-semibold transition-all shadow-2xs flex-shrink-0"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile slide-down nav ────────────────────────────────── */}
      {menuOpen && (
        <div className="md:hidden bg-slate-900 border-b border-slate-800 shadow-xl z-20">
          <nav className="px-4 py-3 flex flex-col gap-1.5">
            {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => { onNav(key); setMenuOpen(false); }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left
                  ${activeNav === key
                    ? 'bg-gradient-to-r from-teal-500 to-indigo-600 text-white shadow-md shadow-teal-500/25'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
              >
                <Icon size={18} /> {label}
              </button>
            ))}
            <button
              onClick={() => { onLogout(); setMenuOpen(false); }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-red-400 hover:bg-red-950/40 text-left mt-1 border-t border-slate-800"
            >
              <LogOut size={18} /> Logout
            </button>
          </nav>
        </div>
      )}

      {/* ── Body: deep slate sidebar + content ───────────────────── */}
      <div className="flex flex-1 max-w-screen-xl mx-auto w-full">

        {/* Desktop Deep Slate/Indigo Sidebar */}
        <aside className="hidden md:flex flex-col w-60 flex-shrink-0 py-6 px-3.5 gap-1.5 bg-slate-900 border-r border-slate-800/90 shadow-sm text-slate-300">
          <div className="px-3 pb-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Navigation
          </div>

          {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onNav(key)}
              className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all text-left ${
                activeNav === key
                  ? 'bg-gradient-to-r from-teal-500 via-teal-600 to-indigo-600 text-white shadow-md shadow-teal-500/25'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white hover:translate-x-0.5'
              }`}
            >
              <Icon size={18} className={activeNav === key ? 'text-white' : 'text-slate-400'} />
              <span>{label}</span>
            </button>
          ))}

          <div className="mt-auto pt-4 border-t border-slate-800">
            <button
              onClick={onLogout}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-red-400 hover:bg-red-950/40 hover:text-red-300 w-full text-left transition-all"
            >
              <LogOut size={18} /> Logout
            </button>
          </div>
        </aside>

        {/* Main Workspace Area */}
        <main className="flex-1 px-4 sm:px-6 py-6 min-w-0 bg-gradient-to-br from-slate-50 via-white to-indigo-50/20">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom navigation ─────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 border-t border-slate-800 z-30 backdrop-blur-md">
        <div className="flex">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onNav(key)}
              className={`flex-1 flex flex-col items-center py-2.5 gap-1 text-xs font-semibold transition-all ${
                activeNav === key
                  ? 'text-teal-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon size={19} className={activeNav === key ? 'text-teal-400' : ''} />
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
