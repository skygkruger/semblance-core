import { useState } from 'react';
import { Card } from '@semblance/ui';
import './ReplyComposer.css';

interface IndexedEmail {
  messageId: string;
  from: string;
  fromName: string;
  subject: string;
}

interface ReplyComposerProps {
  /** Original email context for replies. Omit for new compose. */
  email?: IndexedEmail;
  /** For new compose: recipient list. Ignored when email is provided (uses email.from). */
  to?: string[];
  /** For new compose: recipient display names. Parallel to `to`. */
  toNames?: string[];
  /** For new compose: subject line. Ignored when email is provided. */
  subject?: string;
  draftBody?: string;
  onSend: (to: string[], subject: string, body: string, replyToMessageId?: string) => void;
  onSaveDraft: (to: string[], subject: string, body: string, replyToMessageId?: string) => void;
  onCancel: () => void;
}

export function ReplyComposer({ email, to: toProp, toNames, subject: subjectProp, draftBody, onSend, onSaveDraft, onCancel }: ReplyComposerProps) {
  const [body, setBody] = useState(draftBody ?? '');

  // Derive fields based on reply vs compose mode
  const isReply = !!email;
  const to = isReply ? [email.from] : (toProp ?? []);
  const subject = isReply
    ? (email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`)
    : (subjectProp ?? '');
  const displayTo = isReply
    ? (email.fromName || email.from)
    : (toNames && toNames.length > 0 ? toNames.join(', ') : to.join(', '));
  const replyToMessageId = isReply ? email.messageId : undefined;

  const hasText = body.trim().length > 0;

  return (
    <Card className={`reply-composer surface-compose${hasText ? ' reply-composer--active surface-compose--active' : ''}`}>
      <div className="reply-composer__header">
        <div className="reply-composer__field">
          <span className="reply-composer__field-label">To:</span>
          <span className="reply-composer__field-value">{displayTo || 'Recipient'}</span>
        </div>
        <div className="reply-composer__field">
          <span className="reply-composer__field-label">Subject:</span>
          <span className="reply-composer__field-value">{subject || '(no subject)'}</span>
        </div>
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={isReply ? 'Type your reply...' : 'Compose your message...'}
        rows={6}
        className="reply-composer__textarea surface-compose__textarea"
      />

      <div className="reply-composer__actions">
        <button
          type="button"
          onClick={() => onSend(to, subject, body, replyToMessageId)}
          disabled={body.trim().length === 0}
          className={`btn btn--opal btn--sm reply-composer__send-btn${hasText ? ' reply-composer__send-btn--active' : ''}`}
        >
          <span className="btn__text">Send</span>
        </button>
        <button
          type="button"
          onClick={() => onSaveDraft(to, subject, body, replyToMessageId)}
          disabled={body.trim().length === 0}
          className="reply-composer__ghost-btn reply-composer__ghost-btn--save"
        >
          Save Draft
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="reply-composer__ghost-btn reply-composer__ghost-btn--end"
        >
          Cancel
        </button>
      </div>
    </Card>
  );
}
