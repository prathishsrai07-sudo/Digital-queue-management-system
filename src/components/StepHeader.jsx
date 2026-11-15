/**
 * StepHeader.jsx
 * --------------
 * Displays the current step title and an optional back button.
 * Used at the top of every step screen (Patient Details, Clinic Selection, etc.).
 */
import { ArrowLeft } from 'lucide-react';

export default function StepHeader({ title, subtitle = '', onBack }) {
  return (
    <div className="mb-6">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-clinic-600 hover:text-clinic-800 mb-4 text-sm font-medium transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
          Back
        </button>
      )}
      <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
      {subtitle && <p className="text-slate-500 mt-1 text-sm">{subtitle}</p>}
    </div>
  );
}
