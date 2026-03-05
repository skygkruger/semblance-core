import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import type { CardVariant } from './Card.types';
import './Card.css';

interface WebCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: CardVariant;
  hoverable?: boolean;
}

export const Card = forwardRef<HTMLDivElement, WebCardProps>(
  ({ children, variant = 'default', hoverable = false, className = '', ...props }, ref) => {
    const surfaceClass = variant === 'briefing' ? 'surface-opal opal-surface' : 'surface-slate';
    const classes = [
      'card',
      surfaceClass,
      variant !== 'default' ? `card--${variant}` : '',
      hoverable ? 'card--hoverable' : '',
      className,
    ].filter(Boolean).join(' ');

    return (
      <div ref={ref} className={classes} {...props}>
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
