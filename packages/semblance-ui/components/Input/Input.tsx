import { forwardRef, type InputHTMLAttributes } from 'react';
import './Input.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  errorMessage?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error = false, errorMessage, className = '', ...props }, ref) => {
    const inputClasses = [
      'input',
      error ? 'input--error' : '',
      className,
    ].filter(Boolean).join(' ');

    return (
      <div className="input-wrapper">
        <input ref={ref} className={inputClasses} {...props} />
        {error && errorMessage && (
          <p className="input__error-message">{errorMessage}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
