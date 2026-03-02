import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { AlterEgoBatchReviewProps } from './AlterEgoBatchReview.types';

export function AlterEgoBatchReview({ items, onConfirm }: AlterEgoBatchReviewProps) {
  const { t } = useTranslation();

  // Track approval state per item; default all to approved
  const [decisions, setDecisions] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const item of items) {
      initial[item.id] = true;
    }
    return initial;
  });

  const toggleItem = useCallback((id: string) => {
    setDecisions((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const approveAll = useCallback(() => {
    setDecisions((prev) => {
      const next: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) {
        next[key] = true;
      }
      return next;
    });
  }, []);

  const rejectAll = useCallback(() => {
    setDecisions((prev) => {
      const next: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) {
        next[key] = false;
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const approvedIds: string[] = [];
    const rejectedIds: string[] = [];
    for (const [id, approved] of Object.entries(decisions)) {
      if (approved) {
        approvedIds.push(id);
      } else {
        rejectedIds.push(id);
      }
    }
    onConfirm(approvedIds, rejectedIds);
  }, [decisions, onConfirm]);

  const approvedCount = Object.values(decisions).filter(Boolean).length;
  const rejectedCount = items.length - approvedCount;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.7)',
        zIndex: 9999,
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t('alter_ego.batch_review_title')}
    >
      <div
        style={{
          background: '#0B0E11',
          border: '1px solid #2a2e36',
          borderRadius: 8,
          maxWidth: 520,
          width: '90vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 500,
              color: '#e8e8e8',
              lineHeight: '22px',
            }}
          >
            {t('alter_ego.batch_review_title')}
          </h2>
          <p
            style={{
              margin: '8px 0 0 0',
              fontSize: 13,
              color: '#8593A4',
              lineHeight: '18px',
            }}
          >
            {t('alter_ego.batch_review_subtitle', {
              count: items.length,
              defaultValue: '{{count}} actions pending your review',
            })}
          </p>
        </div>

        {/* Shortcut buttons */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '12px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <button
            type="button"
            onClick={approveAll}
            style={{
              background: 'rgba(110, 207, 163, 0.1)',
              border: '1px solid rgba(110, 207, 163, 0.25)',
              borderRadius: 4,
              color: '#6ECFA3',
              fontSize: 12,
              fontWeight: 500,
              padding: '5px 12px',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {t('alter_ego.approve_all')}
          </button>
          <button
            type="button"
            onClick={rejectAll}
            style={{
              background: 'rgba(201, 123, 110, 0.1)',
              border: '1px solid rgba(201, 123, 110, 0.25)',
              borderRadius: 4,
              color: '#C97B6E',
              fontSize: 12,
              fontWeight: 500,
              padding: '5px 12px',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {t('alter_ego.reject_all')}
          </button>
        </div>

        {/* Item list */}
        <div
          style={{
            overflowY: 'auto',
            flex: 1,
            padding: '8px 24px',
          }}
        >
          {items.map((item) => {
            const approved = decisions[item.id] ?? true;
            return (
              <label
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px 0',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={() => toggleItem(item.id)}
                  style={{
                    marginTop: 3,
                    accentColor: '#6ECFA3',
                    width: 16,
                    height: 16,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: approved ? '#e8e8e8' : '#555',
                        transition: 'color 0.15s ease',
                      }}
                    >
                      {item.summary}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: '#8593A4',
                        fontFamily: "'DM Mono', monospace",
                        flexShrink: 0,
                      }}
                    >
                      {item.category}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: '#8593A4',
                      lineHeight: '17px',
                    }}
                  >
                    {item.reasoning}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: '#8593A4',
              fontFamily: "'DM Mono', monospace",
            }}
          >
            {approvedCount} {t('alter_ego.approved')} / {rejectedCount} {t('alter_ego.rejected')}
          </span>
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              background: '#6ECFA3',
              border: 'none',
              borderRadius: 4,
              color: '#0B0E11',
              fontSize: 14,
              fontWeight: 600,
              padding: '8px 24px',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {t('button.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
