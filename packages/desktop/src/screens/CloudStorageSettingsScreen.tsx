import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './CloudStorageSettingsScreen.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CloudProvider {
  id: string;
  name: string;
  connected: boolean;
  syncStatus: 'idle' | 'syncing' | 'error' | 'disconnected';
  lastSyncAt: string | null;
  syncedFolders: string[];
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CloudStorageSettingsScreen() {
  const { t } = useTranslation();
  const [providers] = useState<CloudProvider[]>([]);

  const availableProviders = [
    { id: 'google-drive', name: t('screen.cloud_storage.google_drive') },
    { id: 'dropbox', name: t('screen.cloud_storage.dropbox') },
    { id: 'icloud', name: t('screen.cloud_storage.icloud') },
    { id: 'onedrive', name: t('screen.cloud_storage.onedrive') },
  ];

  const statusLabel = (status: CloudProvider['syncStatus']): string => {
    switch (status) {
      case 'idle': return t('screen.cloud_storage.up_to_date');
      case 'syncing': return t('screen.cloud_storage.syncing');
      case 'error': return t('screen.cloud_storage.sync_error');
      case 'disconnected': return t('screen.cloud_storage.disconnected');
    }
  };

  return (
    <div className="cloud-storage h-full overflow-y-auto">
      <div className="cloud-storage__container">
        <h1 className="cloud-storage__title">{t('screen.cloud_storage.title')}</h1>
        <p className="cloud-storage__subtitle">
          {t('screen.cloud_storage.subtitle')}
        </p>

        {/* Connected providers */}
        <div className="cloud-storage__card surface-void opal-wireframe">
          <div className="cloud-storage__card-header">
            <h2 className="cloud-storage__card-title">{t('screen.cloud_storage.connected_services')}</h2>
          </div>
          {providers.length === 0 ? (
            <div className="cloud-storage__empty">
              <p className="cloud-storage__empty-text">
                {t('screen.cloud_storage.no_connected')}
              </p>
            </div>
          ) : (
            <div className="cloud-storage__provider-list">
              {providers.map((provider) => (
                <div key={provider.id} className="cloud-storage__provider-row">
                  <div className="cloud-storage__provider-info">
                    <span className="cloud-storage__provider-name">{provider.name}</span>
                    <span className="cloud-storage__provider-detail">
                      {provider.syncedFolders.length > 0
                        ? `${provider.syncedFolders.length} folder${provider.syncedFolders.length !== 1 ? 's' : ''} synced`
                        : t('screen.cloud_storage.no_folders')}
                    </span>
                  </div>
                  <div className="cloud-storage__provider-status-group">
                    <span className={`cloud-storage__provider-status cloud-storage__provider-status--${provider.syncStatus}`}>
                      {statusLabel(provider.syncStatus)}
                    </span>
                    <button className="cloud-storage__disconnect-btn">
                      {t('screen.cloud_storage.disconnect')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Available providers */}
        <div className="cloud-storage__card surface-void opal-wireframe">
          <div className="cloud-storage__card-header">
            <h2 className="cloud-storage__card-title">{t('screen.cloud_storage.available_services')}</h2>
          </div>
          <div className="cloud-storage__available-list">
            {availableProviders.map((ap) => {
              const isConnected = providers.some((p) => p.id === ap.id);
              return (
                <div key={ap.id} className="cloud-storage__available-row">
                  <span className="cloud-storage__available-name">{ap.name}</span>
                  <button
                    className={`cloud-storage__connect-btn ${isConnected ? 'cloud-storage__connect-btn--connected' : ''}`}
                    disabled={isConnected}
                  >
                    {isConnected ? t('screen.cloud_storage.connected') : t('screen.cloud_storage.connect')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Folder picker placeholder */}
        <div className="cloud-storage__card surface-void opal-wireframe">
          <div className="cloud-storage__card-header">
            <h2 className="cloud-storage__card-title">{t('screen.cloud_storage.folder_selection')}</h2>
          </div>
          <p className="cloud-storage__field-hint">
            {t('screen.cloud_storage.folder_selection_hint')}
          </p>
          {providers.length === 0 ? (
            <div className="cloud-storage__empty">
              <p className="cloud-storage__empty-text">
                {t('screen.cloud_storage.connect_to_select')}
              </p>
            </div>
          ) : (
            <div className="cloud-storage__folder-list">
              {providers.map((provider) => (
                <div key={provider.id} className="cloud-storage__folder-section">
                  <span className="cloud-storage__folder-provider">{provider.name}</span>
                  {provider.syncedFolders.length === 0 ? (
                    <span className="cloud-storage__folder-empty">{t('screen.cloud_storage.no_folders')}</span>
                  ) : (
                    provider.syncedFolders.map((folder) => (
                      <span key={folder} className="cloud-storage__folder-path">{folder}</span>
                    ))
                  )}
                  <button className="cloud-storage__folder-btn" disabled>
                    {t('screen.cloud_storage.choose_folders')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Privacy note */}
        <div className="cloud-storage__card surface-slate opal-wireframe">
          <div className="cloud-storage__privacy-note">
            <h2 className="cloud-storage__card-title">{t('screen.cloud_storage.privacy')}</h2>
            <p className="cloud-storage__privacy-text">
              {t('screen.cloud_storage.privacy_detail')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
