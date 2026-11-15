/**
 * TokenConfirmationScreen.jsx
 * ---------------------------
 * Final step of the "Get Token" flow.
 * Digital ticket aesthetic with:
 *   • Gradient header banner with live status badge
 *   • Large prominent Token Number (e.g. T001)
 *   • Warm Amber/Emerald highlight box for the Estimated Consultation Window
 *   • Full clinic and doctor details
 */
import { CheckCircle2, Clock, Phone, UserCircle, Hash, Sparkles, AlertCircle } from 'lucide-react';
import Button from '../components/Button';
import { getEstimatedTimeRange } from '../mockData';

const MOCK_POSITION = 4;

export default function TokenConfirmationScreen({ token, patient, onDone }) {
  const timeRange = getEstimatedTimeRange(MOCK_POSITION);
  const doctorAvail = token.doctor?.availability || token.doctorAvailability;
  const isUnavail = doctorAvail === 'unavailable';
  const isOnBreak = doctorAvail === 'on_break';

  return (
    <div className="flex flex-col gap-5">
      {/* ── Success Celebration Banner ────────────────────────────── */}
      <div className="flex flex-col items-center text-center gap-2 py-2">
        <div className="relative inline-flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-emerald-400 blur-md opacity-30 animate-pulse" />
          <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25">
            <CheckCircle2 size={32} />
          </div>
        </div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight mt-1">Token Confirmed!</h2>
        <p className="text-slate-500 text-sm max-w-xs">
          Your digital appointment ticket is ready. Save or screenshot this screen.
        </p>
      </div>

      {/* ── Digital Ticket Container ──────────────────────────────── */}
      <div className="bg-white/95 rounded-3xl shadow-xl shadow-slate-200/70 border border-slate-200/80 overflow-hidden backdrop-blur-md">
        {/* Ticket Header Banner */}
        <div className="bg-gradient-to-r from-teal-600 via-teal-500 to-indigo-600 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-ping" />
            <span className="text-xs uppercase tracking-widest font-extrabold text-teal-100">
              Active Digital Queue Ticket
            </span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-xs text-[11px] font-bold text-white border border-white/30">
            Today's Session
          </span>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {/* Token Display Box */}
          <div className="flex flex-col items-center justify-center py-6 px-4 bg-gradient-to-b from-slate-50 via-teal-50/20 to-indigo-50/20 rounded-2xl border border-slate-100 relative">
            <span className="text-xs font-bold text-teal-700 uppercase tracking-widest bg-teal-100/70 px-3 py-1 rounded-full mb-1">
              Your Queue Token
            </span>
            <div className="text-5xl sm:text-6xl font-black tracking-widest text-slate-900 drop-shadow-xs my-1">
              {token.tokenNumber}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Checked into Live Queue</span>
            </div>
          </div>

          {/* ── Perforation divider ───────────────────────────────── */}
          <div className="relative flex items-center justify-center my-1">
            <div className="w-full border-t-2 border-dashed border-slate-200" />
            <span className="absolute bg-white px-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Consultation Window
            </span>
          </div>

          {/* ── Estimated Consultation-Time Range Box (Amber / Emerald Highlight) ── */}
          <div className="bg-gradient-to-br from-amber-50/80 via-emerald-50/60 to-teal-50/80 border-2 border-emerald-400/80 rounded-2xl p-4 shadow-sm flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-amber-500 to-emerald-600 flex items-center justify-center text-white flex-shrink-0 shadow-md shadow-emerald-500/20">
              <Clock size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                  Estimated Consultation Window
                </span>
                <span className="text-[10px] font-semibold bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded-full">
                  Live Speed ETA
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                {timeRange}
              </p>
              {isUnavail ? (
                <p className="text-xs text-amber-900 font-medium mt-1.5 leading-snug bg-amber-100/80 px-2.5 py-1.5 rounded-lg border border-amber-200">
                  Doctor is currently unavailable / yet to start — estimated range will update once consultation begins
                </p>
              ) : isOnBreak ? (
                <p className="text-xs text-amber-900 font-medium mt-1.5 leading-snug bg-amber-100/80 px-2.5 py-1.5 rounded-lg border border-amber-200">
                  Doctor is currently on a short break — estimated range will resume shortly
                </p>
              ) : (
                <p className="text-xs text-slate-600 mt-1 leading-snug">
                  Please plan to reach the clinic 5–10 minutes before this window.
                </p>
              )}
            </div>
          </div>

          {/* ── Details List ──────────────────────────────────────── */}
          <div className="space-y-3 bg-slate-50/80 p-4 rounded-2xl border border-slate-100 text-sm">
            <DetailRow
              icon={<UserCircle size={18} className="text-indigo-600" />}
              label="Doctor"
              value={token.doctor.name}
              sub={token.doctor.specialisation || token.doctor.specialization}
              badge={
                isUnavail ? {
                  label: 'Yet to Arrive',
                  style: 'bg-rose-50 text-rose-700 border-rose-200',
                  dot: 'bg-rose-500',
                } : isOnBreak ? {
                  label: 'On Break',
                  style: 'bg-amber-50 text-amber-800 border-amber-200',
                  dot: 'bg-amber-500',
                } : {
                  label: 'Available',
                  style: 'bg-emerald-50 text-emerald-800 border-emerald-200',
                  dot: 'bg-emerald-500 animate-pulse',
                }
              }
            />

            <ClinicRow clinic={token.clinic} />

            <DetailRow
              icon={<Hash size={18} className="text-teal-600" />}
              label="Patient Name"
              value={patient.name}
            />
          </div>

          {/* Advisory Notice */}
          <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Advisory:</strong> Consultation durations vary depending on each patient's medical needs. Your estimated window updates dynamically in real time.
            </span>
          </div>
        </div>
      </div>

      {/* ── Back to Home ────────────────────────────────────────── */}
      <Button variant="outline" onClick={onDone} className="w-full">
        Done &bull; Back to Home
      </Button>
    </div>
  );
}

function ClinicRow({ clinic }) {
  return (
    <div className="flex items-start gap-3 pt-2 border-t border-slate-200/60">
      <span className="mt-0.5 flex-shrink-0 text-indigo-600">
        <Phone size={18} />
      </span>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">Clinic</p>
        <p className="text-sm font-bold text-slate-800">{clinic.name}</p>
        {clinic.place && <p className="text-xs text-slate-500">{clinic.place}</p>}
        {clinic.mobile && (
          <a
            href={`tel:${clinic.mobile}`}
            className="flex items-center gap-1 text-teal-700 hover:text-teal-800 text-xs font-semibold hover:underline w-fit mt-0.5"
          >
            <Phone size={11} className="flex-shrink-0" />
            {clinic.mobile}
          </a>
        )}
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value, sub, badge }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">{label}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-slate-800 leading-snug">{value}</p>
          {badge && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.style}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
              {badge.label}
            </span>
          )}
        </div>
        {sub && <p className="text-xs text-teal-700 font-medium">{sub}</p>}
      </div>
    </div>
  );
}
