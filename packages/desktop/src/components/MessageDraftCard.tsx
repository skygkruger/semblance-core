// MessageDraftCard — Chat card for SMS drafts.
// Shows recipient name + masked phone, body text, and Send/Edit/Cancel buttons.
// Guardian: click to send. Partner: 5s countdown + Cancel. Alter Ego: confirmation after send.

import { useState, useEffect, useCallback } from 'react';
import { Card, Button } from '@semblance/ui';

interface MessageDraftCardProps {
  recipientName: string;
  maskedPhone: string;
  body: string;
  autonomyTier: 'guardian' | 'partner' | 'alter_ego';
  onSend: () => void;
  onEdit: (newBody: string) => void;
  onCancel: () => void;
}

export function MessageDraftCard({
  recipientName,
  maskedPhone,
  body,
  autonomyTier,
  onSend,
  onEdit,
  onCancel,
}: MessageDraftCardProps) {
  const [countdown, setCountdown] = useState<number | null>(
    autonomyTier === 'partner' ? 5 : null
  );
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(body);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setTimeout(() => {
      if (countdown === 1) {
        onSend();
        setSent(true);
        setCountdown(null);
      } else {
        setCountdown(countdown - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, onSend]);

  const handleSend = useCallback(() => {
    onSend();
    setSent(true);
    setCountdown(null);
  }, [onSend]);

  const handleCancel = useCallback(() => {
    setCountdown(null);
    onCancel();
  }, [onCancel]);

  const handleSaveEdit = useCallback(() => {
    onEdit(editBody);
    setEditing(false);
    // Reset countdown for partner tier
    if (autonomyTier === 'partner') {
      setCountdown(5);
    }
  }, [editBody, onEdit, autonomyTier]);

  if (sent && autonomyTier === 'alter_ego') {
    return (
      <Card>
        <div className="space-y-2">
          <p className="text-sm text-semblance-success dark:text-semblance-success">
            Message sent to {recipientName}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark">
            {recipientName}
          </span>
          <span className="text-xs text-semblance-text-tertiary">
            {maskedPhone}
          </span>
        </div>

        {editing ? (
          <div className="space-y-2">
            <textarea
              className="w-full p-2 text-sm rounded-md border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark text-semblance-text-primary dark:text-semblance-text-primary-dark"
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveEdit}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
            {body}
          </p>
        )}

        {!editing && !sent && (
          <div className="flex items-center gap-2">
            {autonomyTier === 'guardian' && (
              <Button size="sm" onClick={handleSend}>Send</Button>
            )}

            {autonomyTier === 'partner' && countdown !== null && (
              <Button size="sm" onClick={handleCancel} variant="ghost">
                Cancel ({countdown}s)
              </Button>
            )}

            {autonomyTier === 'alter_ego' && (
              <span className="text-xs text-semblance-text-tertiary">
                Sending...
              </span>
            )}

            {!sent && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancel}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
