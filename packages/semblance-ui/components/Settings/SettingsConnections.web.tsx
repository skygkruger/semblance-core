import { useTranslation } from 'react-i18next';
import './Settings.css';
import { BackArrow, ChevronRight } from './SettingsIcons';
import type { SettingsConnectionsProps } from './SettingsConnections.types';

export function SettingsConnections({
  connections,
  onManageAll,
  onConnectionTap,
  onBack,
}: SettingsConnectionsProps) {
  const { t } = useTranslation('settings');

  const connected = connections.filter((c) => c.isConnected);
  const disconnected = connections.filter((c) => !c.isConnected);

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">{t('connections.title')}</h1>
      </div>

      <div className="settings-content">
        {connected.length > 0 && (
          <>
            <div className="settings-section-header">{t('connections.section_connected')}</div>
            {connected.map((conn) => (
              <button
                key={conn.id}
                type="button"
                className="settings-row"
                onClick={() => onConnectionTap(conn.id)}
              >
                <span
                  className="settings-row__dot settings-row__dot--connected"
                  style={{ background: conn.categoryColor }}
                />
                <span className="settings-row__label">{conn.name}</span>
                <span className="settings-row__value">
                  {t('connections.value_items_suffix', { n: conn.entityCount })}{conn.lastSync ? ` · ${conn.lastSync}` : ''}
                </span>
                <span className="settings-row__chevron"><ChevronRight /></span>
              </button>
            ))}
          </>
        )}

        {disconnected.length > 0 && (
          <>
            <div className="settings-section-header">{t('connections.section_not_connected')}</div>
            {disconnected.map((conn) => (
              <div key={conn.id} className="settings-row settings-row--static">
                <span className="settings-row__dot settings-row__dot--disconnected" />
                <span className="settings-row__label" style={{ color: '#5E6B7C' }}>{conn.name}</span>
                <span className="settings-row__value">{t('connections.value_not_connected')}</span>
              </div>
            ))}
          </>
        )}

        {connections.length === 0 && (
          <p className="settings-explanation" style={{ paddingTop: 20 }}>
            {t('connections.empty_body')}
          </p>
        )}

        <div style={{ padding: '20px 16px 0' }}>
          <button type="button" className="settings-ghost-button" onClick={onManageAll}>
            {t('connections.btn_manage_all')}
          </button>
        </div>
      </div>
    </div>
  );
}
