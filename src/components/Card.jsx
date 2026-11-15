/**
 * Card.jsx
 * --------
 * A refined white container with subtle glassmorphism and soft colored shadow.
 * Used as the visual wrapper for screen panels.
 */
export default function Card({ children, className = '' }) {
  return (
    <div
      className={`bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-100 p-6 transition-all duration-200 ${className}`}
    >
      {children}
    </div>
  );
}
