import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { ButtonVariant, ButtonSize } from './Button.types';
import './Button.css';

interface WebButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, WebButtonProps>(
  ({ variant = 'ghost', size = 'md', className = '', children, ...props }, ref) => {
    const classes = [
      'btn',
      `btn--${variant}`,
      `btn--${size}`,
      className,
    ].filter(Boolean).join(' ');

    return (
      <button ref={ref} className={classes} {...props}>
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
