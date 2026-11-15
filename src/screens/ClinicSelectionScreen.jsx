/**
 * ClinicSelectionScreen.jsx
 * -------------------------
 * Step 2 of the "Get Token" flow.
 * Patients search for a clinic by name or place.
 * Clicking a clinic card selects it and moves to doctor selection.
 */
import { useState, useEffect } from 'react';
import { Search, MapPin, Phone, ChevronRight, Loader2 } from 'lucide-react';
import { getClinics } from '../services/dbService';
import Card from '../components/Card';
import Button from '../components/Button';
import StepHeader from '../components/StepHeader';

export default function ClinicSelectionScreen({ onBack, onSelectClinic }) {
  const [clinics, setClinics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [query, setQuery]     = useState('');

  const fetchClinics = async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchErr } = await getClinics();
    if (fetchErr) {
      setError(fetchErr.message || 'Failed to load clinics.');
    } else {
      setClinics(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchClinics();
  }, []);

  // Filter clinics by name OR place — case-insensitive
  const filtered = clinics.filter((c) => {
    const q = query.toLowerCase();
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.place && c.place.toLowerCase().includes(q))
    );
  });

  return (
    <Card>
      <StepHeader
        title="Select Clinic"
        subtitle="Search by clinic name or location."
        onBack={onBack}
      />

      {/* ── Search Bar ─────────────────────────────────────── */}
      <div className="relative mb-5">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          type="text"
          placeholder="Search clinic name or place…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="
            w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300
            text-slate-800 placeholder:text-slate-400
            focus:outline-none focus:ring-2 focus:ring-clinic-400 focus:border-clinic-400
            transition-all duration-150 text-base bg-white
          "
          autoFocus
        />
      </div>

      {/* ── Loading & Error States ──────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
          <Loader2 size={30} className="animate-spin text-clinic-600" />
          <p className="text-sm">Loading clinics…</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <p className="text-sm text-red-600 text-center">{error}</p>
          <Button variant="outline" onClick={fetchClinics}>
            Try Again
          </Button>
        </div>
      ) : (
        /* ── Clinic List ─────────────────────────────────────── */
        <div className="flex flex-col gap-3">
          {filtered.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm">
              {query ? (
                <>
                  No clinics found for <strong>"{query}"</strong>.<br />
                  Try a different name or location.
                </>
              ) : (
                'No active clinics available right now.'
              )}
            </p>
          ) : (
            filtered.map((clinic) => {
              const docCount = (clinic.doctors || []).length;
              return (
                <button
                  key={clinic.id}
                  onClick={() => onSelectClinic(clinic)}
                  className="
                    flex items-center justify-between w-full text-left
                    px-4 py-4 rounded-xl border border-slate-200
                    hover:border-clinic-400 hover:bg-clinic-50
                    active:bg-clinic-100 transition-all duration-150
                    focus:outline-none focus:ring-2 focus:ring-clinic-400
                  "
                >
                  <div className="flex flex-col gap-1 min-w-0 pr-2">
                    <span className="font-semibold text-slate-800 text-base">
                      {clinic.name}
                    </span>
                    <span className="flex items-center gap-1 text-slate-500 text-sm">
                      <MapPin size={13} className="flex-shrink-0" />
                      {clinic.place}
                    </span>
                    {/* Clickable phone link — tap to call on mobile devices */}
                    {clinic.mobile && (
                      <a
                        href={`tel:${clinic.mobile}`}
                        onClick={(e) => e.stopPropagation()} // don't trigger clinic selection
                        className="flex items-center gap-1 text-clinic-600 text-sm hover:underline w-fit"
                      >
                        <Phone size={12} className="flex-shrink-0" />
                        {clinic.mobile}
                      </a>
                    )}
                    {/* Doctors list display with availability badges */}
                    {docCount > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {clinic.doctors.map((d) => {
                          const isUnavail = d.availability === 'unavailable';
                          const isOnBreak = d.availability === 'on_break';
                          return (
                            <span
                              key={d.id}
                              className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200/90 text-slate-800 text-xs px-2.5 py-1 rounded-lg font-medium shadow-xs"
                            >
                              <span>{d.name}</span>
                              <span className="text-slate-400 text-[11px]">
                                {d.specialisation || d.specialization ? `(${d.specialisation || d.specialization})` : ''}
                              </span>
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                                  isUnavail
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : isOnBreak
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isUnavail ? 'bg-rose-500' : isOnBreak ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'
                                  }`}
                                />
                                {isUnavail ? 'Yet to Arrive' : isOnBreak ? 'On Break' : 'Available'}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <span className="text-slate-400 text-xs mt-0.5">
                      {docCount === 1
                        ? '1 doctor registered'
                        : `${docCount} doctors registered`}
                    </span>
                  </div>
                  <ChevronRight size={20} className="text-slate-400 flex-shrink-0 ml-2" />
                </button>
              );
            })
          )}
        </div>
      )}
    </Card>
  );
}
