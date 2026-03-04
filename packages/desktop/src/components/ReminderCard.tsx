// Reminder Card — Universal Inbox integration for due reminders.

import { Card } from '@semblance/ui';
import './ReminderCard.css';

interface ReminderCardData {
  id: string;
  text: string;
  dueAt: string;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
  source: string;
}

interface ReminderCardProps {
  reminder: ReminderCardData;
  onSnooze: (id: string, duration: '15min' | '1hr' | '3hr' | 'tomorrow') => void;
  onDismiss: (id: string) => void;
}

function formatDueTime(dueAt: string): string {
  const due = new Date(dueAt);
  const now = new Date();
  const diffMs = now.getTime() - due.getTime();

  if (diffMs < 60_000) return 'Just now';
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86400_000) return `${Math.floor(diffMs / 3600_000)}h ago`;
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const RECURRENCE_LABELS: Record<string, string> = {
  daily: 'Repeats daily',
  weekly: 'Repeats weekly',
  monthly: 'Repeats monthly',
};

export function ReminderCard({ reminder, onSnooze, onDismiss }: ReminderCardProps) {
  return (
    <Card className="reminder-card" data-testid="reminder-card">
      <div className="reminder-card__body">
        <div className="reminder-card__icon">R</div>

        <div className="reminder-card__content">
          <p className="reminder-card__text">{reminder.text}</p>

          <div className="reminder-card__meta">
            <span className="reminder-card__due">{formatDueTime(reminder.dueAt)}</span>
            {reminder.recurrence !== 'none' && (
              <span className="reminder-card__recurrence">
                {RECURRENCE_LABELS[reminder.recurrence] ?? reminder.recurrence}
              </span>
            )}
          </div>

          <div className="reminder-card__actions">
            <button
              type="button"
              onClick={() => onSnooze(reminder.id, '15min')}
              className="reminder-card__action-btn"
              data-testid="snooze-15min"
            >
              15m
            </button>
            <button
              type="button"
              onClick={() => onSnooze(reminder.id, '1hr')}
              className="reminder-card__action-btn"
              data-testid="snooze-1hr"
            >
              1h
            </button>
            <button
              type="button"
              onClick={() => onSnooze(reminder.id, 'tomorrow')}
              className="reminder-card__action-btn"
              data-testid="snooze-tomorrow"
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={() => onDismiss(reminder.id)}
              className="reminder-card__action-btn reminder-card__action-btn--dismiss"
              data-testid="dismiss-reminder"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
