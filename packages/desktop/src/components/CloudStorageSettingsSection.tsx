import { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Card, Button, StatusIndicator } from '@semblance/ui';
import { useAppState, useAppDispatch } from '../state/AppState';

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
      const result = await invoke<{ success: boolean; userEmail?: string; error?: string }>('cloud_storage_connect', {
        provider: 'google_drive',
      });
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
      await invoke('cloud_storage_disconnect', { provider: 'google_drive' });
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
      const result = await invoke<{ filesSynced: number; storageUsedBytes: number }>('cloud_storage_sync_now');
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
    await invoke('cloud_storage_set_interval', { minutes: value }).catch(() => {});
  }, [cloudStorageSettings, dispatch]);

  const handleMaxFileSizeChange = useCallback(async (value: number) => {
    setMaxFileSize(value);
    dispatch({
      type: 'SET_CLOUD_STORAGE_SETTINGS',
      settings: { ...cloudStorageSettings, maxFileSizeMB: value },
    });
    await invoke('cloud_storage_set_max_file_size', { mb: value }).catch(() => {});
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
    <Card>
      <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
        Cloud Storage
      </h2>

      {/* Provider Cards */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-3 p-3 rounded-md bg-semblance-surface-1 dark:bg-semblance-surface-1-dark">
          <StatusIndicator status={cloudStorageSettings.connected ? 'success' : 'muted'} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark">
              Google Drive
            </p>
            <p className="text-xs text-semblance-text-tertiary">
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

        {/* Coming soon providers */}
        {(['Dropbox', 'OneDrive'] as const).map((name) => (
          <div key={name} className="flex items-center gap-3 p-3 rounded-md bg-semblance-surface-1 dark:bg-semblance-surface-1-dark opacity-50">
            <StatusIndicator status="muted" />
            <div className="flex-1">
              <p className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark">
                {name}
              </p>
              <p className="text-xs text-semblance-text-tertiary">Coming soon</p>
            </div>
          </div>
        ))}
      </div>

      {/* Storage Usage Bar */}
      {cloudStorageSettings.connected && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-semblance-text-tertiary mb-1">
            <span>{formatBytes(cloudStorageSettings.storageUsedBytes)} used</span>
            <span>{cloudStorageSettings.storageBudgetGB} GB budget</span>
          </div>
          <div className="w-full h-2 bg-semblance-surface-2 dark:bg-semblance-surface-2-dark rounded-full overflow-hidden">
            <div
              className="h-full bg-semblance-primary rounded-full transition-all duration-medium"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <p className="text-xs text-semblance-text-tertiary mt-1">
            {cloudStorageSettings.filesSynced} files synced
            {cloudStorageSettings.lastSyncedAt && (
              <> &middot; Last sync: {new Date(cloudStorageSettings.lastSyncedAt).toLocaleString()}</>
            )}
          </p>
        </div>
      )}

      {/* Sync Controls */}
      {cloudStorageSettings.connected && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-semblance-text-tertiary uppercase tracking-wider">
              Sync Interval
            </label>
            <select
              value={syncInterval}
              onChange={(e) => handleSyncIntervalChange(parseInt(e.target.value, 10))}
              className="px-3 py-1.5 text-sm rounded-md border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark text-semblance-text-primary dark:text-semblance-text-primary-dark"
            >
              <option value={15}>Every 15 minutes</option>
              <option value={30}>Every 30 minutes</option>
              <option value={60}>Every hour</option>
              <option value={0}>Manual only</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-semblance-text-tertiary uppercase tracking-wider">
              Max File Size
            </label>
            <select
              value={maxFileSize}
              onChange={(e) => handleMaxFileSizeChange(parseInt(e.target.value, 10))}
              className="px-3 py-1.5 text-sm rounded-md border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark text-semblance-text-primary dark:text-semblance-text-primary-dark"
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
    </Card>
  );
}
