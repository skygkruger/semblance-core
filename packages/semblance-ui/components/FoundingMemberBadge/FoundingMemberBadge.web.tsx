import type { FoundingMemberBadgeProps } from './FoundingMemberBadge.types';
import './FoundingMemberBadge.css';

export function FoundingMemberBadge({ seat, variant = 'inline', className = '' }: FoundingMemberBadgeProps) {
  if (variant === 'card') {
    return (
      <div className={`founding-badge founding-badge--card ${className}`.trim()}>
        <div className="founding-badge__glow" />
        <span className="founding-badge__label">FOUNDING MEMBER</span>
        <span className="founding-badge__seat">#{String(seat).padStart(3, '0')}</span>
        <span className="founding-badge__of">1 of 500</span>
      </div>
    );
  }

  return (
    <span className={`founding-badge founding-badge--inline ${className}`.trim()}>
      <span className="founding-badge__dot" />
      Founding Member #{seat}
    </span>
  );
}
