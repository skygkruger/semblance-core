import './PrivacyBadge.css';

type PrivacyStatus = 'active' | 'syncing' | 'offline';

interface PrivacyBadgeProps {
  status?: PrivacyStatus;
  className?: string;
}

const statusLabels: Record<PrivacyStatus, string> = {
  active: 'Local Only',
  syncing: 'Syncing',
  offline: 'Offline',
};

export function PrivacyBadge({ status = 'active', className = '' }: PrivacyBadgeProps) {
  return (
    <div
      className={`privacy-badge ${className}`.trim()}
      role="status"
      aria-label={`Privacy status: ${statusLabels[status]}`}
    >
      <span className={`privacy-badge__dot privacy-badge__dot--${status}`} />
      <span className="privacy-badge__label">{statusLabels[status]}</span>
    </div>
  );
}
