import { forwardRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import './Input.css';

interface WebInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  errorMessage?: string;
  /** Called when user presses Enter or clicks the return symbol */
  onEnter?: (value: string) => void;
}

export const Input = forwardRef<HTMLInputElement, WebInputProps>(
  ({ error = false, errorMessage, className = '', disabled, onEnter, onChange, ...props }, ref) => {
    const [hasValue, setHasValue] = useState(!!props.value || !!props.defaultValue);

    const outerClasses = [
      'input-outer',
      className,
    ].filter(Boolean).join(' ');

    const wrapperClasses = [
      'input-wrapper',
      hasValue ? 'input-wrapper--has-value' : '',
      error ? 'input-wrapper--error' : '',
      disabled ? 'input-wrapper--disabled' : '',
    ].filter(Boolean).join(' ');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setHasValue(!!e.target.value);
      onChange?.(e);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && onEnter) {
        e.preventDefault();
        onEnter((e.target as HTMLInputElement).value);
      }
    };

    return (
      <div className={outerClasses}>
        <div className={wrapperClasses}>
          <input
            ref={ref}
            className="input"
            disabled={disabled}
            onChange={handleChange}
            onKeyDown={onEnter ? handleKeyDown : undefined}
            {...props}
          />
          <span className="input__enter-symbol">↵</span>
        </div>
        {error && errorMessage && (
          <p className="input__error-message">{errorMessage}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
