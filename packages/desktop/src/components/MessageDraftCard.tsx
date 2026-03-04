// MessageDraftCard — Chat card for SMS drafts.
// Guardian: click to send. Partner: 5s countdown + Cancel. Alter Ego: confirmation after send.

import { useState, useEffect, useCallback } from 'react';
import { Card, Button } from '@semblance/ui';
import './MessageDraftCard.css';

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
    if (autonomyTier === 'partner') {
      setCountdown(5);
    }
  }, [editBody, onEdit, autonomyTier]);

  if (sent && autonomyTier === 'alter_ego') {
    return (
      <Card>
        <p className="msg-draft__sent">Message sent to {recipientName}</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="msg-draft__header">
        <span className="msg-draft__recipient">{recipientName}</span>
        <span className="msg-draft__phone">{maskedPhone}</span>
      </div>

      {editing ? (
        <div>
          <textarea
            className="msg-draft__textarea"
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={3}
          />
          <div className="msg-draft__edit-actions">
            <Button size="sm" onClick={handleSaveEdit}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <p className="msg-draft__body">{body}</p>
      )}

      {!editing && !sent && (
        <div className="msg-draft__actions">
          {autonomyTier === 'guardian' && (
            <Button size="sm" onClick={handleSend}>Send</Button>
          )}

          {autonomyTier === 'partner' && countdown !== null && (
            <Button size="sm" onClick={handleCancel} variant="ghost">
              Cancel ({countdown}s)
            </Button>
          )}

          {autonomyTier === 'alter_ego' && (
            <span className="msg-draft__sending">Sending...</span>
          )}

          {!sent && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={handleCancel}>Cancel</Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
