import type { SettingsScreen } from './SettingsRoot.types';

export type Screen = 'root' | SettingsScreen;

export interface SettingsNavigatorProps {
  /* SettingsRoot props */
  currentModel: string;
  activeConnections: number;
  notificationSummary: string;
  autonomyTier: 'guardian' | 'partner' | 'alter-ego';
  privacyStatus: 'clean' | 'review-needed';
  licenseStatus: 'founding-member' | 'active' | 'trial' | 'expired';
  appVersion: string;

  /* AI Engine props */
  modelName: string;
  modelSize: string;
  hardwareProfile: string;
  isModelRunning: boolean;
  inferenceThreads: number | 'auto';
  contextWindow: 4096 | 8192 | 16384 | 32768;
  gpuAcceleration: boolean;
  customModelPath: string | null;

  /* Connections props */
  connections: Array<{
    id: string;
    name: string;
    category: string;
    categoryColor: string;
    isConnected: boolean;
    lastSync: string | null;
    entityCount: number;
  }>;

  /* Notifications props */
  morningBriefEnabled: boolean;
  morningBriefTime: string;
  includeWeather: boolean;
  includeCalendar: boolean;
  remindersEnabled: boolean;
  defaultSnoozeDuration: '5m' | '15m' | '1h' | '1d';
  notifyOnAction: boolean;
  notifyOnApproval: boolean;
  actionDigest: 'immediate' | 'hourly' | 'daily';
  badgeCount: boolean;
  soundEffects: boolean;

  /* Autonomy props */
  domainOverrides: Record<string, 'guardian' | 'partner' | 'alter-ego' | 'default'>;
  requireConfirmationForIrreversible: boolean;
  actionReviewWindow: '30s' | '1m' | '5m';

  /* Privacy props */
  lastAuditTime: string | null;
  auditStatus: 'clean' | 'review-needed' | 'never-run';
  dataSources: Array<{
    id: string;
    name: string;
    entityCount: number;
    lastIndexed: string;
  }>;

  /* Account props */
  licenseActivationDate: string;
  trialDaysRemaining?: number;
  digitalRepresentativeActive: boolean;
  digitalRepresentativeActivationDate: string | null;
  semblanceName: string;

  /* Callbacks */
  onChange: (key: string, value: unknown) => void;
  onManageAllConnections: () => void;
  onConnectionTap: (id: string) => void;
  onRunAudit: () => void;
  onExportData: () => void;
  onExportHistory: () => void;
  onDeleteSourceData: (sourceId: string) => void;
  onDeleteAllData: () => void;
  onResetSemblance: () => void;
  onRenewLicense: () => void;
  onActivateDigitalRepresentative: () => void;
  onViewDRAgreement: () => void;
  onRenameSemblance: (name: string) => void;
  onSignOut: () => void;
  onDeactivateLicense: () => void;
}
