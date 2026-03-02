import { WireframeSpinner } from '../WireframeSpinner/WireframeSpinner';
import type { SkeletonCardProps } from './SkeletonCard.types';
import { DEFAULT_MESSAGES } from './SkeletonCard.types';
import './SkeletonCard.css';

export function SkeletonCard({
  variant = 'generic',
  message,
  subMessage,
  showSpinner = true,
  height = 180,
}: SkeletonCardProps) {
  const defaults = DEFAULT_MESSAGES[variant] ?? DEFAULT_MESSAGES.generic!;
  const displayMessage = message ?? defaults.message;
  const displaySub = subMessage ?? defaults.sub;

  return (
    <div className="skeleton-card" style={{ height }}>
      {showSpinner && <WireframeSpinner size={100} />}
      <div className="skeleton-card__status">{displayMessage}</div>
      {displaySub && (
        <div className="skeleton-card__sub">{displaySub}</div>
      )}
    </div>
  );
}
