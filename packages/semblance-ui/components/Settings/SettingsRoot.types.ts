export type SettingsScreen = 'ai-engine' | 'connections' | 'notifications' | 'autonomy' | 'privacy' | 'account';

export interface SettingsRootProps {
  currentModel: string;
  activeConnections: number;
  notificationSummary: string;
  autonomyTier: 'guardian' | 'partner' | 'alter-ego';
  privacyStatus: 'clean' | 'review-needed';
  licenseStatus: 'founding-member' | 'active' | 'trial' | 'expired';
  appVersion: string;
  onNavigate: (screen: SettingsScreen) => void;
}

export const tierLabels: Record<string, string> = {
  guardian: 'Guardian',
  partner: 'Partner',
  'alter-ego': 'Alter Ego',
};

export const licenseLabels: Record<string, string> = {
  'founding-member': 'Founding Member',
  active: 'Active',
  trial: 'Trial',
  expired: 'Expired',
};
