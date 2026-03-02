export type PrivacyStatus = 'active' | 'syncing' | 'offline';

export interface PrivacyBadgeProps {
  status?: PrivacyStatus;
  className?: string;
}
