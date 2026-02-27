import { WireframeSpinner } from '../WireframeSpinner/WireframeSpinner';
import './SkeletonCard.css';

interface VariantMessages {
  message: string;
  sub: string | null;
}

const DEFAULT_MESSAGES: Record<string, VariantMessages> = {
  inference: { message: 'On it.', sub: 'Your AI is thinking' },
  indexing: { message: 'Building your knowledge', sub: 'This takes a moment the first time' },
  briefing: { message: 'Preparing your brief', sub: 'Pulling together everything relevant' },
  generic: { message: 'Working...', sub: null },
};

interface SkeletonCardProps {
  variant?: 'inference' | 'indexing' | 'briefing' | 'generic';
  message?: string;
  subMessage?: string;
  showSpinner?: boolean;
  height?: number | string;
}

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
      {showSpinner && <WireframeSpinner size={48} />}
      <div className="skeleton-card__status">{displayMessage}</div>
      {displaySub && (
        <div className="skeleton-card__sub">{displaySub}</div>
      )}
    </div>
  );
}
