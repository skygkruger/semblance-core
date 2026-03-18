export type SettingsScreen =
  // Core
  | 'ai-engine'
  | 'connections'
  | 'notifications'
  | 'autonomy'
  | 'privacy'
  | 'account'
  // Sovereignty
  | 'living-will'
  | 'witness'
  | 'inheritance'
  | 'semblance-network'
  // Security
  | 'biometric'
  | 'backup'
  // Features
  | 'voice'
  | 'location'
  | 'cloud-storage'
  | 'adversarial'
  // Sprint-built
  | 'channels'
  | 'sessions'
  | 'skills'
  | 'preferences'
  | 'binary-allowlist'
  | 'tunnel-pairing';

export interface SettingsRootProps {
  currentModel: string;
  activeConnections: number;
  notificationSummary: string;
  autonomyTier: 'guardian' | 'partner' | 'alter-ego';
  privacyStatus: 'clean' | 'review-needed';
  licenseStatus: 'founding-member' | 'active' | 'free' | 'expired';
  appVersion: string;
  onNavigate: (screen: SettingsScreen) => void;
  onNavigateIntents?: () => void;
  onNavigateExternal?: (path: string) => void;
  // Badge counts for new sections
  channelCount?: number;
  sessionCount?: number;
  pairedDeviceCount?: number;
  preferenceCount?: number;
  installedSkillCount?: number;
  livingWillLastBackup?: string | null;
  witnessAttestationCount?: number;
  inheritanceConfigured?: boolean;
  biometricEnabled?: boolean;
  lastBackupAt?: string | null;
  binaryAllowlistCount?: number;
  adversarialAlertCount?: number;
}

export const tierLabels: Record<string, string> = {
  guardian: 'Guardian',
  partner: 'Partner',
  'alter-ego': 'Alter Ego',
};

export const licenseLabels: Record<string, string> = {
  'founding-member': 'Founding Member',
  active: 'Active',
  free: 'Free',
  expired: 'Expired',
};
