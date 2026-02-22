// Reminder Card — Universal Inbox integration for due reminders.
// Shows reminder text, due time, and snooze/dismiss buttons.

import { Card } from '@semblance/ui';

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
    <Card className="p-3 border-l-[3px] border-l-semblance-accent" data-testid="reminder-card">
      <div className="flex items-start gap-3">
        {/* Bell icon */}
        <div className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold flex-shrink-0 bg-semblance-accent/10 text-semblance-accent">
          R
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark">
            {reminder.text}
          </p>

          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
              {formatDueTime(reminder.dueAt)}
            </span>
            {reminder.recurrence !== 'none' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-semblance-surface-2 dark:bg-semblance-surface-2-dark text-semblance-text-muted dark:text-semblance-text-muted-dark">
                {RECURRENCE_LABELS[reminder.recurrence] ?? reminder.recurrence}
              </span>
            )}
          </div>

          {/* Action row */}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <button
              type="button"
              onClick={() => onSnooze(reminder.id, '15min')}
              className="text-xs px-2 py-1 rounded text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark transition-colors duration-fast"
              data-testid="snooze-15min"
            >
              15m
            </button>
            <button
              type="button"
              onClick={() => onSnooze(reminder.id, '1hr')}
              className="text-xs px-2 py-1 rounded text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark transition-colors duration-fast"
              data-testid="snooze-1hr"
            >
              1h
            </button>
            <button
              type="button"
              onClick={() => onSnooze(reminder.id, 'tomorrow')}
              className="text-xs px-2 py-1 rounded text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark transition-colors duration-fast"
              data-testid="snooze-tomorrow"
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={() => onDismiss(reminder.id)}
              className="text-xs px-2 py-1 rounded text-semblance-attention hover:bg-semblance-attention/10 transition-colors duration-fast"
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
