/**
 * SettingsScreen.jsx  (Doctor/Clinic Side)
 * ------------------------------------------
 * Operational schedule, duty timings & clinical settings for the logged-in doctor.
 * Platform Admin manages accounts/credentials; doctors manage their operational schedule here.
 */
import { useState, useEffect } from 'react';
import {
  Clock,
  Coffee,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Save,
} from 'lucide-react';
import DoctorCard from '../components/DoctorCard';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DAY_MAP_TO_SHORT = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
  Mon: 'Mon',
  Tue: 'Tue',
  Wed: 'Wed',
  Thu: 'Thu',
  Fri: 'Fri',
  Sat: 'Sat',
  Sun: 'Sun',
};

const DAY_MAP_TO_FULL = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
  Monday: 'Monday',
  Tuesday: 'Tuesday',
  Wednesday: 'Wednesday',
  Thursday: 'Thursday',
  Friday: 'Friday',
  Saturday: 'Saturday',
  Sunday: 'Sunday',
};

export default function SettingsScreen({ session, currentDoctor, onSaveDoctor }) {
  // Lock strictly to logged-in doctor
  const currentDocId = currentDoctor?.id || session?.doctorId;
  const currentDoc = currentDoctor || session || null;

  const [form, setForm] = useState({
    availability: 'available',
    avgConsultationMinutes: '10',
    dutyStart: '09:00',
    dutyEnd: '17:00',
    breakStart: '13:00',
    breakEnd: '14:00',
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Sync form when currentDoc or session changes
  useEffect(() => {
    const doc = currentDoc;
    if (doc) {
      const rawDays = doc.workingDays || doc.working_days || session?.workingDays || session?.working_days;
      const normalizedDays = Array.isArray(rawDays) && rawDays.length > 0
        ? rawDays.map(d => DAY_MAP_TO_SHORT[d] || d)
        : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

      setForm({
        availability: doc.availability || (doc.available ? 'available' : 'unavailable'),
        avgConsultationMinutes: String(doc.averageConsultationMinutes || doc.avgConsultationMinutes || 10),
        dutyStart: (doc.dutyStart || session?.dutyStart || '09:00').slice(0, 5),
        dutyEnd: (doc.dutyEnd || session?.dutyEnd || '17:00').slice(0, 5),
        breakStart: doc.breakStart ? doc.breakStart.slice(0, 5) : (session?.breakStart ? session.breakStart.slice(0, 5) : ''),
        breakEnd: doc.breakEnd ? doc.breakEnd.slice(0, 5) : (session?.breakEnd ? session.breakEnd.slice(0, 5) : ''),
        workingDays: normalizedDays,
      });
    } else if (session) {
      setForm(prev => ({
        ...prev,
        dutyStart: (session.dutyStart || '09:00').slice(0, 5),
        dutyEnd: (session.dutyEnd || '17:00').slice(0, 5),
      }));
    }
  }, [currentDoc, session]);

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
    if (!form.dutyStart) {
      errs.dutyStart = 'Duty start time is required.';
    }
    if (!form.dutyEnd) {
      errs.dutyEnd = 'Duty end time is required.';
    }
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
      id: currentDocId,
      name: currentDoc?.name || session?.doctorName,
      specialization: currentDoc?.specialization || session?.specialisation,
      username: currentDoc?.username || session?.username,
      availability: form.availability,
      averageConsultationMinutes: parseInt(form.avgConsultationMinutes, 10) || 10,
      avgConsultationMinutes: parseInt(form.avgConsultationMinutes, 10) || 10,
      dutyStart: form.dutyStart,
      dutyEnd: form.dutyEnd,
      breakStart: form.breakStart && form.breakStart.trim() ? form.breakStart.trim() : null,
      breakEnd: form.breakEnd && form.breakEnd.trim() ? form.breakEnd.trim() : null,
      workingDays: (form.workingDays || []).map(d => DAY_MAP_TO_FULL[d] || d),
    };

    if (onSaveDoctor) {
      const res = await onSaveDoctor(payload);
      setIsSubmitting(false);

      if (res?.error) {
        setSubmitError(res.error.message || 'Failed to save operational schedule.');
        return;
      }

      setSuccessMsg('Operational schedule and clinical settings updated successfully!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } else {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Doctor Settings</h2>
        <p className="text-slate-500 text-sm mt-0.5">
          Configure your operational schedule, duty hours, break timings, and consultation duration.
        </p>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl p-3.5 text-green-800 text-sm shadow-sm">
          <CheckCircle2 size={18} className="text-green-600 flex-shrink-0" />
          <span className="font-medium">{successMsg}</span>
        </div>
      )}

      {/* Operational Schedule & Timings Form */}
      <DoctorCard title="Operational Schedule & Timings">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {submitError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-800 text-sm">
              <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Availability Status & Consultation Time */}
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
              label="Avg. Consultation Duration (minutes) *"
              error={errors.avgConsultationMinutes}
            >
              <input
                type="number"
                min="1"
                max="120"
                value={form.avgConsultationMinutes}
                onChange={handleChange('avgConsultationMinutes')}
                className={inputClass(errors.avgConsultationMinutes)}
                placeholder="10"
              />
            </FormField>
          </div>

          {/* Duty & Break Times */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Duty Start Time *" error={errors.dutyStart}>
              <div className="relative">
                <input
                  type="time"
                  value={form.dutyStart}
                  onChange={handleChange('dutyStart')}
                  className={inputClass(errors.dutyStart)}
                />
              </div>
            </FormField>

            <FormField label="Duty End Time *" error={errors.dutyEnd}>
              <div className="relative">
                <input
                  type="time"
                  value={form.dutyEnd}
                  onChange={handleChange('dutyEnd')}
                  className={inputClass(errors.dutyEnd)}
                />
              </div>
            </FormField>

            <FormField label="Break Start Time (optional)" error={errors.breakStart}>
              <div className="relative">
                <input
                  type="time"
                  value={form.breakStart}
                  onChange={handleChange('breakStart')}
                  className={inputClass(errors.breakStart)}
                />
              </div>
            </FormField>

            <FormField label="Break End Time (optional)" error={errors.breakEnd}>
              <div className="relative">
                <input
                  type="time"
                  value={form.breakEnd}
                  onChange={handleChange('breakEnd')}
                  className={inputClass(errors.breakEnd)}
                />
              </div>
            </FormField>
          </div>

          {/* Working Days */}
          <FormField label="Working Days *" error={errors.workingDays}>
            <div className="flex flex-wrap gap-2 mt-1">
              {WEEKDAYS.map(day => {
                const isSelected = form.workingDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
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

          {/* Save Action */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              Changes reflect instantly in the queue and patient estimated wait times.
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
                  Save Schedule & Timings
                </>
              )}
            </button>
          </div>
        </form>
      </DoctorCard>

      {/* Current Profile & Credentials info */}
      <DoctorCard title="Your Profile & Credentials">
        <div className="flex flex-col gap-4 text-sm">
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-clinic-100 border border-clinic-200 flex items-center justify-center text-clinic-700 font-bold text-base">
                {(currentDoc?.name || session?.doctorName || 'D').charAt(0)}
              </div>
              <div>
                <p className="font-bold text-slate-900 text-base leading-tight">
                  {currentDoc?.name || session?.doctorName}
                </p>
                <p className="text-xs text-clinic-600 font-medium">
                  {currentDoc?.specialization || session?.specialisation || 'General Physician'} &bull; @{currentDoc?.username || session?.username}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-xs w-fit">
              <ShieldCheck size={14} className="text-clinic-600" />
              <span>Doctor account created & managed by Platform Admin</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <InfoRow label="Doctor Name" value={currentDoc?.name || session?.doctorName} />
            <InfoRow label="Specialization" value={currentDoc?.specialization || session?.specialisation || '—'} />
            <InfoRow label="Login Username" value={`@${currentDoc?.username || session?.username}`} mono />
            <InfoRow label="Doctor ID" value={currentDocId || '—'} mono />
          </div>
        </div>
      </DoctorCard>

      {/* Clinic Information */}
      <DoctorCard title="Clinic Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <InfoRow label="Clinic" value={session?.clinicName} />
          <InfoRow label="Place" value={session?.clinicPlace} />
          <InfoRow label="Mobile" value={session?.clinicMobile} link={session?.clinicMobile ? `tel:${session.clinicMobile}` : null} />
          <InfoRow label="Clinic ID" value={session?.clinicId} mono />
        </div>
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

function InfoRow({ label, value, link, mono }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-500 w-32 flex-shrink-0">{label}:</span>
      {link ? (
        <a href={link} className="font-medium text-clinic-600 hover:underline">{value}</a>
      ) : (
        <span className={`font-medium text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</span>
      )}
    </div>
  );
}