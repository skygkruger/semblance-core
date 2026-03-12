import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getConnectedServices, cloudStorageConnect, cloudStorageDisconnect, cloudStorageBrowseFolders } from '../ipc/commands';
import type { CloudFolder } from '../ipc/types';
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

const STORAGE_KEY_CLOUD_FOLDERS = 'semblance.cloud_storage.synced_folders';
const STORAGE_KEY_CLOUD_SYNC = 'semblance.cloud_storage.last_sync';

// Map connector IDs to display names
const CLOUD_PROVIDER_NAMES: Record<string, string> = {
  'google-drive': 'Google Drive',
  'dropbox': 'Dropbox',
  'icloud': 'iCloud',
  'onedrive': 'OneDrive',
};

// ─── Component ──────────────────────────────────────────────────────────────

export function CloudStorageSettingsScreen() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<CloudProvider[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [browsingProvider, setBrowsingProvider] = useState<string | null>(null);
  const [browsedFolders, setBrowsedFolders] = useState<Record<string, CloudFolder[]>>({});
  const [browseError, setBrowseError] = useState<string | null>(null);

  // Load connected cloud storage providers from IPC
  const loadProviders = useCallback(async () => {
    try {
      const connectedIds = await getConnectedServices().catch((err) => {
        console.error('[CloudStorage] Failed to get connected services:', err);
        return [] as string[];
      });

      // Load persisted folder selections and sync times from localStorage
      const savedFolders = (() => {
        try {
          const raw = localStorage.getItem(STORAGE_KEY_CLOUD_FOLDERS);
          return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
        } catch { return {}; }
      })();

      const savedSync = (() => {
        try {
          const raw = localStorage.getItem(STORAGE_KEY_CLOUD_SYNC);
          return raw ? (JSON.parse(raw) as Record<string, string>) : {};
        } catch { return {}; }
      })();

      // Cloud storage connector IDs that might appear
      const cloudIds = ['google-drive', 'dropbox', 'icloud', 'onedrive'];
      const connectedCloud = connectedIds.filter((id) => cloudIds.includes(id));

      const mapped: CloudProvider[] = connectedCloud.map((id) => ({
        id,
        name: CLOUD_PROVIDER_NAMES[id] ?? id,
        connected: true,
        syncStatus: 'idle' as const,
        lastSyncAt: savedSync[id] ?? null,
        syncedFolders: savedFolders[id] ?? [],
      }));

      setProviders(mapped);
    } catch (err) {
      console.error('[CloudStorage] Failed to load providers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // Connect to a cloud provider
  const handleConnect = useCallback(async (providerId: string) => {
    setConnecting(providerId);
    try {
      const result = await cloudStorageConnect(providerId);
      if (result.success) {
        await loadProviders(); // Refresh provider list after connecting
      } else {
        console.error('[CloudStorage] Connect failed:', result.error);
      }
    } catch (err) {
      console.error('[CloudStorage] Connect error:', err);
    } finally {
      setConnecting(null);
    }
  }, [loadProviders]);

  // Disconnect a cloud provider
  const handleDisconnect = useCallback(async (providerId: string) => {
    try {
      await cloudStorageDisconnect(providerId);
      // Remove persisted data for this provider
      try {
        const folders = JSON.parse(localStorage.getItem(STORAGE_KEY_CLOUD_FOLDERS) ?? '{}');
        delete folders[providerId];
        localStorage.setItem(STORAGE_KEY_CLOUD_FOLDERS, JSON.stringify(folders));
        const sync = JSON.parse(localStorage.getItem(STORAGE_KEY_CLOUD_SYNC) ?? '{}');
        delete sync[providerId];
        localStorage.setItem(STORAGE_KEY_CLOUD_SYNC, JSON.stringify(sync));
      } catch { /* ignore */ }
      await loadProviders(); // Refresh
    } catch (err) {
      console.error('[CloudStorage] Disconnect error:', err);
    }
  }, [loadProviders]);

  // Browse folders for a cloud provider
  const handleBrowseFolders = useCallback(async (providerId: string) => {
    setBrowsingProvider(providerId);
    setBrowseError(null);
    try {
      const folders = await cloudStorageBrowseFolders(providerId, '');
      setBrowsedFolders((prev) => ({ ...prev, [providerId]: folders }));
    } catch (err) {
      console.error('[CloudStorage] Browse folders error:', err);
      setBrowseError(String(err));
    } finally {
      setBrowsingProvider(null);
    }
  }, []);

  // Toggle a folder in the synced list for a provider
  const handleToggleFolder = useCallback((providerId: string, folder: CloudFolder) => {
    setProviders((prev) =>
      prev.map((p) => {
        if (p.id !== providerId) return p;
        const isSynced = p.syncedFolders.includes(folder.name);
        const updatedFolders = isSynced
          ? p.syncedFolders.filter((f) => f !== folder.name)
          : [...p.syncedFolders, folder.name];
        return { ...p, syncedFolders: updatedFolders };
      })
    );
    // Persist folder selections to localStorage
    setProviders((current) => {
      const allFolders: Record<string, string[]> = {};
      for (const p of current) {
        allFolders[p.id] = p.syncedFolders;
      }
      try {
        localStorage.setItem(STORAGE_KEY_CLOUD_FOLDERS, JSON.stringify(allFolders));
      } catch { /* ignore */ }
      return current;
    });
  }, []);

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

        {loading && (
          <p className="cloud-storage__empty-text">{t('common.loading', 'Loading...')}</p>
        )}

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
                    <button
                      className="cloud-storage__disconnect-btn"
                      onClick={() => handleDisconnect(provider.id)}
                    >
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
                    disabled={isConnected || connecting === ap.id}
                    onClick={() => handleConnect(ap.id)}
                  >
                    {connecting === ap.id
                      ? t('common.connecting', 'Connecting...')
                      : isConnected
                        ? t('screen.cloud_storage.connected')
                        : t('screen.cloud_storage.connect')}
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
                  <button
                    className="cloud-storage__folder-btn"
                    disabled={!provider.connected || browsingProvider === provider.id}
                    onClick={() => handleBrowseFolders(provider.id)}
                  >
                    {browsingProvider === provider.id
                      ? t('common.loading', 'Loading...')
                      : t('screen.cloud_storage.choose_folders')}
                  </button>
                  {browseError && browsingProvider === null && browsedFolders[provider.id] === undefined && (
                    <span className="cloud-storage__folder-empty" style={{ color: '#B07A8A' }}>
                      {browseError}
                    </span>
                  )}
                  {browsedFolders[provider.id] != null && browsedFolders[provider.id]!.length > 0 && (
                    <div className="cloud-storage__browse-results">
                      {browsedFolders[provider.id]!.map((folder) => {
                        const isSelected = provider.syncedFolders.includes(folder.name);
                        return (
                          <label key={folder.id} className="cloud-storage__browse-item">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleFolder(provider.id, folder)}
                            />
                            <span className="cloud-storage__browse-folder-name">{folder.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {browsedFolders[provider.id] != null && browsedFolders[provider.id]!.length === 0 && (
                    <span className="cloud-storage__folder-empty">
                      {t('screen.cloud_storage.no_folders_available', 'No folders available')}
                    </span>
                  )}
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
