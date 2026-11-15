/**
 * BookingConfirmationScreen.jsx
 * -----------------------------
 * NEW screen inserted between doctor selection and token confirmation.
 *
 * Shows a full summary of the patient's choices and requires an
 * explicit "Book Token" click before any token is generated.
 *
 * Props:
 *   patient      – { name, mobile, place }
 *   clinic       – clinic object { name, place, … }
 *   doctor       – doctor object { name, specialisation, … }
 *   isBooked     – boolean guard (true after first Book Token click)
 *   onBook       – called when patient confirms → token is generated in App.jsx
 *   onBack       – returns to doctor/clinic selection to change the doctor or clinic
 *   onEditPatient – returns to patient details to change name/mobile/place
 */
import { User, Phone, MapPin, Hospital, UserCircle, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import StepHeader from '../components/StepHeader';

export default function BookingConfirmationScreen({
  patient,
  clinic,
  doctor,
  isBooked,
  isLoading,
  error,
  onBook,
  onBack,
  onEditPatient,
}) {
  const isActionDisabled = isBooked || isLoading;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <StepHeader
          title="Confirm Your Booking"
          subtitle="Please review your details before generating a token."
          onBack={onBack}
        />

        {/* ── Error message if booking failed ───────────────────── */}
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl mb-4">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5 text-red-500" />
            <p>{error}</p>
          </div>
        )}

        {/* ── Summary Table ─────────────────────────────────────── */}
        <div className="flex flex-col gap-4 mb-6">

          {/* Patient details section */}
          <SectionHeading label="Patient Details" />

          <SummaryRow
            icon={<User size={17} className="text-clinic-500" />}
            label="Name"
            value={patient.name}
          />
          <SummaryRow
            icon={<Phone size={17} className="text-clinic-500" />}
            label="Mobile"
            value={patient.mobile}
          />
          <SummaryRow
            icon={<MapPin size={17} className="text-clinic-500" />}
            label="Place"
            value={patient.place}
          />

          <div className="border-t border-slate-100 my-1" />

          {/* Clinic & doctor section */}
          <SectionHeading label="Clinic & Doctor" />

          <SummaryRow
            icon={<Hospital size={17} className="text-clinic-500" />}
            label="Clinic"
            value={clinic.name}
            sub={clinic.place}
            mobile={clinic.mobile}
          />
          <SummaryRow
            icon={<UserCircle size={17} className="text-clinic-500" />}
            label="Doctor"
            value={doctor.name}
            sub={doctor.specialisation || doctor.specialization}
            availability={doctor.availability}
          />
        </div>

        {/* Informative notice if doctor is unavailable or on break */}
        {doctor.availability === 'unavailable' && (
          <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-3.5 text-xs text-amber-900 flex items-start gap-3 mb-5">
            <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-950">Doctor is currently unavailable / yet to arrive</p>
              <p className="mt-0.5 leading-snug text-amber-800">
                You can still confirm your booking now. Your token will be queued in order, and the estimated consultation window will update once consultation begins.
              </p>
            </div>
          </div>
        )}

        {doctor.availability === 'on_break' && (
          <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-3.5 text-xs text-amber-900 flex items-start gap-3 mb-5">
            <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-950">Doctor is currently on a short break</p>
              <p className="mt-0.5 leading-snug text-amber-800">
                You can still confirm your booking now. Consultation will resume shortly.
              </p>
            </div>
          </div>
        )}

        {/* ── Edit patient details link ─────────────────────────── */}
        <button
          onClick={onEditPatient}
          className="text-sm text-clinic-600 hover:text-clinic-800 underline underline-offset-2 mb-5 block transition-colors"
        >
          ← Edit patient details (name / mobile / place)
        </button>

        {/* ── Action Buttons ────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {/* Book Token — primary action, disabled while in-flight or after booked */}
          <Button
            onClick={onBook}
            disabled={isActionDisabled}
            className="w-full text-base py-4 gap-2"
          >
            {isLoading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <CheckCircle2 size={20} />
            )}
            {isBooked ? 'Booked!' : isLoading ? 'Booking…' : 'Book Token'}
          </Button>

          {/* Go Back — lets patient change clinic or doctor */}
          <Button
            variant="outline"
            onClick={onBack}
            disabled={isLoading}
            className="w-full"
          >
            Go Back / Change Clinic or Doctor
          </Button>
        </div>
      </Card>

      {/* Advisory note */}
      <p className="text-center text-xs text-slate-400 px-2">
        Your token is generated only after you click <strong>Book Token</strong>.
        No appointment is held before that.
      </p>
    </div>
  );
}

// ── Small helper sub-components ───────────────────────────────────────────────
function SectionHeading({ label }) {
  return (
    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1">
      {label}
    </p>
  );
}

function SummaryRow({ icon, label, value, sub, mobile, availability }) {
  const isUnavail = availability === 'unavailable';
  const isOnBreak = availability === 'on_break';

  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-base font-semibold text-slate-800 break-words">{value}</p>
          {availability && (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isUnavail
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : isOnBreak
                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isUnavail ? 'bg-rose-500' : isOnBreak ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'
                }`}
              />
              {isUnavail ? 'Unavailable / Yet to Arrive' : isOnBreak ? 'On Break' : 'Available'}
            </span>
          )}
        </div>
        {sub && <p className="text-sm text-slate-500">{sub}</p>}
        {mobile && (
          <a
            href={`tel:${mobile}`}
            className="flex items-center gap-1 text-clinic-600 text-sm hover:underline w-fit mt-0.5"
          >
            <Phone size={13} className="flex-shrink-0" />
            {mobile}
          </a>
        )}
      </div>
    </div>
  );
}
