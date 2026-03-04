// Quick Capture Input — Persistent text input for ambient intelligence.
// Minimal design following DESIGN_SYSTEM.md. Single text field with submit.

import { useState, useCallback, useRef } from 'react';
import './QuickCaptureInput.css';

export interface CaptureResultFeedback {
  hasReminder: boolean;
  reminderDueAt: string | null;
  linkedContextCount: number;
}

interface QuickCaptureInputProps {
  onCapture: (text: string) => Promise<CaptureResultFeedback>;
  placeholder?: string;
  disabled?: boolean;
}

type FeedbackState =
  | { type: 'idle' }
  | { type: 'submitting' }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

export function QuickCaptureInput({
  onCapture,
  placeholder = 'Awaiting direction',
  disabled = false,
}: QuickCaptureInputProps) {
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<FeedbackState>({ type: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);

  const formatFeedback = useCallback((result: CaptureResultFeedback): string => {
    const parts: string[] = ['Captured'];
    if (result.hasReminder && result.reminderDueAt) {
      const due = new Date(result.reminderDueAt);
      const timeStr = due.toLocaleString(undefined, {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
      });
      parts.push(`Reminder set for ${timeStr}`);
    }
    if (result.linkedContextCount > 0) {
      parts.push(`Linked to ${result.linkedContextCount} related item${result.linkedContextCount > 1 ? 's' : ''}`);
    }
    return parts.join(' — ');
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || feedback.type === 'submitting') return;

    setFeedback({ type: 'submitting' });
    try {
      const result = await onCapture(trimmed);
      const message = formatFeedback(result);
      setFeedback({ type: 'success', message });
      setText('');
      setTimeout(() => setFeedback({ type: 'idle' }), 3000);
    } catch {
      setFeedback({ type: 'error', message: 'Capture failed. Try again.' });
      setTimeout(() => setFeedback({ type: 'idle' }), 3000);
    }
  }, [text, feedback.type, onCapture, formatFeedback]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className={`quick-capture${text.trim() ? ' quick-capture--active' : ''}`} data-testid="quick-capture">
      <div className="quick-capture__row">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || feedback.type === 'submitting'}
          className="quick-capture__input"
          data-testid="quick-capture-input"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || disabled || feedback.type === 'submitting'}
          className={`quick-capture__submit${text.trim() ? ' quick-capture__submit--active' : ''}`}
          data-testid="quick-capture-submit"
        >
          {feedback.type === 'submitting' ? 'Saving...' : 'Capture'}
        </button>
      </div>

      {feedback.type === 'success' && (
        <p className="quick-capture__feedback quick-capture__feedback--success" data-testid="quick-capture-feedback">
          {feedback.message}
        </p>
      )}
      {feedback.type === 'error' && (
        <p className="quick-capture__feedback quick-capture__feedback--error" data-testid="quick-capture-error">
          {feedback.message}
        </p>
      )}
    </div>
  );
}
