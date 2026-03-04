import { useTranslation } from 'react-i18next';
import { Card } from '../Card';
import type { AlterEgoDraftReviewProps } from './AlterEgoDraftReview.types';
import './AlterEgoDraftReview.css';

export function AlterEgoDraftReview({
  actionId,
  contactEmail,
  subject,
  body,
  trustCount,
  trustThreshold,
  onSend,
  onEdit,
}: AlterEgoDraftReviewProps) {
  const { t } = useTranslation();

  return (
    <Card className="draft-review">
      <div className="draft-review__header">
        <div className="draft-review__field">
          <span className="draft-review__field-label">
            {t('alter_ego.to', { defaultValue: 'To:' })}
          </span>
          <span className="draft-review__field-value">{contactEmail}</span>
        </div>
        {subject && (
          <div className="draft-review__field">
            <span className="draft-review__field-label">
              {t('alter_ego.subject', { defaultValue: 'Subject:' })}
            </span>
            <span className="draft-review__field-value">{subject}</span>
          </div>
        )}
      </div>

      <div className="draft-review__body">{body}</div>

      <div className="draft-review__actions">
        <button
          type="button"
          onClick={() => onSend(actionId)}
          className="draft-review__send-btn"
        >
          {t('button.send', { defaultValue: 'Send' })}
        </button>
        <span className="draft-review__trust">
          {t('alter_ego.trust_indicator', {
            count: trustCount,
            threshold: trustThreshold,
            defaultValue: '{{count}} of {{threshold}} successful sends',
          })}
        </span>
        <button
          type="button"
          onClick={() => onEdit(body)}
          className="draft-review__ghost-btn draft-review__ghost-btn--end"
        >
          {t('button.edit', { defaultValue: 'Edit' })}
        </button>
      </div>
    </Card>
  );
}
