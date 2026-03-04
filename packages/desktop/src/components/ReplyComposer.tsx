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
  email: IndexedEmail;
  draftBody?: string;
  onSend: (to: string[], subject: string, body: string, replyToMessageId?: string) => void;
  onSaveDraft: (to: string[], subject: string, body: string, replyToMessageId?: string) => void;
  onCancel: () => void;
}

export function ReplyComposer({ email, draftBody, onSend, onSaveDraft, onCancel }: ReplyComposerProps) {
  const [body, setBody] = useState(draftBody ?? '');
  const subject = email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`;
  const to = [email.from];

  const hasText = body.trim().length > 0;

  return (
    <Card className={`reply-composer${hasText ? ' reply-composer--active' : ''}`}>
      <div className="reply-composer__header">
        <div className="reply-composer__field">
          <span className="reply-composer__field-label">To:</span>
          <span className="reply-composer__field-value">{email.fromName || email.from}</span>
        </div>
        <div className="reply-composer__field">
          <span className="reply-composer__field-label">Subject:</span>
          <span className="reply-composer__field-value">{subject}</span>
        </div>
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Type your reply..."
        rows={6}
        className="reply-composer__textarea"
      />

      <div className="reply-composer__actions">
        <button
          type="button"
          onClick={() => onSend(to, subject, body, email.messageId)}
          disabled={body.trim().length === 0}
          className={`reply-composer__send-btn${hasText ? ' reply-composer__send-btn--active' : ''}`}
        >
          Send
        </button>
        <button
          type="button"
          onClick={() => onSaveDraft(to, subject, body, email.messageId)}
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
