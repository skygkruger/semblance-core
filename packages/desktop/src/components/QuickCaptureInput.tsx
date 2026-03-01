// Quick Capture Input — Persistent text input for ambient intelligence.
// Minimal design following DESIGN_SYSTEM.md. Single text field with submit.

import { useState, useCallback, useRef } from 'react';

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
      // Clear feedback after 3 seconds
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
    <div className="w-full" data-testid="quick-capture">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || feedback.type === 'submitting'}
          className="flex-1 px-4 py-3 rounded-lg bg-semblance-surface-1 dark:bg-semblance-surface-1-dark border border-semblance-border dark:border-semblance-border-dark text-semblance-text-primary dark:text-semblance-text-primary-dark placeholder:text-semblance-text-muted dark:placeholder:text-semblance-text-muted-dark focus:outline-none focus:ring-2 focus:ring-semblance-primary focus:border-semblance-primary text-base transition-colors duration-fast"
          data-testid="quick-capture-input"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || disabled || feedback.type === 'submitting'}
          className="px-4 py-3 rounded-lg bg-semblance-primary text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-fast"
          data-testid="quick-capture-submit"
        >
          {feedback.type === 'submitting' ? 'Saving...' : 'Capture'}
        </button>
      </div>

      {/* Feedback line */}
      {feedback.type === 'success' && (
        <p
          className="mt-2 text-xs text-semblance-success transition-opacity duration-normal"
          data-testid="quick-capture-feedback"
        >
          {feedback.message}
        </p>
      )}
      {feedback.type === 'error' && (
        <p
          className="mt-2 text-xs text-semblance-attention transition-opacity duration-normal"
          data-testid="quick-capture-error"
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}
