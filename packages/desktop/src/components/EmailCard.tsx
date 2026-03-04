import { Card } from '@semblance/ui';
import './EmailCard.css';

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
    <Card>
      <div className="email-card__row">
        <div className={`email-card__dot email-card__dot--${aiPriority}`} />

        <div className="email-card__content">
          <div className="email-card__header">
            <span className={`email-card__sender${!email.isRead ? ' email-card__sender--unread' : ''}`}>
              {email.fromName || email.from}
            </span>
            <span className="email-card__time">{formatRelativeTime(email.receivedAt)}</span>
          </div>

          <p className={`email-card__subject${!email.isRead ? ' email-card__subject--unread' : ''}`}>
            {email.subject}
          </p>

          <p className="email-card__snippet">{email.snippet}</p>

          {aiCategory.length > 0 && (
            <div className="email-card__badges">
              {aiCategory.map(cat => (
                <span key={cat} className="email-card__badge">{cat}</span>
              ))}
              {email.hasAttachments && (
                <span className="email-card__badge">attachment</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="email-card__actions">
        {actionTaken ? (
          <span className="email-card__action-label">{actionTaken.description}</span>
        ) : (
          <>
            <button type="button" onClick={onReply} className="email-card__action-btn">Reply</button>
            <button type="button" onClick={onArchive} className="email-card__action-btn">Archive</button>
            <button type="button" onClick={onSnooze} className="email-card__action-btn">Snooze</button>
          </>
        )}
        <button type="button" onClick={onExpand} className="email-card__action-btn email-card__action-btn--end">View</button>
      </div>
    </Card>
  );
}
