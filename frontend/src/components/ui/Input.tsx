import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, required, className = '', ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-ink mb-1.5"
          >
            {label}
            {required && <span className="text-magenta ml-0.5" aria-hidden="true">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={`
            block w-full rounded-xl border px-3.5 py-2.5 text-sm text-ink font-sans
            bg-cream placeholder:text-inkmute/50
            focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta
            disabled:bg-creamdeep disabled:cursor-not-allowed disabled:opacity-60
            transition-all duration-200
            ${error ? 'border-magenta' : 'border-ink/14'}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="mt-1.5 text-sm text-magenta" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
export default Input;
