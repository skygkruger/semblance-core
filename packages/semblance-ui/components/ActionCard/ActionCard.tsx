import { useState, type ReactNode } from 'react';

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

const statusDotColor: Record<ActionCardProps['status'], string> = {
  success: 'bg-semblance-success',
  pending: 'bg-semblance-accent',
  error: 'bg-semblance-attention',
  rejected: 'bg-semblance-muted',
};

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
    <div
      className={`
        bg-semblance-surface-1 dark:bg-semblance-surface-1-dark
        border border-semblance-border dark:border-semblance-border-dark
        rounded-lg shadow-md p-5
        transition-all duration-normal ease-in-out
        ${className}
      `.trim()}
    >
      <button
        type="button"
        className="w-full text-left flex items-start gap-3 focus:outline-none focus-visible:shadow-focus rounded-md"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className={`mt-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${statusDotColor[status]}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark truncate">
              {actionType}
            </span>
            <span className="text-xs text-semblance-text-tertiary flex-shrink-0">{timestamp}</span>
          </div>
          <p className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark mt-1">
            {description}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-semblance-text-tertiary">{statusLabel[status]}</span>
            <span className="text-xs text-semblance-text-tertiary">·</span>
            <span className="text-xs text-semblance-text-tertiary capitalize">{autonomyTier}</span>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-semblance-muted flex-shrink-0 mt-1 transition-transform duration-fast ${expanded ? 'rotate-180' : ''}`}
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
        <div className="mt-4 pt-4 border-t border-semblance-border dark:border-semblance-border-dark text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
          {detail}
        </div>
      )}
    </div>
  );
}
