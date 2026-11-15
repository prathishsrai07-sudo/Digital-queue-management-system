/**
 * DoctorCard.jsx
 * ---------------
 * A white card wrapper with optional title, suited for dashboard widgets.
 */
export default function DoctorCard({ children, className = '', title, titleRight }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-5 pt-4 pb-0">
          <h3 className="font-semibold text-slate-800 text-base">{title}</h3>
          {titleRight && <span>{titleRight}</span>}
        </div>
      )}
      <div className="p-5">
        {children}
      </div>
    </div>
  );
}
