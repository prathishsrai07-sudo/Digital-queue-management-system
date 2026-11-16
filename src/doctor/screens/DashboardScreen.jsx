/**
 * DashboardScreen.jsx  (Doctor/Clinic Side)
 * -------------------------------------------
 * Overview dashboard shown immediately after login.
 * Shows:
 *   - Multi-doctor switcher (when clinic has multiple doctors)
 *   - Clinic details (name, place, mobile)
 *   - Active Doctor name, specialisation, duty timing
 *   - Current status with animated pills
 *   - Multi-color distinct KPI stat cards (Current Token = Indigo/Violet, Waiting = Amber/Orange, Served = Emerald/Teal)
 */
import { Users, Phone, MapPin, Clock, Hash, Activity, CalendarClock, ArrowRight, UserCircle, ShieldCheck } from 'lucide-react';
import DoctorCard from '../components/DoctorCard';
import StatusBadge from '../components/StatusBadge';
import { DOCTOR_STATUS } from '../mockDoctorData';

export default function DashboardScreen({
  session,
  currentDoctor,
  queue = [],
  doctorStatus,
  servedToday = 0,
  onStatusChange,
  onNav,
}) {
  const waitingTokens    = queue.filter(t => t.status === 'waiting');
  const calledToken      = queue.find(t => t.status === 'called');
  const inProgressToken  = queue.find(t => t.status === 'consulting' || t.status === 'in_progress');
  const currentPatient   = inProgressToken || calledToken;

  const currentDoctorName = currentDoctor?.name || session?.doctorName || 'Doctor';
  const currentDoctorSpec = currentDoctor?.specialization || currentDoctor?.specialisation || session?.specialisation;
  const currentDutyStart  = currentDoctor?.dutyStart || session?.dutyStart;
  const currentDutyEnd    = currentDoctor?.dutyEnd || session?.dutyEnd;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Page title & Doctor Badge ────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard</h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5 font-medium">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Doctor Session Isolation Badge */}
        <div className="flex items-center gap-2 bg-white/90 border border-slate-200/90 rounded-2xl px-3.5 py-1.5 shadow-sm">
          <ShieldCheck size={16} className="text-teal-600 flex-shrink-0" />
          <span className="text-xs font-bold text-slate-700">{currentDoctorName}</span>
          <span className="text-[10px] font-semibold bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full border border-teal-200">
            Isolated Doctor Session
          </span>
        </div>
      </div>

      {/* ── Doctor / Clinic Info Card ────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xl shadow-slate-200/50">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          {/* Avatar with rich gradient ring */}
          <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 via-teal-600 to-indigo-600 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-teal-500/25 ring-4 ring-teal-50">
            {currentDoctorName?.charAt(0) ?? 'D'}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5 mb-1">
              <h3 className="text-xl font-black text-slate-900 tracking-tight">{currentDoctorName}</h3>
              <StatusBadge status={doctorStatus} />
            </div>

            {currentDoctorSpec && (
              <p className="text-teal-700 text-sm font-semibold">{currentDoctorSpec}</p>
            )}

            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5 text-xs text-slate-600">
              <span className="flex items-center gap-1.5 font-medium">
                <MapPin size={14} className="text-indigo-600" />
                {session?.clinicName || 'Clinic'} {session?.clinicPlace ? `• ${session.clinicPlace}` : ''}
              </span>
              {session?.clinicMobile && (
                <a href={`tel:${session.clinicMobile}`} className="flex items-center gap-1.5 text-teal-700 hover:text-teal-800 font-semibold hover:underline">
                  <Phone size={13} /> {session.clinicMobile}
                </a>
              )}
            </div>

            {currentDutyStart && currentDutyEnd && (
              <p className="flex items-center gap-1.5 text-xs text-slate-500 mt-2 font-medium">
                <CalendarClock size={14} className="text-slate-400" />
                Today's duty timings: <strong className="text-slate-700">{currentDutyStart} – {currentDutyEnd}</strong>
              </p>
            )}
          </div>
        </div>

        {/* Status change controls */}
        <div className="flex flex-wrap items-center gap-2.5 mt-5 pt-4 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Status:</span>
          {[
            {
              status: DOCTOR_STATUS.AVAILABLE,
              label: 'Available',
              color: 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 hover:border-emerald-400 shadow-2xs',
            },
            {
              status: DOCTOR_STATUS.ON_BREAK,
              label: 'Take Break',
              color: 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 hover:border-amber-400 shadow-2xs',
            },
            {
              status: DOCTOR_STATUS.UNAVAILABLE,
              label: 'Unavailable',
              color: 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100 hover:border-rose-400 shadow-2xs',
            },
          ].map(({ status, label, color }) => (
            <button
              key={status}
              onClick={() => onStatusChange(status)}
              disabled={doctorStatus === status}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${color}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI Stat Cards with Elevated Modern SaaS Style ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* 1. Current Token: Clean White Card with Sky Blue Squircle */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between saas-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Current Token
            </span>
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
              <Hash size={20} />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 font-mono">
              {currentPatient ? (currentPatient.tokenNumber || currentPatient.token_number || '—') : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-1.5 font-medium truncate">
              {currentPatient ? `${currentPatient.patientName || currentPatient.name || 'Patient'} (${currentPatient.status || 'Active'})` : 'No consultation active'}
            </p>
          </div>
        </div>

        {/* 2. Waiting Count: Clean White Card with Amber Squircle */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between saas-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Patients Waiting
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <Users size={20} />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 font-mono">
              {waitingTokens.length}
            </p>
            <p className="text-xs text-slate-500 mt-1.5 font-medium">
              In queue for this doctor session
            </p>
          </div>
        </div>

        {/* 3. Served Today: Clean White Card with Emerald Squircle */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between saas-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Served Today
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <Activity size={20} />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 font-mono">
              {servedToday}
            </p>
            <p className="text-xs text-slate-500 mt-1.5 font-medium">
              Completed consultations today
            </p>
          </div>
        </div>
      </div>

      {/* ── On-break notice ──────────────────────────────────────── */}
      {doctorStatus === DOCTOR_STATUS.ON_BREAK && (
        <div className="flex items-start gap-3 bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 text-sm text-amber-900 shadow-sm">
          <Clock size={20} className="flex-shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-bold text-amber-950">Queue Paused — Doctor is on a Break</p>
            <p className="text-xs mt-0.5 text-amber-800">
              The live queue is paused. When you return, click <strong>Available</strong> above to resume calling patients.
            </p>
          </div>
        </div>
      )}

      {/* ── Quick Actions ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-lg shadow-slate-200/40">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Quick Navigation</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => onNav('queue')}
            className="flex items-center justify-between px-5 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-teal-600 via-teal-500 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white shadow-md shadow-teal-600/20 hover:shadow-lg hover:-translate-y-0.5 transition-all"
          >
            <span>Open Live Queue</span>
            <ArrowRight size={17} />
          </button>
          <button
            onClick={() => onNav('addPatient')}
            className="flex items-center justify-between px-5 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/20 hover:shadow-lg hover:-translate-y-0.5 transition-all"
          >
            <span>Add Walk-In Patient</span>
            <ArrowRight size={17} />
          </button>
        </div>
      </div>

      {/* ── Waiting Queue Summary ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-lg shadow-slate-200/40">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-slate-900 text-base">Next Waiting Patients ({waitingTokens.length})</h3>
          {waitingTokens.length > 0 && (
            <button
              onClick={() => onNav('queue')}
              className="text-xs font-bold text-teal-700 hover:text-teal-800 hover:underline"
            >
              View Full Queue →
            </button>
          )}
        </div>

        {waitingTokens.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-6">No patients currently waiting in this queue.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {waitingTokens.slice(0, 5).map((t, i) => (
              <div key={t.id || i} className="flex items-center gap-3 px-3.5 py-3 bg-slate-50 hover:bg-teal-50/40 rounded-xl border border-slate-100 transition-all">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-teal-100 text-teal-800 text-xs font-extrabold flex-shrink-0">
                  {i + 1}
                </span>
                <span className="font-black text-slate-800 text-sm w-14">{t.tokenNumber || t.token_number}</span>
                <span className="text-slate-700 text-sm font-semibold flex-1 truncate">{t.patientName || t.name || 'Patient'}</span>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${(t.bookingType || t.booking_type) === 'phone' || (t.bookingType || t.booking_type) === 'Phone' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                  {t.bookingType || (t.booking_type === 'phone' ? 'Phone' : 'Online')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
