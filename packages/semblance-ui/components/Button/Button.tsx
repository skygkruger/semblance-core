import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import './Button.css';

type ButtonVariant = 'ghost' | 'solid' | 'subtle' | 'approve' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
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
