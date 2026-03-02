import { useTranslation } from 'react-i18next';
import './Settings.css';
import { ChevronRight } from './SettingsIcons';
import type { SettingsScreen, SettingsRootProps } from './SettingsRoot.types';
import { tierLabels, licenseLabels } from './SettingsRoot.types';

export type { SettingsScreen };

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
  const { t } = useTranslation('settings');

  const rows: Array<{ screen: SettingsScreen; label: string; value: string }> = [
    { screen: 'ai-engine', label: t('root.rows.ai_engine'), value: currentModel },
    { screen: 'connections', label: t('root.rows.connections'), value: t('root.row_values.connections_active', { n: activeConnections }) },
    { screen: 'notifications', label: t('root.rows.notifications'), value: notificationSummary },
    { screen: 'autonomy', label: t('root.rows.autonomy'), value: tierLabels[autonomyTier] || autonomyTier },
    { screen: 'privacy', label: t('root.rows.privacy'), value: privacyStatus === 'clean' ? t('root.row_values.privacy_clean') : t('root.row_values.privacy_review') },
    { screen: 'account', label: t('root.rows.account'), value: licenseLabels[licenseStatus] || licenseStatus },
  ];

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <h1 className="settings-header__title settings-header__title--root">{t('root.title')}</h1>
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
