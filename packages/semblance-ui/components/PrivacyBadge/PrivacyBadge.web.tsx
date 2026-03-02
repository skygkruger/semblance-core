import { useTranslation } from 'react-i18next';
import type { PrivacyBadgeProps } from './PrivacyBadge.types';
import './PrivacyBadge.css';

export function PrivacyBadge({ status = 'active', className = '' }: PrivacyBadgeProps) {
  const { t } = useTranslation('privacy');
  const statusLabel = status === 'active' ? t('badge.active') : t(`badge.${status}`);
  return (
    <div
      className={`privacy-badge ${className}`.trim()}
      role="status"
      aria-label={t('badge.status_label', { status: statusLabel })}
    >
      <span className={`privacy-badge__dot privacy-badge__dot--${status}`} />
      <span className="privacy-badge__label">{statusLabel}</span>
    </div>
  );
}
