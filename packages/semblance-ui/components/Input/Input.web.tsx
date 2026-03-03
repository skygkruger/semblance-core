import { forwardRef, type InputHTMLAttributes } from 'react';
import './Input.css';

interface WebInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  errorMessage?: string;
}

export const Input = forwardRef<HTMLInputElement, WebInputProps>(
  ({ error = false, errorMessage, className = '', disabled, ...props }, ref) => {
    const outerClasses = [
      'input-outer',
      className,
    ].filter(Boolean).join(' ');

    const wrapperClasses = [
      'input-wrapper',
      error ? 'input-wrapper--error' : '',
      disabled ? 'input-wrapper--disabled' : '',
    ].filter(Boolean).join(' ');

    return (
      <div className={outerClasses}>
        <div className={wrapperClasses}>
          <input ref={ref} className="input" disabled={disabled} {...props} />
        </div>
        {error && errorMessage && (
          <p className="input__error-message">{errorMessage}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
