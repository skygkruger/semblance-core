import { useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button/Button';
import type { ApprovalCardProps, RiskLevel } from './ApprovalCard.types';
import { RISK_COLORS } from './ApprovalCard.types';
import './ApprovalCard.css';

/** Highlight standalone "no" in dismissed context with risk-level color */
function colorCodeNo(text: string, risk: RiskLevel): ReactNode {
  const match = text.match(/\bno\b/i);
  if (!match || match.index === undefined) return text;
  const before = text.slice(0, match.index);
  const word = match[0];
  const after = text.slice(match.index + word.length);
  return (
    <>
      {before}
      <span style={{ color: RISK_COLORS[risk], fontWeight: 500 }}>{word}</span>
      {after}
    </>
  );
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
  'email.markRead': 'Mark email as read',
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
  'service.api_call': 'API call',
};

function humanizeAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // Fallback: convert dot notation to readable text (e.g. "cloud.auth" → "Cloud auth")
  const parts = action.split('.');
  const readable = parts.map((p, i) => i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p.replace(/_/g, ' ')).join(' — ');
  return readable;
}

export function ApprovalCard({
  action,
  context,
  dataOut = [],
  risk = 'low',
  state = 'pending',
  onApprove,
  onDismiss,
  className = '',
}: ApprovalCardProps) {
  const { t } = useTranslation();
  const [animating, setAnimating] = useState(true);

  useEffect(() => {
    console.log('[ApprovalCard] mounted');
    const timer = setTimeout(() => setAnimating(false), 1100);
    return () => clearTimeout(timer);
  }, []);

  const stateClass = `approval-card--${state}`;
  const opalClass = 'surface-opal opal-surface';

  return (
    <div
      className={`approval-card ${opalClass} ${stateClass} ${className}`.trim()}
      data-risk={risk}
      data-animating={animating ? 'true' : undefined}
    >
      <div className="approval-card__header">
        <h3 className="approval-card__action">{humanizeAction(action)}</h3>
        <span className={`approval-card__risk approval-card__risk--${risk}`}>
          {risk}
        </span>
      </div>

      <p className="approval-card__context">
        {state === 'dismissed' ? colorCodeNo(context, risk) : context}
      </p>

      {dataOut.length > 0 && (
        <>
          <div className="approval-card__divider" />
          <p className="approval-card__data-label">{t('screen.approval.data_leaving')}</p>
          <ul className="approval-card__data-list">
            {dataOut.map((item, i) => (
              <li key={i} className="approval-card__data-item">{item}</li>
            ))}
          </ul>
        </>
      )}

      {state === 'pending' && (
        <div className="approval-card__actions">
          <Button variant="opal" size="md" onClick={onApprove}>
            <span className="btn__text">{t('button.approve')}</span>
          </Button>
          <Button variant="dismiss" size="md" onClick={onDismiss}>
            {t('button.dismiss')}
          </Button>
        </div>
      )}
    </div>
  );
}
