import { useTranslation } from 'react-i18next';
import type { AlterEgoDraftReviewProps } from './AlterEgoDraftReview.types';

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
    <div
      style={{
        background: '#12161b',
        border: '1px solid #2a2e36',
        borderLeft: '3px solid #6ECFA3',
        borderRadius: 6,
        padding: 16,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: '#6ECFA3',
            fontFamily: "'DM Mono', monospace",
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {t('alter_ego.draft_review')}
        </span>
      </div>

      {/* Recipient */}
      <div style={{ marginBottom: 8 }}>
        <span
          style={{
            fontSize: 11,
            color: '#8593A4',
            fontFamily: "'DM Mono', monospace",
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {t('alter_ego.to')}
        </span>
        <span
          style={{
            fontSize: 13,
            color: '#e8e8e8',
            marginLeft: 8,
          }}
        >
          {contactEmail}
        </span>
      </div>

      {/* Subject */}
      {subject && (
        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              fontSize: 11,
              color: '#8593A4',
              fontFamily: "'DM Mono', monospace",
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {t('alter_ego.subject')}
          </span>
          <span
            style={{
              fontSize: 13,
              color: '#e8e8e8',
              marginLeft: 8,
            }}
          >
            {subject}
          </span>
        </div>
      )}

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: 'rgba(255, 255, 255, 0.06)',
          margin: '12px 0',
        }}
      />

      {/* Body */}
      <div
        style={{
          fontSize: 13,
          color: '#e8e8e8',
          lineHeight: '20px',
          whiteSpace: 'pre-wrap',
          padding: '8px 0',
        }}
      >
        {body}
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: 'rgba(255, 255, 255, 0.06)',
          margin: '12px 0',
        }}
      />

      {/* Trust indicator + actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: '#8593A4',
            fontFamily: "'DM Mono', monospace",
          }}
        >
          {t('alter_ego.trust_indicator', {
            count: trustCount,
            threshold: trustThreshold,
            defaultValue: '{{count}} of {{threshold}} successful sends to this contact',
          })}
        </span>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => onEdit(body)}
            style={{
              background: 'rgba(133, 147, 164, 0.1)',
              border: '1px solid rgba(133, 147, 164, 0.25)',
              borderRadius: 4,
              color: '#8593A4',
              fontSize: 13,
              fontWeight: 500,
              padding: '6px 14px',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {t('button.edit')}
          </button>
          <button
            type="button"
            onClick={() => onSend(actionId)}
            style={{
              background: 'rgba(110, 207, 163, 0.12)',
              border: '1px solid rgba(110, 207, 163, 0.3)',
              borderRadius: 4,
              color: '#6ECFA3',
              fontSize: 13,
              fontWeight: 600,
              padding: '6px 14px',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {t('button.send')}
          </button>
        </div>
      </div>
    </div>
  );
}
