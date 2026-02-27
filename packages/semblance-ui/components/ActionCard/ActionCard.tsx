import { useState, type ReactNode } from 'react';
import './ActionCard.css';

interface ActionCardProps {
  id: string;
  timestamp: string;
  actionType: string;
  description: string;
  status: 'success' | 'pending' | 'error' | 'rejected';
  autonomyTier: string;
  detail?: ReactNode;
  className?: string;
}

const statusLabel: Record<ActionCardProps['status'], string> = {
  success: 'Completed',
  pending: 'Pending Review',
  error: 'Error',
  rejected: 'Rejected',
};

export function ActionCard({
  timestamp,
  actionType,
  description,
  status,
  autonomyTier,
  detail,
  className = '',
}: ActionCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`action-card opal-surface ${className}`.trim()}>
      <button
        type="button"
        className="action-card__toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className={`action-card__dot action-card__dot--${status}`} />
        <div className="action-card__content">
          <div className="action-card__header">
            <span className="action-card__type">{actionType}</span>
            <span className="action-card__timestamp">{timestamp}</span>
          </div>
          <p className="action-card__description">{description}</p>
          <div className="action-card__meta">
            <span className="action-card__meta-item">{statusLabel[status]}</span>
            <span className="action-card__meta-separator">&middot;</span>
            <span className="action-card__meta-item">{autonomyTier}</span>
          </div>
        </div>
        <svg
          className={`action-card__chevron ${expanded ? 'action-card__chevron--expanded' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {expanded && detail && (
        <div className="action-card__detail">
          {detail}
        </div>
      )}
    </div>
  );
}
