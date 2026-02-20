import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hoverable?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, hoverable = false, className = '', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`
          bg-semblance-surface-1 dark:bg-semblance-surface-1-dark
          border border-semblance-border dark:border-semblance-border-dark
          rounded-lg shadow-md p-5
          ${hoverable ? 'transition-all duration-fast ease-out hover:-translate-y-0.5 hover:shadow-lg cursor-pointer' : ''}
          ${className}
        `.trim()}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
