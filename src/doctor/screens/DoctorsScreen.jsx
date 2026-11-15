/**
 * DoctorsScreen.jsx  (Doctor/Clinic Side)
 * ----------------------------------------
 * "My Schedule" tab.
 * Strictly displays and manages the operational schedule and clinical timings
 * of the single logged-in doctor.
 *
 * One logged-in doctor can NEVER view or manage another doctor's schedule.
 */
import { useState, useEffect } from 'react';
import {
  Clock,
  Coffee,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Save,
} from 'lucide-react';
import DoctorCard from '../components/DoctorCard';
import StatusBadge from '../components/StatusBadge';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function DoctorsScreen({ session, currentDoctor, onSaveDoctor }) {
  const doctorId = currentDoctor?.id || session?.doctorId;
  const doctorName = currentDoctor?.name || session?.doctorName || 'Doctor';
  const doctorSpec = currentDoctor?.specialization || currentDoctor?.specialisation || session?.specialisation || 'Physician';
  const username = currentDoctor?.username || session?.username || 'doctor';

  const [form, setForm] = useState({
    availability: 'available',
    avgConsultationMinutes: '10',
    dutyStart: '09:00',
    dutyEnd: '17:00',
    breakStart: '13:00',
    breakEnd: '14:00',
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  });

  const [errors, setErrors]             = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError]   = useState('');
  const [successMsg, setSuccessMsg]     = useState('');

  // Sync state whenever currentDoctor or session updates
  useEffect(() => {
    if (currentDoctor || session) {
      setForm({
        availability: currentDoctor?.availability || session?.availability || 'available',
        avgConsultationMinutes: String(currentDoctor?.averageConsultationMinutes || currentDoctor?.avgConsultationMinutes || session?.avgConsultationMinutes || 10),
        dutyStart: currentDoctor?.dutyStart || session?.dutyStart || '09:00',
        dutyEnd: currentDoctor?.dutyEnd || session?.dutyEnd || '17:00',
        breakStart: currentDoctor?.breakStart || session?.breakStart || '',
        breakEnd: currentDoctor?.breakEnd || session?.breakEnd || '',
        workingDays: Array.isArray(currentDoctor?.workingDays) && currentDoctor.workingDays.length > 0
          ? currentDoctor.workingDays
          : (Array.isArray(session?.workingDays) && session.workingDays.length > 0 ? session.workingDays : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']),
      });
    }
  }, [currentDoctor, session]);

  const handleChange = (field) => (e) => {
    setForm(f => ({ ...f, [field]: e.target.value }));
    if (errors[field]) setErrors(errs => ({ ...errs, [field]: '' }));
    if (submitError) setSubmitError('');
  };

  const toggleDay = (day) => {
    setForm(f => {
      const exists = f.workingDays.includes(day);
      const updated = exists ? f.workingDays.filter(d => d !== day) : [...f.workingDays, day];
      return { ...f, workingDays: updated };
    });
    if (errors.workingDays) setErrors(e => ({ ...e, workingDays: '' }));
  };

  const validate = () => {
    const errs = {};
    const avg = parseInt(form.avgConsultationMinutes, 10);
    if (isNaN(avg) || avg <= 0 || avg > 120) {
      errs.avgConsultationMinutes = 'Average consultation time must be between 1 and 120 minutes.';
    }
    if (!form.dutyStart) errs.dutyStart = 'Duty start time is required.';
    if (!form.dutyEnd) errs.dutyEnd = 'Duty end time is required.';
    if (form.dutyStart && form.dutyEnd && form.dutyEnd <= form.dutyStart) {
      errs.dutyEnd = 'Duty end time must be after duty start time.';
    }

    const hasBreakStart = Boolean(form.breakStart && form.breakStart.trim());
    const hasBreakEnd   = Boolean(form.breakEnd && form.breakEnd.trim());
    if ((hasBreakStart && !hasBreakEnd) || (!hasBreakStart && hasBreakEnd)) {
      errs.breakEnd = 'Both break start and end times must be specified, or both left blank.';
    } else if (hasBreakStart && hasBreakEnd && form.breakEnd <= form.breakStart) {
      errs.breakEnd = 'Break end time must be after break start time.';
    }

    if (!form.workingDays || form.workingDays.length === 0) {
      errs.workingDays = 'Please select at least one working day.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate() || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError('');

    const payload = {
      id: doctorId,
      name: doctorName,
      specialization: doctorSpec,
      username: username,
      availability: form.availability,
      averageConsultationMinutes: parseInt(form.avgConsultationMinutes, 10) || 10,
      avgConsultationMinutes: parseInt(form.avgConsultationMinutes, 10) || 10,
      dutyStart: form.dutyStart,
      dutyEnd: form.dutyEnd,
      breakStart: form.breakStart && form.breakStart.trim() ? form.breakStart.trim() : null,
      breakEnd: form.breakEnd && form.breakEnd.trim() ? form.breakEnd.trim() : null,
      workingDays: form.workingDays,
    };

    if (onSaveDoctor) {
      const res = await onSaveDoctor(payload);
      setIsSubmitting(false);

      if (res?.error) {
        setSubmitError(res.error.message || 'Failed to save operational schedule.');
        return;
      }

      setSuccessMsg('Your schedule & operational timings were updated successfully!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } else {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">My Schedule</h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5 font-medium">
            Manage your duty timings, break periods, working days, and consultation pace
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white/90 border border-slate-200/90 rounded-2xl px-3.5 py-1.5 shadow-sm">
          <ShieldCheck size={16} className="text-teal-600 flex-shrink-0" />
          <span className="text-xs font-bold text-slate-700">{doctorName}</span>
          <StatusBadge status={form.availability} />
        </div>
      </div>

      {/* ── Success notification ─────────────────────────────────── */}
      {successMsg && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl p-3.5 text-green-800 text-sm shadow-sm">
          <CheckCircle2 size={18} className="text-green-600 flex-shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {/* ── Configure Schedule & Timings Form ──────────────────── */}
      <DoctorCard title="Operational Timings & Clinical Settings">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          {submitError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-800 text-sm">
              <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Read-only doctor identity banner */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500 to-indigo-600 text-white font-bold text-lg flex items-center justify-center shadow-sm">
                {doctorName.charAt(0)}
              </div>
              <div>
                <p className="font-bold text-slate-900 text-base leading-tight">{doctorName}</p>
                <p className="text-xs text-teal-700 font-semibold">{doctorSpec} &bull; @{username}</p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-full shadow-2xs w-fit">
              Credentials managed by Platform Admin
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Live Availability Status *">
              <select
                value={form.availability}
                onChange={handleChange('availability')}
                className="light-select w-full px-4 py-2.5 rounded-xl border border-slate-300 text-base text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-clinic-400 focus:border-clinic-400 transition-all cursor-pointer font-medium"
                style={{ colorScheme: 'light', backgroundColor: '#ffffff', color: '#0f172a' }}
              >
                <option value="available" className="light-option" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Available</option>
                <option value="on_break" className="light-option" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>On Break (Take Break)</option>
                <option value="unavailable" className="light-option" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Unavailable</option>
              </select>
            </FormField>

            <FormField
              label="Avg. Consultation Time (minutes) *"
              error={errors.avgConsultationMinutes}
            >
              <input
                type="number"
                min="1"
                max="120"
                value={form.avgConsultationMinutes}
                onChange={handleChange('avgConsultationMinutes')}
                className={inputClass(errors.avgConsultationMinutes)}
              />
            </FormField>

            <FormField label="Duty Start Time *" error={errors.dutyStart}>
              <input
                type="time"
                value={form.dutyStart}
                onChange={handleChange('dutyStart')}
                className={inputClass(errors.dutyStart)}
              />
            </FormField>

            <FormField label="Duty End Time *" error={errors.dutyEnd}>
              <input
                type="time"
                value={form.dutyEnd}
                onChange={handleChange('dutyEnd')}
                className={inputClass(errors.dutyEnd)}
              />
            </FormField>

            <FormField label="Break Start Time (optional)" error={errors.breakStart}>
              <input
                type="time"
                value={form.breakStart}
                onChange={handleChange('breakStart')}
                className={inputClass(errors.breakStart)}
              />
            </FormField>

            <FormField label="Break End Time (optional)" error={errors.breakEnd}>
              <input
                type="time"
                value={form.breakEnd}
                onChange={handleChange('breakEnd')}
                className={inputClass(errors.breakEnd)}
              />
            </FormField>
          </div>

          {/* Working days selector */}
          <FormField label="Working Days *" error={errors.workingDays}>
            <div className="flex flex-wrap gap-2 mt-1">
              {WEEKDAYS.map(day => {
                const isSelected = form.workingDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      isSelected
                        ? 'bg-clinic-600 text-white border-clinic-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </FormField>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              Updates your profile instantly and recalculates wait times for your patients.
            </p>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 bg-clinic-600 hover:bg-clinic-700 text-white rounded-xl font-semibold text-sm transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save size={16} />
                  Save My Schedule
                </>
              )}
            </button>
          </div>
        </form>
      </DoctorCard>
    </div>
  );
}

function FormField({ label, error, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

function inputClass(error) {
  return `w-full px-4 py-2.5 rounded-xl border text-base text-slate-800 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-clinic-400 focus:border-clinic-400 transition-all ${
    error ? 'border-red-400 ring-1 ring-red-400' : 'border-slate-300'
  }`;
}