/**
 * DoctorSelectionScreen.jsx
 * --------------------------
 * Step 3 of the "Get Token" flow.
 * Only shown when the selected clinic has MORE than one doctor.
 * If there is only one doctor, App.jsx auto-skips this screen.
 */
import { UserCircle, ChevronRight } from 'lucide-react';
import Card from '../components/Card';
import StepHeader from '../components/StepHeader';

export default function DoctorSelectionScreen({ clinic, onBack, onSelectDoctor }) {
  return (
    <Card>
      <StepHeader
        title="Select Doctor"
        subtitle={`Choose a doctor at ${clinic.name}.`}
        onBack={onBack}
      />

      <div className="flex flex-col gap-3">
        {clinic.doctors.map((doctor) => {
          const isUnavail = doctor.availability === 'unavailable';
          const isOnBreak = doctor.availability === 'on_break';
          return (
            <button
              key={doctor.id}
              onClick={() => onSelectDoctor(doctor)}
              className="
                flex items-center justify-between w-full text-left
                p-4 rounded-2xl border border-slate-200/90
                hover:border-teal-400 hover:bg-teal-50/30 hover:shadow-sm
                active:bg-teal-50/60 transition-all duration-150
                focus:outline-none focus:ring-2 focus:ring-teal-400
              "
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-tr from-teal-500 to-indigo-600 text-white flex-shrink-0 shadow-sm shadow-teal-500/20">
                  <UserCircle size={24} />
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 text-base leading-tight">
                      {doctor.name}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                      isUnavail
                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : isOnBreak
                        ? 'bg-amber-50 text-amber-900 border-amber-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        isUnavail ? 'bg-rose-500' : isOnBreak ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'
                      }`} />
                      {isUnavail ? 'Unavailable / Yet to Arrive' : isOnBreak ? 'On Break' : 'Available'}
                    </span>
                  </div>
                  <span className="text-slate-500 text-xs font-medium">
                    {doctor.specialisation || doctor.specialization}
                  </span>
                  {isUnavail && (
                    <span className="text-[11px] text-amber-700 font-medium">
                      Yet to arrive / consult — booking is open for today
                    </span>
                  )}
                  {isOnBreak && (
                    <span className="text-[11px] text-amber-700 font-medium">
                      On a short break — booking is open for today
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight size={20} className="text-slate-400 flex-shrink-0 ml-2" />
            </button>
          );
        })}
      </div>
    </Card>
  );
}
