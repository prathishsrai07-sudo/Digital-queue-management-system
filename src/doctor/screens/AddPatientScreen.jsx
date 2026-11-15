/**
 * AddPatientScreen.jsx  (Doctor/Clinic Side)
 * --------------------------------------------
 * Allows the doctor to add a walk-in / phone-booked patient directly to their queue.
 *
 * The token number is automatically generated.
 * Booking type is always set to "Phone".
 *
 * Strict Doctor Isolation:
 * Tokens are strictly locked to the logged-in doctor. No other doctors can be selected.
 */
import { useState } from 'react';
import { UserPlus, CheckCircle2, Loader2, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import DoctorCard from '../components/DoctorCard';

export default function AddPatientScreen({ session, clinic, currentDoctor, onAddPatient, onViewQueue }) {
  const targetDoctorId = currentDoctor?.id || session?.doctorId || '';
  const doctorName = currentDoctor?.name || session?.doctorName || 'Doctor';
  const doctorSpec = currentDoctor?.specialization || currentDoctor?.specialisation || session?.specialisation || 'Physician';

  const [form, setForm]         = useState({ name: '', mobile: '', place: '' });
  const [errors, setErrors]     = useState({});
  const [added, setAdded]       = useState(null);   // stores the last added token info
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleChange = (field) => (e) => {
    setForm(f => ({ ...f, [field]: e.target.value }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }));
    if (submitError) setSubmitError('');
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Patient name is required.';
    const cleanPhone = form.mobile.replace(/\s+/g, '');
    if (cleanPhone && !/^[0-9]{10}$/.test(cleanPhone)) {
      errs.mobile = 'Mobile number must be exactly 10 digits.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate() || submitting) return;

    setSubmitting(true);
    setSubmitError('');

    const res = await onAddPatient({
      name:     form.name.trim(),
      mobile:   form.mobile.trim(),
      place:    form.place.trim(),
      doctorId: targetDoctorId,
    });

    setSubmitting(false);

    if (res?.error) {
      setSubmitError(res.error.message || 'Failed to generate token. Please try again.');
      return;
    }

    const tokenData = res?.data || res;
    setAdded(tokenData);
    setForm({ name: '', mobile: '', place: '' });
    setErrors({});
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Add Patient</h2>
        <p className="text-slate-500 text-sm mt-0.5">Add a walk-in or phone-booked patient to your queue.</p>
      </div>

      {/* Success flash */}
      {added && (
        <div className="flex items-start justify-between gap-3 bg-green-50 border border-green-200 rounded-xl p-4 text-green-800 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={22} className="flex-shrink-0 mt-0.5 text-green-600" />
            <div>
              <p className="font-bold text-base">Token Generated Successfully!</p>
              <p className="text-sm mt-0.5">
                Token <strong className="text-green-900 text-base">{added.tokenNumber || added.token_number}</strong> has been created for <strong>{added.patientName}</strong> under <strong>{doctorName}</strong>.
              </p>
              <div className="flex items-center gap-3 mt-3">
                {onViewQueue && (
                  <button
                    type="button"
                    onClick={onViewQueue}
                    className="flex items-center gap-1.5 text-xs font-semibold bg-clinic-600 hover:bg-clinic-700 text-white px-3 py-1.5 rounded-lg transition-all shadow-sm"
                  >
                    View in Live Queue <ArrowRight size={13} />
                  </button>
                )}
                <button
                  type="button"
                  className="text-xs text-green-800 hover:text-green-950 font-medium hover:underline"
                  onClick={() => setAdded(null)}
                >
                  Add Another Patient
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error alert */}
      {submitError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-red-800 text-sm">
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5 text-red-500" />
          <p>{submitError}</p>
        </div>
      )}

      {/* Add Patient Form */}
      <DoctorCard title="Patient Details">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          {/* Locked Doctor Identity Banner */}
          <div className="flex items-center justify-between gap-3 bg-teal-50/70 border border-teal-200/80 rounded-xl p-3.5 text-sm">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                {doctorName.charAt(0)}
              </span>
              <div>
                <p className="font-bold text-slate-800 text-sm">{doctorName}</p>
                <p className="text-xs text-teal-700 font-medium">{doctorSpec}</p>
              </div>
            </div>
            <span className="flex items-center gap-1 text-[11px] font-semibold text-teal-800 bg-white border border-teal-200 px-2.5 py-1 rounded-full shadow-2xs">
              <ShieldCheck size={13} className="text-teal-600" />
              Locked to your queue
            </span>
          </div>

          {/* Patient Name */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Patient Name *</label>
            <input
              type="text"
              placeholder="e.g. Rajan Pillai"
              value={form.name}
              onChange={handleChange('name')}
              className={`w-full px-4 py-3 rounded-xl border text-base text-slate-800 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-clinic-400 focus:border-clinic-400 transition-all ${errors.name ? 'border-red-400' : 'border-slate-300'}`}
            />
            {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
          </div>

          {/* Mobile (optional) */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Mobile Number <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="tel"
              placeholder="10-digit mobile number"
              value={form.mobile}
              onChange={handleChange('mobile')}
              maxLength={10}
              className={`w-full px-4 py-3 rounded-xl border text-base text-slate-800 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-clinic-400 focus:border-clinic-400 transition-all ${errors.mobile ? 'border-red-400' : 'border-slate-300'}`}
            />
            {errors.mobile && <p className="text-sm text-red-500">{errors.mobile}</p>}
          </div>

          {/* Place (optional) */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Place / Area <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="text"
              placeholder="e.g. Indiranagar, Bengaluru"
              value={form.place}
              onChange={handleChange('place')}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 text-base text-slate-800 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-clinic-400 focus:border-clinic-400 transition-all"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-3 bg-clinic-600 hover:bg-clinic-700 text-white rounded-xl font-semibold text-sm transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating Token…
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  Add to My Queue
                </>
              )}
            </button>
          </div>
        </form>
      </DoctorCard>
    </div>
  );
}