/**
 * LiveQueueScreen.jsx  (Doctor/Clinic Side)
 * ------------------------------------------
 * The main working screen for the doctor during a clinic session.
 *
 * Rich color-coded UI:
 *   - Active Consultation: Emerald/Teal glow card for Consulting, Amber/Gold card for Called
 *   - Skipped / No-Show Patients: Coral/Rose muted left-bordered cards
 *   - Waiting Queue: Elevated rows with next-patient highlight
 *   - Break Management: Crisp interactive pills
 */
import {
  Play,
  CheckCircle2,
  SkipForward,
  Coffee,
  Activity,
  Clock,
  Bell,
  AlertTriangle,
  RotateCcw,
  Phone,
  MapPin,
  ShieldCheck,
  UserCircle,
} from 'lucide-react';
import DoctorCard from '../components/DoctorCard';
import StatusBadge from '../components/StatusBadge';
import { DOCTOR_STATUS } from '../mockDoctorData';

export default function LiveQueueScreen({
  queue = [],
  doctorStatus,
  currentDoctor,
  onAction,
  onStatusChange,
}) {
  const consultingPatient = queue.find(t => t.status === 'consulting' || t.status === 'in_progress');
  const calledPatient     = queue.find(t => t.status === 'called');
  const activePatient     = consultingPatient || calledPatient;
  const waiting           = queue.filter(t => t.status === 'waiting');
  const skippedOrNoShow   = queue.filter(t => t.status === 'skipped' || t.status === 'no_show');
  const nextPatient       = waiting[0] ?? null;
  const isOnBreak         = doctorStatus === DOCTOR_STATUS.ON_BREAK || doctorStatus === 'on_break';
  const canCallPatient    = !activePatient && !isOnBreak;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header with Doctor Badge and Status ────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Live Queue</h2>
            {currentDoctor?.name && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-teal-800 bg-teal-100 border border-teal-200 px-3 py-1 rounded-full">
                <ShieldCheck size={14} className="text-teal-600" />
                <span>{currentDoctor.name}</span>
              </span>
            )}
          </div>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5 font-medium">
            {waiting.length} patient{waiting.length !== 1 ? 's' : ''} currently waiting in your queue
          </p>
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge status={doctorStatus} />
        </div>
      </div>

      {/* ── Break Management Bar ─────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {!isOnBreak ? (
          <button
            onClick={() => onStatusChange('on_break')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-amber-50 text-amber-900 border-2 border-amber-300 hover:bg-amber-100 hover:border-amber-400 transition-all shadow-xs"
          >
            <Coffee size={16} className="text-amber-600" />
            <span>Take Break</span>
          </button>
        ) : (
          <button
            onClick={() => onStatusChange('available')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-emerald-50 text-emerald-900 border-2 border-emerald-300 hover:bg-emerald-100 hover:border-emerald-400 transition-all shadow-xs animate-pulse"
          >
            <Activity size={16} className="text-emerald-600" />
            <span>Resume Work & Call Queue</span>
          </button>
        )}

        <div className="text-xs text-slate-500">
          {isOnBreak ? (
            <span className="text-amber-700 font-semibold">&bull; Doctor on break — queue paused</span>
          ) : (
            <span className="text-emerald-700 font-semibold">&bull; Doctor active & taking consultations</span>
          )}
        </div>
      </div>

      {/* ── On-break notice ─────────────────────────────────────── */}
      {isOnBreak && (
        <div className="flex items-start gap-3 bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 text-sm text-amber-900 shadow-sm">
          <Clock size={20} className="flex-shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-bold text-amber-950">Queue Paused — Doctor is on a Break</p>
            <p className="text-xs mt-0.5 text-amber-800">
              No new patients will be summoned during the break. Click <strong>Resume Work</strong> above to resume consultations.
            </p>
          </div>
        </div>
      )}

      {/* ── Current Patient / Consultation Action Card ───────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xl shadow-slate-200/50">
        <h3 className="font-extrabold text-slate-900 text-lg mb-4">
          {consultingPatient ? 'Consultation in Progress' : calledPatient ? 'Patient Called (Summoned)' : 'Current Consultation'}
        </h3>

        {activePatient ? (
          <div className="flex flex-col gap-4">
            {/* Active Token Banner with dynamic border & glow */}
            <div className={`flex flex-col sm:flex-row sm:items-center gap-4 p-5 rounded-2xl border-2 transition-all ${
              calledPatient
                ? 'border-l-6 border-l-amber-500 border-amber-200 bg-gradient-to-r from-amber-50/80 via-white to-amber-50/30 shadow-md shadow-amber-500/10'
                : 'border-l-6 border-l-emerald-500 border-emerald-200 bg-gradient-to-r from-emerald-50/80 via-white to-teal-50/30 shadow-md shadow-emerald-500/10'
            }`}>
              <div className="text-center sm:text-left flex-shrink-0">
                <span className="text-[10px] font-extrabold tracking-widest uppercase text-slate-400 block">
                  Active Token
                </span>
                <span className="text-4xl sm:text-5xl font-black text-slate-900 tracking-wider">
                  {activePatient.tokenNumber}
                </span>
              </div>

              <div className="flex-1 min-w-0 border-t sm:border-t-0 sm:border-l border-slate-200/80 pt-3 sm:pt-0 sm:pl-4">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-lg font-black text-slate-900 truncate">{activePatient.patientName}</span>
                  <StatusBadge status={activePatient.status} />
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${activePatient.bookingType === 'Phone' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {activePatient.bookingType}
                  </span>
                </div>
                {activePatient.place && (
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <MapPin size={12} className="text-slate-400" /> {activePatient.place}
                  </p>
                )}
              </div>
            </div>

            {/* Action buttons based on active state */}
            {activePatient.status === 'called' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => onAction('start', activePatient.id)}
                  className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-bold text-sm bg-gradient-to-r from-teal-600 via-teal-500 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white shadow-md shadow-teal-600/25 hover:shadow-lg transition-all"
                >
                  <Play size={17} /> Start Consultation
                </button>
                <button
                  onClick={() => onAction('skip', activePatient.id)}
                  className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-md shadow-amber-500/25 hover:shadow-lg transition-all"
                >
                  <SkipForward size={17} /> Skip / No-Show
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => onAction('complete', activePatient.id)}
                  className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/25 hover:shadow-lg transition-all"
                >
                  <CheckCircle2 size={17} /> Complete Consultation
                </button>
                <button
                  onClick={() => onAction('skip', activePatient.id)}
                  className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-md shadow-amber-500/25 hover:shadow-lg transition-all"
                >
                  <SkipForward size={17} /> Skip / No-Show
                </button>
              </div>
            )}

            {/* Next in line warning */}
            {nextPatient && (
              <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <AlertTriangle size={15} className="text-amber-500 flex-shrink-0" />
                <span>Next in line: <strong>{nextPatient.tokenNumber} ({nextPatient.patientName})</strong>. Finish or skip current consultation before calling next.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-8 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <UserCircle size={28} />
            </div>
            <div>
              <p className="font-bold text-slate-700 text-base">No active consultation in progress.</p>
              <p className="text-xs text-slate-400 mt-0.5">Call the next patient or wait for arrivals.</p>
            </div>

            {nextPatient && !isOnBreak && (
              <div className="flex flex-wrap justify-center gap-2.5 mt-2">
                <button
                  onClick={() => onAction('callNext', nextPatient.id)}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl text-sm font-bold shadow-md shadow-amber-500/20 hover:shadow-lg transition-all"
                >
                  <Bell size={17} /> Call Next Patient ({nextPatient.tokenNumber})
                </button>
                <button
                  onClick={() => onAction('start', nextPatient.id)}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-600 via-teal-500 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white rounded-xl text-sm font-bold shadow-md shadow-teal-600/20 hover:shadow-lg transition-all"
                >
                  <Play size={17} /> Start Consultation Immediately
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Waiting Queue ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-lg shadow-slate-200/40">
        <h3 className="font-extrabold text-slate-900 text-base mb-3">
          Waiting Queue ({waiting.length})
        </h3>

        {waiting.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-6">
            No patients waiting. Add walk-in patients or wait for online bookings.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {waiting.map((t, i) => (
              <div
                key={t.id}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all ${
                  i === 0
                    ? 'bg-teal-50/70 border-teal-300 shadow-xs ring-1 ring-teal-200'
                    : 'bg-slate-50/80 hover:bg-slate-100/70 border-slate-100 hover:-translate-y-0.5'
                }`}
              >
                <span
                  className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-black flex-shrink-0 ${
                    i === 0
                      ? 'bg-gradient-to-r from-teal-600 to-indigo-600 text-white shadow-xs'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {i + 1}
                </span>
                <span className={`font-black text-sm w-14 flex-shrink-0 ${i === 0 ? 'text-teal-900' : 'text-slate-800'}`}>
                  {t.tokenNumber}
                </span>
                <span className="text-slate-800 text-sm font-semibold flex-1 truncate">{t.patientName}</span>
                {t.place && <span className="text-slate-400 text-xs hidden sm:block truncate max-w-[100px]">{t.place}</span>}
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 ${
                    t.bookingType === 'Phone' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {t.bookingType}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recent Skipped / No-Show Patients (Coral/Rose Muted Cards) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-lg shadow-slate-200/40">
        <h3 className="font-extrabold text-slate-900 text-base mb-3">
          Recent Skipped / No-Show Patients ({skippedOrNoShow.length})
        </h3>

        {skippedOrNoShow.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-6">
            No skipped or no-show patients for this session.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {skippedOrNoShow.map((t) => {
              const timeFormatted = t.skippedAt
                ? new Date(t.skippedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : null;

              return (
                <div
                  key={t.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border-l-4 border-l-rose-500 border border-rose-200 bg-rose-50/40 shadow-xs"
                >
                  {/* Left: Patient info */}
                  <div className="flex items-start gap-3">
                    <span className="font-black text-base text-slate-800 bg-white border border-rose-200 px-2.5 py-1 rounded-lg">
                      {t.tokenNumber}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-slate-900 font-bold text-sm">{t.patientName}</span>
                        <StatusBadge status={t.status} />
                        {timeFormatted && (
                          <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                            <Clock size={11} /> {timeFormatted}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap font-medium">
                        {t.mobile && (
                          <span className="flex items-center gap-1">
                            <Phone size={12} className="text-slate-400" />
                            {t.mobile}
                          </span>
                        )}
                        {t.place && (
                          <span className="flex items-center gap-1">
                            <MapPin size={12} className="text-slate-400" />
                            {t.place}
                          </span>
                        )}
                        <span className="text-slate-400">&bull; Booking: {t.bookingType}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                    <button
                      onClick={() => onAction('restore', t.id)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-all shadow-xs"
                      title="Move patient back to Waiting queue"
                    >
                      <RotateCcw size={13} /> Restore to Waiting
                    </button>
                    <button
                      onClick={() => onAction('callNext', t.id)}
                      disabled={!canCallPatient}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all shadow-xs"
                      title={!canCallPatient ? 'Cannot call patient while another consultation is active or on break' : 'Call this patient now'}
                    >
                      <Bell size={13} /> Call Patient
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
