import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { AlterEgoReceiptProps } from './AlterEgoReceipt.types';

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
    <div
      style={{
        background: '#1a1e26',
        borderLeft: '3px solid #6ECFA3',
        borderRadius: 6,
        padding: 16,
        maxWidth: 400,
        fontFamily: "'DM Sans', sans-serif",
      }}
      role="alert"
      aria-live="polite"
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 500,
              color: '#e8e8e8',
              lineHeight: '20px',
            }}
          >
            {summary}
          </p>
          <p
            style={{
              margin: '6px 0 0 0',
              fontSize: 12,
              color: '#8593A4',
              lineHeight: '18px',
            }}
          >
            {reasoning}
          </p>
        </div>

        {!canUndo && (
          <button
            type="button"
            onClick={() => onDismiss(id)}
            style={{
              background: 'none',
              border: 'none',
              color: '#8593A4',
              cursor: 'pointer',
              padding: 4,
              fontSize: 16,
              lineHeight: 1,
              flexShrink: 0,
            }}
            aria-label={t('a11y.dismiss')}
          >
            ×
          </button>
        )}
      </div>

      {undoExpiresAt !== null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <button
            type="button"
            onClick={canUndo ? () => onUndo(id) : undefined}
            disabled={!canUndo}
            style={{
              background: canUndo ? 'rgba(110, 207, 163, 0.12)' : 'rgba(255, 255, 255, 0.04)',
              border: '1px solid',
              borderColor: canUndo ? 'rgba(110, 207, 163, 0.3)' : 'rgba(255, 255, 255, 0.06)',
              borderRadius: 4,
              color: canUndo ? '#6ECFA3' : '#555',
              fontSize: 13,
              fontWeight: 500,
              padding: '6px 14px',
              cursor: canUndo ? 'pointer' : 'not-allowed',
              fontFamily: "'DM Sans', sans-serif",
              transition: 'opacity 0.15s ease',
            }}
          >
            {t('button.undo')}
          </button>

          {canUndo && secondsRemaining !== null && (
            <span
              style={{
                fontSize: 12,
                color: '#8593A4',
                fontFamily: "'DM Mono', monospace",
              }}
            >
              {secondsRemaining}s
            </span>
          )}

          {undoExpired && (
            <span
              style={{
                fontSize: 12,
                color: '#8593A4',
                fontStyle: 'italic',
              }}
            >
              {t('alter_ego.undo_expired')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
