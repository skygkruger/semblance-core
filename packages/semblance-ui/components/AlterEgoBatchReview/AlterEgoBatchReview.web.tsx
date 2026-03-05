import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button/Button';
import type { AlterEgoBatchReviewProps } from './AlterEgoBatchReview.types';
import './AlterEgoBatchReview.css';

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
      className="batch-review__overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('alter_ego.batch_review_title', { defaultValue: 'Review Pending Actions' })}
    >
      <div className="batch-review surface-slate">
        {/* Header region with veridian gradient tint */}
        <div className="batch-review__header-region">
          <p className="batch-review__subtitle">
            {t('alter_ego.batch_review_subtitle', {
              count: items.length,
              defaultValue: '{{count}} actions pending your review',
            })}
          </p>
          <h2 className="batch-review__title">
            {t('alter_ego.batch_review_title', { defaultValue: 'Review Pending Actions' })}
          </h2>
        </div>

        <div className="batch-review__divider" />

        {/* Shortcut buttons */}
        <div className="batch-review__shortcuts">
          <button
            type="button"
            onClick={approveAll}
            className="batch-review__shortcut-btn batch-review__shortcut-btn--approve"
          >
            {t('alter_ego.approve_all', { defaultValue: 'Approve All' })}
          </button>
          <button
            type="button"
            onClick={rejectAll}
            className="batch-review__shortcut-btn batch-review__shortcut-btn--reject"
          >
            {t('alter_ego.reject_all', { defaultValue: 'Reject All' })}
          </button>
        </div>

        {/* Item list */}
        <div className="batch-review__items">
          {items.map((item) => {
            const approved = decisions[item.id] ?? true;
            return (
              <label key={item.id} className="batch-review__item">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={() => toggleItem(item.id)}
                  className="batch-review__checkbox"
                />
                <div className="batch-review__item-content">
                  <div className="batch-review__item-header">
                    <span className={`batch-review__item-summary ${!approved ? 'batch-review__item-summary--dimmed' : ''}`}>
                      {item.summary}
                    </span>
                    <span className="batch-review__item-category">{item.category}</span>
                  </div>
                  <p className="batch-review__item-reasoning">{item.reasoning}</p>
                </div>
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div className="batch-review__footer">
          <span className="batch-review__tally">
            {approvedCount} {t('alter_ego.approved', { defaultValue: 'approved' })} / {rejectedCount} {t('alter_ego.rejected', { defaultValue: 'rejected' })}
          </span>
          <Button variant="opal" size="md" onClick={handleConfirm}>
            <span className="btn__text">{t('button.confirm', { defaultValue: 'Confirm' })}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
