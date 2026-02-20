import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-semblance-primary text-white rounded-full hover:bg-semblance-primary-hover active:bg-semblance-primary-active',
  secondary:
    'bg-transparent text-semblance-primary border border-semblance-primary rounded-md hover:bg-semblance-primary-subtle dark:hover:bg-semblance-primary-subtle-dark',
  ghost:
    'bg-transparent text-semblance-text-secondary dark:text-semblance-text-secondary-dark rounded-md hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark',
  danger:
    'bg-semblance-attention text-white rounded-full hover:opacity-90 active:opacity-80',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-3 text-base',
  lg: 'px-6 py-3.5 text-md',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`
          inline-flex items-center justify-center font-semibold
          transition-all duration-fast ease-out
          focus-visible:outline-none focus-visible:shadow-focus
          disabled:opacity-50 disabled:pointer-events-none
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${className}
        `.trim()}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
