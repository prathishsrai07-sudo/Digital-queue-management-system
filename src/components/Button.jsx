/**
 * Button.jsx
 * ----------
 * A reusable button component with rich modern healthcare gradients and smooth micro-interactions.
 */

const variants = {
  primary: 'bg-gradient-to-r from-teal-600 via-teal-500 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white shadow-md shadow-teal-600/25 hover:shadow-lg hover:shadow-teal-600/35 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]',
  outline: 'border-2 border-indigo-600/80 text-indigo-700 bg-white/90 hover:bg-indigo-50/70 hover:border-indigo-700 active:bg-indigo-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0',
  ghost:   'text-teal-700 hover:bg-teal-50/80 active:bg-teal-100 font-semibold',
  secondary: 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md shadow-indigo-600/25 hover:shadow-lg hover:-translate-y-0.5',
};

export default function Button({
  children,
  variant = 'primary',
  className = '',
  disabled = false,
  ...props
}) {
  return (
    <button
      disabled={disabled}
      className={`
        inline-flex items-center justify-center gap-2
        px-5 py-3 rounded-xl font-semibold text-base
        transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-none
        ${variants[variant]}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}
