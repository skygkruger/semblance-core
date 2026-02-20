import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  errorMessage?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error = false, errorMessage, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          ref={ref}
          className={`
            w-full px-4 py-3 text-base font-ui
            bg-semblance-surface-1 dark:bg-semblance-surface-1-dark
            border rounded-md
            transition-all duration-fast ease-out
            placeholder:text-semblance-text-tertiary
            focus:outline-none focus:shadow-focus
            ${error
              ? 'border-semblance-attention bg-semblance-attention-subtle dark:bg-semblance-attention/10'
              : 'border-semblance-border dark:border-semblance-border-dark focus:border-semblance-primary'
            }
            text-semblance-text-primary dark:text-semblance-text-primary-dark
            ${className}
          `.trim()}
          {...props}
        />
        {error && errorMessage && (
          <p className="mt-1 text-xs text-semblance-attention">{errorMessage}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
