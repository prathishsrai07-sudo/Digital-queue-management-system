/**
 * StatusBadge.jsx
 * ----------------
 * High-contrast pill badge with subtle animated pulse dots for doctor and token states.
 */

const STATUS_CONFIG = {
  available: {
    style: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    dot: 'bg-emerald-500 animate-pulse',
    label: 'Available',
  },
  on_break: {
    style: 'bg-amber-50 text-amber-900 border-amber-300',
    dot: 'bg-amber-500',
    label: 'On Break',
  },
  unavailable: {
    style: 'bg-rose-50 text-rose-800 border-rose-300',
    dot: 'bg-rose-500',
    label: 'Unavailable',
  },
  waiting: {
    style: 'bg-blue-50 text-blue-800 border-blue-200',
    dot: 'bg-blue-500',
    label: 'Waiting',
  },
  called: {
    style: 'bg-amber-100 text-amber-900 border-amber-300 shadow-2xs',
    dot: 'bg-amber-500 animate-bounce',
    label: 'Called (Summoned)',
  },
  consulting: {
    style: 'bg-teal-50 text-teal-800 border-teal-300 shadow-2xs',
    dot: 'bg-teal-500 animate-ping',
    label: 'Consulting',
  },
  in_progress: {
    style: 'bg-teal-50 text-teal-800 border-teal-300 shadow-2xs',
    dot: 'bg-teal-500 animate-ping',
    label: 'Consulting',
  },
  completed: {
    style: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
    label: 'Completed',
  },
  served: {
    style: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
    label: 'Completed',
  },
  skipped: {
    style: 'bg-rose-50 text-rose-800 border-rose-200',
    dot: 'bg-rose-400',
    label: 'Skipped / No-Show',
  },
  no_show: {
    style: 'bg-rose-50 text-rose-800 border-rose-200',
    dot: 'bg-rose-400',
    label: 'Skipped / No-Show',
  },
  Online: {
    style: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dot: 'bg-emerald-500',
    label: 'Online',
  },
  Phone: {
    style: 'bg-purple-50 text-purple-800 border-purple-200',
    dot: 'bg-purple-500',
    label: 'Phone',
  },
};

export default function StatusBadge({ status, className = '' }) {
  const config = STATUS_CONFIG[status] || {
    style: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
    label: status,
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${config.style} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot} flex-shrink-0`} />
      <span>{config.label}</span>
    </span>
  );
}
