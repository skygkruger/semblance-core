import { useTranslation } from 'react-i18next';
import './Settings.css';
import { ChevronRight } from './SettingsIcons';
import type { SettingsScreen, SettingsRootProps } from './SettingsRoot.types';
import { tierLabels, licenseLabels } from './SettingsRoot.types';

export type { SettingsScreen };

interface SettingsSection {
  header: string;
  rows: Array<{ screen: SettingsScreen | '__intents' | '__external'; label: string; value: string; externalPath?: string }>;
}

export function SettingsRoot({
  currentModel,
  activeConnections,
  notificationSummary,
  autonomyTier,
  privacyStatus,
  licenseStatus,
  appVersion,
  onNavigate,
  onNavigateIntents,
  onNavigateExternal,
  channelCount = 0,
  sessionCount = 0,
  pairedDeviceCount = 0,
  preferenceCount = 0,
  installedSkillCount = 0,
  livingWillLastBackup,
  witnessAttestationCount = 0,
  inheritanceConfigured = false,
  biometricEnabled = false,
  lastBackupAt,
  binaryAllowlistCount = 0,
  adversarialAlertCount = 0,
}: SettingsRootProps) {
  const { t } = useTranslation('settings');

  const sections: SettingsSection[] = [
    {
      header: 'CORE',
      rows: [
        { screen: 'ai-engine', label: t('root.rows.ai_engine'), value: currentModel },
        { screen: 'connections', label: t('root.rows.connections'), value: t('root.row_values.connections_active', { n: activeConnections }) },
        { screen: 'notifications', label: t('root.rows.notifications'), value: notificationSummary },
        { screen: 'autonomy', label: t('root.rows.autonomy'), value: tierLabels[autonomyTier] || autonomyTier },
        { screen: '__intents', label: t('root.rows.intents', 'Intents & Hard Limits'), value: '' },
      ],
    },
    {
      header: 'YOUR LIFE',
      rows: [
        { screen: 'channels', label: 'Messaging Channels', value: channelCount > 0 ? `${channelCount} connected` : 'Set up' },
        { screen: 'sessions', label: 'Named Sessions', value: sessionCount > 0 ? `${sessionCount} active` : 'None' },
      ],
    },
    {
      header: 'DIGITAL REPRESENTATIVE',
      rows: [
        { screen: 'preferences', label: 'Learned Preferences', value: preferenceCount > 0 ? `${preferenceCount} patterns` : 'None' },
        { screen: 'skills', label: 'Skills', value: installedSkillCount > 0 ? `${installedSkillCount} installed` : 'None' },
      ],
    },
    {
      header: 'COMPUTE MESH',
      rows: [
        { screen: 'tunnel-pairing', label: 'Device Pairing', value: pairedDeviceCount > 0 ? `${pairedDeviceCount} paired` : 'Not set up' },
      ],
    },
    {
      header: 'TRUST & SOVEREIGNTY',
      rows: [
        { screen: 'living-will', label: 'Living Will', value: livingWillLastBackup ? 'Backed up' : 'Never' },
        { screen: 'witness', label: 'Witness', value: witnessAttestationCount > 0 ? `${witnessAttestationCount} attestations` : 'None' },
        { screen: 'inheritance', label: 'Inheritance', value: inheritanceConfigured ? 'Configured' : 'Not set up' },
        { screen: 'semblance-network', label: 'Semblance Network', value: 'Not set up' },
      ],
    },
    {
      header: 'SECURITY',
      rows: [
        { screen: 'biometric', label: 'Biometric Lock', value: biometricEnabled ? 'On' : 'Off' },
        { screen: 'backup', label: 'Backup', value: lastBackupAt ?? 'Never' },
        { screen: 'binary-allowlist', label: 'Binary Allowlist', value: `${binaryAllowlistCount} binaries` },
      ],
    },
    {
      header: 'PRIVACY',
      rows: [
        { screen: 'privacy', label: t('root.rows.privacy'), value: privacyStatus === 'clean' ? t('root.row_values.privacy_clean') : t('root.row_values.privacy_review') },
        { screen: 'adversarial', label: 'Adversarial Shield', value: adversarialAlertCount > 0 ? `${adversarialAlertCount} alerts` : 'Clean' },
      ],
    },
    {
      header: 'FEATURES',
      rows: [
        { screen: 'voice', label: 'Voice', value: '' },
        { screen: 'location', label: 'Location', value: '' },
        { screen: 'cloud-storage', label: 'Cloud Storage', value: '' },
      ],
    },
    {
      header: 'ACCOUNT',
      rows: [
        { screen: 'account', label: t('root.rows.account'), value: licenseLabels[licenseStatus] || licenseStatus },
      ],
    },
  ];

  const handleRowClick = (row: SettingsSection['rows'][0]) => {
    if (row.screen === '__intents') {
      onNavigateIntents?.();
    } else if (row.screen === '__external' && row.externalPath) {
      onNavigateExternal?.(row.externalPath);
    } else {
      onNavigate(row.screen as SettingsScreen);
    }
  };

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <h1 className="settings-header__title settings-header__title--root">{t('root.title')}</h1>
      </div>

      <div className="settings-content">
        {sections.map((section) => (
          <div key={section.header}>
            <div className="settings-section-header">{section.header}</div>
            {section.rows.map((row) => (
              <button
                key={row.screen + (row.externalPath ?? '')}
                type="button"
                className="settings-row"
                onClick={() => handleRowClick(row)}
              >
                <span className="settings-row__label">{row.label}</span>
                <span className="settings-row__value">{row.value}</span>
                <span className="settings-row__chevron"><ChevronRight /></span>
              </button>
            ))}
          </div>
        ))}

        <div className="settings-footer">{appVersion}</div>
      </div>
    </div>
  );
}
