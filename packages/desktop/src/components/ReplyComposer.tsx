import { useState } from 'react';
import { Card } from '@semblance/ui';

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

  return (
    <Card className="p-4 space-y-3 border-l-[3px] border-l-semblance-accent">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">To:</span>
          <span className="text-xs text-semblance-text-primary dark:text-semblance-text-primary-dark">
            {email.fromName || email.from}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">Subject:</span>
          <span className="text-xs text-semblance-text-primary dark:text-semblance-text-primary-dark">
            {subject}
          </span>
        </div>
      </div>

      {/* Body */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Type your reply..."
        rows={6}
        className="
          w-full px-3 py-2 text-sm resize-y
          bg-semblance-surface-1 dark:bg-semblance-surface-1-dark
          border border-semblance-border dark:border-semblance-border-dark
          rounded-md
          text-semblance-text-primary dark:text-semblance-text-primary-dark
          placeholder:text-semblance-text-secondary dark:placeholder:text-semblance-text-secondary-dark
          focus:outline-none focus:ring-2 focus:ring-semblance-primary/40
        "
      />

      {/* Buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSend(to, subject, body, email.messageId)}
          disabled={body.trim().length === 0}
          className="
            px-4 py-1.5 text-sm font-medium rounded-md
            bg-semblance-primary text-white
            hover:opacity-90 transition-opacity duration-fast
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          Send
        </button>
        <button
          type="button"
          onClick={() => onSaveDraft(to, subject, body, email.messageId)}
          disabled={body.trim().length === 0}
          className="
            px-4 py-1.5 text-sm font-medium rounded-md
            text-semblance-text-secondary dark:text-semblance-text-secondary-dark
            hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark
            transition-colors duration-fast
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          Save Draft
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="
            px-4 py-1.5 text-sm rounded-md
            text-semblance-text-secondary dark:text-semblance-text-secondary-dark
            hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark
            transition-colors duration-fast ml-auto
          "
        >
          Cancel
        </button>
      </div>
    </Card>
  );
}
