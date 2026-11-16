/**
 * Card.jsx
 * --------
 * A refined white container with subtle glassmorphism and soft colored shadow.
 * Used as the visual wrapper for screen panels.
 */
export default function Card({ children, className = '' }) {
  return (
    <div
      className={`w-full max-w-xl mx-auto bg-white/95 backdrop-blur-sm rounded-3xl shadow-lg shadow-slate-900/5 border border-slate-200/80 p-6 sm:p-8 transition-all duration-200 ${className}`}
    >
      {children}
    </div>
  );
}
