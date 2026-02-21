import { Card } from '@semblance/ui';

interface IndexedEmail {
  id: string;
  messageId: string;
  from: string;
  fromName: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  priority: 'high' | 'normal' | 'low';
}

interface ActionTaken {
  type: 'archived' | 'categorized' | 'replied' | 'drafted';
  timestamp: string;
  undoAvailable: boolean;
  description: string;
}

interface EmailCardProps {
  email: IndexedEmail;
  aiCategory: string[];
  aiPriority: 'high' | 'normal' | 'low';
  actionTaken: ActionTaken | null;
  onReply: () => void;
  onArchive: () => void;
  onSnooze: () => void;
  onExpand: () => void;
}

function formatRelativeTime(isoString: string): string {
  try {
    const diff = Date.now() - new Date(isoString).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

const PRIORITY_STYLES = {
  high: 'bg-semblance-attention',
  normal: 'bg-semblance-primary',
  low: 'bg-semblance-text-secondary dark:bg-semblance-text-secondary-dark',
} as const;

export function EmailCard({
  email,
  aiCategory,
  aiPriority,
  actionTaken,
  onReply,
  onArchive,
  onSnooze,
  onExpand,
}: EmailCardProps) {
  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-start gap-3">
        {/* Priority dot */}
        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${PRIORITY_STYLES[aiPriority]}`} />

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`text-sm truncate ${!email.isRead ? 'font-semibold' : 'font-medium'} text-semblance-text-primary dark:text-semblance-text-primary-dark`}>
              {email.fromName || email.from}
            </span>
            <span className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark whitespace-nowrap flex-shrink-0">
              {formatRelativeTime(email.receivedAt)}
            </span>
          </div>

          <p className={`text-sm truncate ${!email.isRead ? 'font-medium' : ''} text-semblance-text-primary dark:text-semblance-text-primary-dark`}>
            {email.subject}
          </p>

          <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark line-clamp-1 mt-0.5">
            {email.snippet}
          </p>

          {/* Category badges */}
          {aiCategory.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {aiCategory.map(cat => (
                <span
                  key={cat}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-semblance-surface-2 dark:bg-semblance-surface-2-dark text-semblance-text-secondary dark:text-semblance-text-secondary-dark"
                >
                  {cat}
                </span>
              ))}
              {email.hasAttachments && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-semblance-surface-2 dark:bg-semblance-surface-2-dark text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                  attachment
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action taken indicator */}
      {actionTaken && (
        <div className="flex items-center gap-2 pl-5">
          <span className="text-xs px-2 py-0.5 rounded bg-semblance-success/10 text-semblance-success">
            {actionTaken.description}
          </span>
        </div>
      )}

      {/* Quick action buttons */}
      {!actionTaken && (
        <div className="flex gap-2 pl-5">
          <button
            type="button"
            onClick={onReply}
            className="text-xs px-2.5 py-1 rounded text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark transition-colors duration-fast"
          >
            Reply
          </button>
          <button
            type="button"
            onClick={onArchive}
            className="text-xs px-2.5 py-1 rounded text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark transition-colors duration-fast"
          >
            Archive
          </button>
          <button
            type="button"
            onClick={onSnooze}
            className="text-xs px-2.5 py-1 rounded text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark transition-colors duration-fast"
          >
            Snooze
          </button>
          <button
            type="button"
            onClick={onExpand}
            className="text-xs px-2.5 py-1 rounded text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark transition-colors duration-fast ml-auto"
          >
            View
          </button>
        </div>
      )}
    </Card>
  );
}
