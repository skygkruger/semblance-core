import './Settings.css';
import { ChevronRight } from './SettingsIcons';

export type SettingsScreen = 'ai-engine' | 'connections' | 'notifications' | 'autonomy' | 'privacy' | 'account';

interface SettingsRootProps {
  currentModel: string;
  activeConnections: number;
  notificationSummary: string;
  autonomyTier: 'guardian' | 'partner' | 'alter-ego';
  privacyStatus: 'clean' | 'review-needed';
  licenseStatus: 'founding-member' | 'active' | 'trial' | 'expired';
  appVersion: string;
  onNavigate: (screen: SettingsScreen) => void;
}

const tierLabels: Record<string, string> = {
  guardian: 'Guardian',
  partner: 'Partner',
  'alter-ego': 'Alter Ego',
};

const licenseLabels: Record<string, string> = {
  'founding-member': 'Founding Member',
  active: 'Active',
  trial: 'Trial',
  expired: 'Expired',
};

export function SettingsRoot({
  currentModel,
  activeConnections,
  notificationSummary,
  autonomyTier,
  privacyStatus,
  licenseStatus,
  appVersion,
  onNavigate,
}: SettingsRootProps) {
  const rows: Array<{ screen: SettingsScreen; label: string; value: string }> = [
    { screen: 'ai-engine', label: 'AI Engine', value: currentModel },
    { screen: 'connections', label: 'Connections', value: `${activeConnections} active` },
    { screen: 'notifications', label: 'Notifications', value: notificationSummary },
    { screen: 'autonomy', label: 'Autonomy', value: tierLabels[autonomyTier] || autonomyTier },
    { screen: 'privacy', label: 'Privacy', value: privacyStatus === 'clean' ? 'Audit clean' : 'Review needed' },
    { screen: 'account', label: 'Account', value: licenseLabels[licenseStatus] || licenseStatus },
  ];

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <h1 className="settings-header__title settings-header__title--root">Settings</h1>
      </div>

      <div className="settings-content">
        {rows.map((row) => (
          <button
            key={row.screen}
            type="button"
            className="settings-row"
            onClick={() => onNavigate(row.screen)}
          >
            <span className="settings-row__label">{row.label}</span>
            <span className="settings-row__value">{row.value}</span>
            <span className="settings-row__chevron"><ChevronRight /></span>
          </button>
        ))}

        <div className="settings-footer">{appVersion}</div>
      </div>
    </div>
  );
}
