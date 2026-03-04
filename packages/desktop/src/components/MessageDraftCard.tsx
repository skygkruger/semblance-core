// MessageDraftCard — Chat card for SMS drafts.
// Guardian: click to send. Partner: 10s countdown + Cancel. Alter Ego: auto-sends with brief cancel window.

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

const ALTER_EGO_DELAY = 5;

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
    autonomyTier === 'partner' ? 10
      : autonomyTier === 'alter_ego' ? ALTER_EGO_DELAY
      : null
  );
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(body);
  const [sent, setSent] = useState(false);
  const [interrupted, setInterrupted] = useState(false);

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

  const handleAlterEgoCancel = useCallback(() => {
    setCountdown(null);
    setInterrupted(true);
  }, []);

  const handleSaveEdit = useCallback(() => {
    onEdit(editBody);
    setEditing(false);
    setInterrupted(false);
    if (autonomyTier === 'partner') {
      setCountdown(10);
    } else if (autonomyTier === 'alter_ego') {
      setCountdown(ALTER_EGO_DELAY);
    }
  }, [editBody, onEdit, autonomyTier]);

  if (sent) {
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
            className={`msg-draft__textarea${editBody.trim() ? ' msg-draft__textarea--has-text' : ''}`}
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={3}
          />
          <div className="msg-draft__edit-actions">
            <Button size="sm" onClick={handleSaveEdit}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setInterrupted(false); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <p className="msg-draft__body">{body}</p>
      )}

      {!editing && !sent && (
        <div className="msg-draft__actions">
          {/* Guardian: manual send + edit + cancel */}
          {autonomyTier === 'guardian' && (
            <>
              <Button size="sm" onClick={handleSend}>Send</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={handleCancel}>Cancel</Button>
            </>
          )}

          {/* Partner: countdown with cancel, then edit + cancel after countdown ends */}
          {autonomyTier === 'partner' && countdown !== null && (
            <Button size="sm" onClick={handleCancel} variant="ghost">
              Cancel ({countdown}s)
            </Button>
          )}
          {autonomyTier === 'partner' && countdown === null && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={handleCancel}>Cancel</Button>
            </>
          )}

          {/* Alter Ego: sending + cancel only. If cancelled, prompt + edit */}
          {autonomyTier === 'alter_ego' && !interrupted && countdown !== null && (
            <>
              <span className="msg-draft__sending">Sending...</span>
              <Button size="sm" variant="ghost" onClick={handleAlterEgoCancel}>Cancel</Button>
            </>
          )}
          {autonomyTier === 'alter_ego' && interrupted && (
            <>
              <span className="msg-draft__prompt">Is there anything you would like to change?</span>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={handleCancel}>Dismiss</Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
