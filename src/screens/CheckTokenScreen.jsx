/**
 * CheckTokenScreen.jsx
 * --------------------
 * Lets a returning patient look up their active token by mobile number.
 * Displays results with the digital ticket aesthetic and warm Amber/Emerald time range box.
 */
import { useState } from 'react';
import { Search, Clock, MapPin, Phone, UserCircle, Hash, Loader2, AlertCircle } from 'lucide-react';
import { getActiveTokensByMobile } from '../services/dbService';
import { getEstimatedTimeRange } from '../mockData';
import Card from '../components/Card';
import Button from '../components/Button';
import InputField from '../components/InputField';
import StepHeader from '../components/StepHeader';

export default function CheckTokenScreen({ onBack }) {
  const [mobile, setMobile]     = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [results, setResults]   = useState([]);  // array: one mobile can have multiple tokens
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    setSearched(false);
    setResults([]);

    // Normalize: strip all spaces then validate
    const trimmed = mobile.replace(/\s+/g, '').trim();
    const mobileRegex = /^[6-9]\d{9}$/;

    if (!trimmed) {
      setError('Please enter your mobile number.');
      return;
    }
    if (!mobileRegex.test(trimmed)) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setError('');
    setLoading(true);

    const { data, error: checkErr } = await getActiveTokensByMobile(trimmed);
    setLoading(false);
    setSearched(true);

    if (checkErr) {
      setError(checkErr.message || 'Unable to check tokens right now.');
      setResults([]);
    } else {
      setResults(data || []);
    }
  };

  // Allow pressing Enter to search
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <Card className="shadow-2xl shadow-slate-200/80 border-slate-100">
      <StepHeader
        title="Check Your Token"
        subtitle="Enter your mobile number to view your active token and time window."
        onBack={onBack}
      />

      {/* ── Mobile Input ─────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <InputField
          id="check-mobile"
          label="Mobile Number"
          type="tel"
          placeholder="Enter your 10-digit mobile number"
          maxLength={10}
          value={mobile}
          onChange={(e) => {
            setMobile(e.target.value);
            if (error) setError('');
            if (searched) setSearched(false);
          }}
          onKeyDown={handleKeyDown}
          error={error}
          autoFocus
        />

        <Button onClick={handleSearch} disabled={loading} className="w-full gap-2 py-3.5">
          {loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Search size={18} />
          )}
          {loading ? 'Searching Active Tokens…' : 'Search Token'}
        </Button>
      </div>

      {/* ── Result Area ──────────────────────────────────── */}
      {searched && (
        <div className="mt-6">
          {results.length > 0 ? (
            <div className="flex flex-col gap-5">
              {results.map((record, idx) => {
                const tokenNum = record.token_number || record.tokenNumber || `token-${idx}`;
                return (
                  <TokenResult key={`${tokenNum}-${idx}`} record={record} />
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 bg-slate-50/70 rounded-2xl border border-slate-100 p-4">
              <span className="text-3xl mb-2 inline-block">🔍</span>
              <p className="font-bold text-slate-700 text-sm">No active token found for this number.</p>
              <p className="mt-1 text-xs text-slate-500 max-w-xs mx-auto">
                Make sure you entered the same 10-digit mobile number used when booking your queue token today.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Sub-component: renders one digital ticket card ─────────────────────────────
function TokenResult({ record }) {
  const tokenNumber = record.token_number || record.tokenNumber || '';
  const clinicName  = record.clinic_name || record.clinicName || record.clinic?.name || 'Clinic';
  const clinicPlace = record.clinic_place || record.clinicPlace || record.place || record.clinic?.place || '';
  const clinicMobile = record.clinic_mobile || record.clinicMobile || record.clinic?.mobile || '';
  const doctorName  = record.doctor_name || record.doctorName || record.doctor?.name || 'Doctor Assigned';
  const doctorSpec  = record.doctor_spec ||
                      record.doctorSpec ||
                      record.specialization ||
                      record.specialisation ||
                      record.doctor_specialization ||
                      record.doctor?.specialization ||
                      record.doctor?.specialisation ||
                      '';
  const doctorAvail = String(
    record.doctor_availability ||
    record.doctorAvailability ||
    record.availability ||
    record.doctor?.availability ||
    'available'
  ).toLowerCase();
  const isDocUnavail = doctorAvail === 'unavailable';
  const isDocOnBreak = doctorAvail === 'on_break';
  const status      = record.status || 'waiting';

  // Compute adaptive estimated time window based on queue position
  const queuePos = record.queue_position ?? record.positionIndex ?? 0;
  const timeRange = getEstimatedTimeRange(queuePos);

  const getStatusBadge = () => {
    switch (status) {
      case 'called':
        return {
          label: 'Called (Please Enter)',
          style: 'bg-amber-100 text-amber-800 border-amber-300',
          dot: 'bg-amber-500 animate-bounce',
        };
      case 'consulting':
        return {
          label: 'Consultation In Progress',
          style: 'bg-teal-100 text-teal-800 border-teal-300',
          dot: 'bg-teal-500 animate-ping',
        };
      case 'skipped':
      case 'no_show':
        return {
          label: 'Skipped / No-Show',
          style: 'bg-rose-100 text-rose-800 border-rose-300',
          dot: 'bg-rose-500',
        };
      case 'waiting':
      default:
        return {
          label: 'In Queue (Waiting)',
          style: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          dot: 'bg-emerald-500 animate-pulse',
        };
    }
  };

  const badge = getStatusBadge();

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-lg shadow-slate-200/50 bg-white">
      {/* Ticket Header Banner */}
      <div className="bg-gradient-to-r from-teal-600 via-teal-500 to-indigo-600 px-4 py-3 text-white flex items-center justify-between">
        <span className="text-xs font-bold text-teal-100 uppercase tracking-wider truncate max-w-[200px]">
          {clinicName}
        </span>
        <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold text-white border border-white/30 flex-shrink-0">
          Digital Token
        </span>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {/* Token Number Box with Live Status Badge */}
        <div className="flex flex-col items-center justify-center py-5 bg-gradient-to-b from-slate-50 to-teal-50/20 rounded-xl border border-slate-100 relative">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            Token Number
          </span>
          <p className="text-5xl font-black text-slate-800 tracking-wider my-0.5">
            {tokenNumber}
          </p>
          <span className={`inline-flex items-center gap-1.5 border text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider mt-1 ${badge.style}`}>
            <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>
        </div>

        {/* ── Estimated Consultation Window Highlight Box (Amber / Emerald) ── */}
        <div className="bg-gradient-to-br from-amber-50/80 via-emerald-50/60 to-teal-50/80 border-2 border-emerald-400/80 rounded-2xl p-4 shadow-sm flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-emerald-600 flex items-center justify-center text-white flex-shrink-0 shadow-md shadow-emerald-500/20">
            <Clock size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
              Estimated Consultation Window
            </span>
            <p className="text-lg font-black text-slate-900 tracking-tight">
              {status === 'skipped' || status === 'no_show'
                ? 'Missed Turn — Please visit reception'
                : timeRange}
            </p>
            {status !== 'skipped' && status !== 'no_show' && (
              isDocUnavail ? (
                <p className="text-[11px] text-amber-900 font-medium mt-1.5 leading-snug bg-amber-100/80 px-2.5 py-1.5 rounded-lg border border-amber-200">
                  Doctor is currently unavailable / yet to start — estimated range will update once consultation begins
                </p>
              ) : isDocOnBreak ? (
                <p className="text-[11px] text-amber-900 font-medium mt-1.5 leading-snug bg-amber-100/80 px-2.5 py-1.5 rounded-lg border border-amber-200">
                  Doctor is currently on a short break — estimated range will resume shortly
                </p>
              ) : (
                <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                  Plan to arrive 5–10 minutes before this window.
                </p>
              )
            )}
          </div>
        </div>

        {/* Doctor and Clinic Details */}
        <div className="space-y-2.5 bg-slate-50/80 p-3.5 rounded-xl border border-slate-100 text-xs">
          <DetailRow
            icon={<UserCircle size={16} className="text-indigo-600" />}
            label="Doctor"
            value={doctorName}
            sub={doctorSpec}
            badge={
              isDocUnavail ? {
                label: 'Yet to Arrive',
                style: 'bg-rose-50 text-rose-700 border-rose-200',
                dot: 'bg-rose-500',
              } : isDocOnBreak ? {
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

          {(record.patientName || record.patient_name) && (
            <DetailRow
              icon={<Hash size={16} className="text-teal-600" />}
              label="Patient"
              value={record.patientName || record.patient_name}
            />
          )}

          <div className="flex items-start gap-2.5 pt-2 border-t border-slate-200/60">
            <MapPin size={16} className="text-indigo-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Clinic Place</p>
              <p className="text-xs font-semibold text-slate-800">{clinicPlace || clinicName}</p>
              {clinicMobile && (
                <a
                  href={`tel:${clinicMobile}`}
                  className="flex items-center gap-1 text-teal-700 hover:text-teal-800 font-semibold hover:underline mt-0.5"
                >
                  <Phone size={10} />
                  {clinicMobile}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Status guidance note */}
        {status === 'skipped' || status === 'no_show' ? (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-900 flex items-start gap-2">
            <AlertCircle size={16} className="text-rose-600 flex-shrink-0 mt-0.5" />
            <span>
              Your token was skipped because you were not present when called. Please contact the clinic reception immediately to restore your turn.
            </span>
          </div>
        ) : (
          <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <span>
              Estimated windows update dynamically as earlier consultations conclude. Keep this page open or re-check anytime.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value, sub, badge }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <div className="flex flex-col min-w-0">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{label}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-xs font-bold text-slate-800 leading-snug">{value}</p>
          {badge && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${badge.style}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
              {badge.label}
            </span>
          )}
        </div>
        {sub && <p className="text-[11px] text-teal-700 font-medium">{sub}</p>}
      </div>
    </div>
  );
}
