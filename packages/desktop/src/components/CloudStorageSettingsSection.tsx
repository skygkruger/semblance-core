import { useCallback, useState } from 'react';
import { Button, StatusIndicator } from '@semblance/ui';
import { cloudStorageConnect, cloudStorageDisconnect, cloudStorageSyncNow, cloudStorageSetInterval, cloudStorageSetMaxFileSize } from '../ipc/commands';
import { useAppState, useAppDispatch } from '../state/AppState';
import './SettingsSection.css';

export function CloudStorageSettingsSection() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { cloudStorageSettings } = state;
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncInterval, setSyncInterval] = useState(cloudStorageSettings.syncIntervalMinutes);
  const [maxFileSize, setMaxFileSize] = useState(cloudStorageSettings.maxFileSizeMB);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const result = await cloudStorageConnect('google_drive');
      if (result.success) {
        dispatch({
          type: 'SET_CLOUD_STORAGE_SETTINGS',
          settings: {
            ...cloudStorageSettings,
            connected: true,
            provider: 'google_drive',
            userEmail: result.userEmail ?? null,
          },
        });
      }
    } catch {
      // Connection failed
    } finally {
      setConnecting(false);
    }
  }, [cloudStorageSettings, dispatch]);

  const handleDisconnect = useCallback(async () => {
    try {
      await cloudStorageDisconnect('google_drive');
      dispatch({
        type: 'SET_CLOUD_STORAGE_SETTINGS',
        settings: {
          ...cloudStorageSettings,
          connected: false,
          provider: null,
          userEmail: null,
          selectedFolders: [],
          lastSyncedAt: null,
          storageUsedBytes: 0,
          filesSynced: 0,
        },
      });
    } catch {
      // Disconnect failed
    }
  }, [cloudStorageSettings, dispatch]);

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await cloudStorageSyncNow();
      dispatch({
        type: 'SET_CLOUD_STORAGE_SETTINGS',
        settings: {
          ...cloudStorageSettings,
          lastSyncedAt: new Date().toISOString(),
          filesSynced: result.filesSynced,
          storageUsedBytes: result.storageUsedBytes,
        },
      });
    } catch {
      // Sync failed
    } finally {
      setSyncing(false);
    }
  }, [cloudStorageSettings, dispatch]);

  const handleSyncIntervalChange = useCallback(async (value: number) => {
    setSyncInterval(value);
    dispatch({
      type: 'SET_CLOUD_STORAGE_SETTINGS',
      settings: { ...cloudStorageSettings, syncIntervalMinutes: value },
    });
    await cloudStorageSetInterval(value).catch(() => {});
  }, [cloudStorageSettings, dispatch]);

  const handleMaxFileSizeChange = useCallback(async (value: number) => {
    setMaxFileSize(value);
    dispatch({
      type: 'SET_CLOUD_STORAGE_SETTINGS',
      settings: { ...cloudStorageSettings, maxFileSizeMB: value },
    });
    await cloudStorageSetMaxFileSize(value).catch(() => {});
  }, [cloudStorageSettings, dispatch]);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const usagePercent = Math.min(
    100,
    (cloudStorageSettings.storageUsedBytes / (cloudStorageSettings.storageBudgetGB * 1024 * 1024 * 1024)) * 100,
  );

  return (
    <div>
      <h2 className="settings-section__title">Cloud Storage</h2>

      {/* Provider Cards */}
      <div className="settings-section__group" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className={`settings-section__provider-row${cloudStorageSettings.connected ? '' : ''}`}>
          <StatusIndicator status={cloudStorageSettings.connected ? 'success' : 'muted'} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="settings-section__provider-name">Google Drive</p>
            <p className="settings-section__provider-status">
              {cloudStorageSettings.connected
                ? `Connected as ${cloudStorageSettings.userEmail}`
                : 'Not connected'}
            </p>
          </div>
          {cloudStorageSettings.connected ? (
            <Button variant="ghost" size="sm" onClick={handleDisconnect}>
              Disconnect
            </Button>
          ) : (
            <Button size="sm" onClick={handleConnect} disabled={connecting}>
              {connecting ? 'Connecting...' : 'Connect'}
            </Button>
          )}
        </div>

        {(['Dropbox', 'OneDrive'] as const).map((name) => (
          <div key={name} className="settings-section__provider-row settings-section__provider-row--disabled">
            <StatusIndicator status="muted" />
            <div style={{ flex: 1 }}>
              <p className="settings-section__provider-name">{name}</p>
              <p className="settings-section__provider-status">Coming soon</p>
            </div>
          </div>
        ))}
      </div>

      {/* Storage Usage Bar */}
      {cloudStorageSettings.connected && (
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <div className="settings-section__usage-labels">
            <span>{formatBytes(cloudStorageSettings.storageUsedBytes)} used</span>
            <span>{cloudStorageSettings.storageBudgetGB} GB budget</span>
          </div>
          <div className="settings-section__usage-bar">
            <div
              className="settings-section__usage-fill"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <p className="settings-section__usage-meta">
            {cloudStorageSettings.filesSynced} files synced
            {cloudStorageSettings.lastSyncedAt && (
              <> &middot; Last sync: {new Date(cloudStorageSettings.lastSyncedAt).toLocaleString()}</>
            )}
          </p>
        </div>
      )}

      {/* Sync Controls */}
      {cloudStorageSettings.connected && (
        <div className="settings-section__group">
          <div className="settings-section__row">
            <span className="settings-section__label" style={{ marginBottom: 0 }}>Sync Interval</span>
            <select
              value={syncInterval}
              onChange={(e) => handleSyncIntervalChange(parseInt(e.target.value, 10))}
              className="settings-section__select"
              style={{ width: 'auto' }}
            >
              <option value={15}>Every 15 minutes</option>
              <option value={30}>Every 30 minutes</option>
              <option value={60}>Every hour</option>
              <option value={0}>Manual only</option>
            </select>
          </div>

          <div className="settings-section__row">
            <span className="settings-section__label" style={{ marginBottom: 0 }}>Max File Size</span>
            <select
              value={maxFileSize}
              onChange={(e) => handleMaxFileSizeChange(parseInt(e.target.value, 10))}
              className="settings-section__select"
              style={{ width: 'auto' }}
            >
              <option value={10}>10 MB</option>
              <option value={25}>25 MB</option>
              <option value={50}>50 MB</option>
              <option value={100}>100 MB</option>
            </select>
          </div>

          <Button size="sm" onClick={handleSyncNow} disabled={syncing}>
            {syncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </div>
      )}
    </div>
  );
}
