/**
 * InputField.jsx
 * --------------
 * A labelled input field with an optional error message.
 * Supports all standard HTML input types (text, tel, etc.).
 */
export default function InputField({
  label,
  id,
  error = '',
  className = '',
  ...props
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        className={`
          w-full px-4 py-3 rounded-xl border text-base text-slate-800
          placeholder:text-slate-400 bg-white
          focus:outline-none focus:ring-2 focus:ring-clinic-400 focus:border-clinic-400
          transition-all duration-150
          ${error ? 'border-red-400' : 'border-slate-300'}
        `}
        {...props}
      />
      {error && <p className="text-sm text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}
