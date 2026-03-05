import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button/Button';
import type { AlterEgoReceiptProps } from './AlterEgoReceipt.types';
import './AlterEgoReceipt.css';

export function AlterEgoReceipt({
  id,
  summary,
  reasoning,
  undoExpiresAt,
  onUndo,
  onDismiss,
}: AlterEgoReceiptProps) {
  const { t } = useTranslation();
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [undoExpired, setUndoExpired] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!undoExpiresAt) {
      setSecondsRemaining(null);
      return;
    }

    function computeRemaining(): number {
      const expiresMs = new Date(undoExpiresAt!).getTime();
      const nowMs = Date.now();
      return Math.max(0, Math.ceil((expiresMs - nowMs) / 1000));
    }

    setSecondsRemaining(computeRemaining());

    intervalRef.current = setInterval(() => {
      const remaining = computeRemaining();
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setUndoExpired(true);
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [undoExpiresAt]);

  useEffect(() => {
    if (undoExpired) {
      const timeout = setTimeout(() => {
        onDismiss(id);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [undoExpired, id, onDismiss]);

  const canUndo = undoExpiresAt !== null && !undoExpired && secondsRemaining !== null && secondsRemaining > 0;

  return (
    <div className="receipt surface-slate" role="alert" aria-live="polite">
      <div className="receipt__row">
        <span className="receipt__dot" />
        <div className="receipt__content">
          <p className="receipt__summary">{summary}</p>
          <p className="receipt__reasoning">{reasoning}</p>
        </div>
        {!canUndo && (
          <button
            type="button"
            onClick={() => onDismiss(id)}
            className="receipt__dismiss"
            aria-label={t('a11y.dismiss', { defaultValue: 'Dismiss' })}
          >
            &times;
          </button>
        )}
      </div>

      {undoExpiresAt !== null && (
        <div className="receipt__undo-panel">
          <Button
            variant="ghost"
            size="sm"
            onClick={canUndo ? () => onUndo(id) : undefined}
            disabled={!canUndo}
          >
            {t('button.undo', { defaultValue: 'Undo' })}
          </Button>

          {canUndo && secondsRemaining !== null && (
            <span className="receipt__timer">{secondsRemaining}s</span>
          )}

          {undoExpired && (
            <span className="receipt__expired">
              {t('alter_ego.undo_expired', { defaultValue: 'Undo expired' })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
