import { forwardRef, type TextareaHTMLAttributes } from 'react';

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, error, id, required, className = '', ...props }, ref) => {
    const areaId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={areaId}
            className="block text-sm font-medium text-ink mb-1.5"
          >
            {label}
            {required && <span className="text-magenta ml-0.5" aria-hidden="true">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={areaId}
          required={required}
          aria-invalid={!!error}
          aria-describedby={error ? `${areaId}-error` : undefined}
          className={`
            block w-full rounded-xl border px-3.5 py-2.5 text-sm text-ink font-sans
            bg-cream placeholder:text-inkmute/50 resize-y min-h-[80px]
            focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta
            disabled:bg-creamdeep disabled:cursor-not-allowed disabled:opacity-60
            transition-all duration-200
            ${error ? 'border-magenta' : 'border-ink/14'}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p id={`${areaId}-error`} className="mt-1.5 text-sm text-magenta" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

TextArea.displayName = 'TextArea';
export default TextArea;
