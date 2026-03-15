import { useState } from 'react';
import type { ActionCardProps } from './ActionCard.types';
import { statusLabel } from './ActionCard.types';
import './ActionCard.css';

function formatTierLabel(tier: string): string {
  return tier.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Map raw action types to human-friendly labels */
const ACTION_LABELS: Record<string, string> = {
  'web.search': 'Search the web',
  'web.deep_search': 'Search the web (deep)',
  'web.fetch': 'Fetch web page',
  'email.send': 'Send email',
  'email.draft': 'Draft email',
  'email.fetch': 'Fetch emails',
  'email.archive': 'Archive email',
  'email.move': 'Move email',
  'email.markRead': 'Mark as read',
  'calendar.fetch': 'Fetch calendar',
  'calendar.create': 'Create event',
  'calendar.update': 'Update event',
  'calendar.delete': 'Delete event',
  'reminder.create': 'Create reminder',
  'reminder.update': 'Update reminder',
  'reminder.delete': 'Delete reminder',
  'file.write': 'Save file',
  'contacts.import': 'Import contacts',
  'finance.fetch_transactions': 'Fetch transactions',
  'health.fetch': 'Fetch health data',
};

function humanizeAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const parts = action.split('.');
  return parts.map((p, i) => i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p.replace(/_/g, ' ')).join(' — ');
}

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
    <div className={`action-card surface-slate ${className}`.trim()}>
      <button
        type="button"
        className="action-card__toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className={`action-card__dot action-card__dot--${status}`} />
        <div className="action-card__content">
          <div className="action-card__header">
            <span className="action-card__type">{humanizeAction(actionType)}</span>
            <span className="action-card__timestamp">{timestamp}</span>
          </div>
          <p className="action-card__description">{description}</p>
          <div className="action-card__meta">
            <span className="action-card__meta-item">{statusLabel[status]}</span>
            <span className="action-card__meta-separator">&middot;</span>
            <span className="action-card__meta-item">{formatTierLabel(autonomyTier)}</span>
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
