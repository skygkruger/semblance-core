// CloudStorageSettingsSection — Cloud storage settings.
// Uses Settings.css classes from semblance-ui for visual parity.

import { useCallback, useState } from 'react';
import { SkeletonCard } from '@semblance/ui';
import { cloudStorageConnect, cloudStorageDisconnect, cloudStorageSyncNow, cloudStorageSetInterval, cloudStorageSetMaxFileSize } from '../ipc/commands';
import { useAppState, useAppDispatch } from '../state/AppState';
import '@semblance/ui/components/Settings/Settings.css';

interface CloudStorageSettingsShape {
  connected: boolean;
  provider: string | null;
  userEmail: string | null;
  selectedFolders: Array<{ folderId: string; folderName: string }>;
  lastSyncedAt: string | null;
  storageUsedBytes: number;
  filesSynced: number;
  storageBudgetGB: number;
  syncIntervalMinutes: number;
  maxFileSizeMB: number;
}

export interface CloudStorageSettingsSectionProps {
  settingsOverride?: Partial<CloudStorageSettingsShape>;
}

const syncIntervalOptions = [
  { value: 15, label: 'Every 15 min' },
  { value: 30, label: 'Every 30 min' },
  { value: 60, label: 'Every hour' },
  { value: 0, label: 'Manual' },
];

const maxFileSizeOptions = [
  { value: 10, label: '10 MB' },
  { value: 25, label: '25 MB' },
  { value: 50, label: '50 MB' },
  { value: 100, label: '100 MB' },
];

export function CloudStorageSettingsSection({ settingsOverride }: CloudStorageSettingsSectionProps = {}) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const cs = { ...state.cloudStorageSettings, ...settingsOverride };
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncInterval, setSyncInterval] = useState(cs.syncIntervalMinutes);
  const [maxFileSize, setMaxFileSize] = useState(cs.maxFileSizeMB);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const result = await cloudStorageConnect('google_drive');
      if (result.success) {
        dispatch({
          type: 'SET_CLOUD_STORAGE_SETTINGS',
          settings: { ...cs, connected: true, provider: 'google_drive', userEmail: result.userEmail ?? null },
        });
      }
    } catch { /* Connection failed */ } finally { setConnecting(false); }
  }, [cs, dispatch]);

  const handleDisconnect = useCallback(async () => {
    try {
      await cloudStorageDisconnect('google_drive');
      dispatch({
        type: 'SET_CLOUD_STORAGE_SETTINGS',
        settings: { ...cs, connected: false, provider: null, userEmail: null, selectedFolders: [], lastSyncedAt: null, storageUsedBytes: 0, filesSynced: 0 },
      });
    } catch { /* Disconnect failed */ }
  }, [cs, dispatch]);

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await cloudStorageSyncNow();
      dispatch({
        type: 'SET_CLOUD_STORAGE_SETTINGS',
        settings: { ...cs, lastSyncedAt: new Date().toISOString(), filesSynced: result.filesSynced, storageUsedBytes: result.storageUsedBytes },
      });
    } catch { /* Sync failed */ } finally { setSyncing(false); }
  }, [cs, dispatch]);

  const handleSyncIntervalChange = useCallback(async (value: number) => {
    setSyncInterval(value);
    dispatch({ type: 'SET_CLOUD_STORAGE_SETTINGS', settings: { ...cs, syncIntervalMinutes: value } });
    await cloudStorageSetInterval(value).catch(() => {});
  }, [cs, dispatch]);

  const handleMaxFileSizeChange = useCallback(async (value: number) => {
    setMaxFileSize(value);
    dispatch({ type: 'SET_CLOUD_STORAGE_SETTINGS', settings: { ...cs, maxFileSizeMB: value } });
    await cloudStorageSetMaxFileSize(value).catch(() => {});
  }, [cs, dispatch]);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const usagePercent = Math.min(100, (cs.storageUsedBytes / (cs.storageBudgetGB * 1024 * 1024 * 1024)) * 100);

  return (
    <div className="settings-content">
      <div className="settings-section-header">Providers</div>

      {/* Google Drive */}
      <div className="settings-row" style={{ cursor: 'default' }}>
        <span className={`settings-row__dot ${cs.connected ? 'settings-row__dot--connected' : 'settings-row__dot--disconnected'}`} />
        <span className="settings-row__label">Google Drive</span>
        <span className="settings-row__value">
          {cs.connected ? `${cs.userEmail}` : 'Not connected'}
        </span>
        {cs.connected ? (
          <button type="button" className="settings-ghost-button" style={{ color: '#8593A4', borderColor: 'rgba(133,147,164,0.3)', fontSize: 13, padding: '4px 12px' }} onClick={handleDisconnect}>
            Disconnect
          </button>
        ) : (
          <button type="button" className="settings-ghost-button" style={{ fontSize: 13, padding: '4px 12px' }} onClick={handleConnect} disabled={connecting}>
            {connecting ? 'Connecting...' : 'Connect'}
          </button>
        )}
      </div>

      {/* Coming soon providers */}
      {(['Dropbox', 'OneDrive'] as const).map((name) => (
        <div key={name} className="settings-row settings-row--static">
          <span className="settings-row__dot settings-row__dot--disconnected" />
          <span className="settings-row__label" style={{ color: '#5E6B7C' }}>{name}</span>
          <span className="settings-row__value">Coming soon</span>
        </div>
      ))}

      {/* Disconnected placeholder */}
      {!cs.connected && (
        <div style={{ padding: '16px 16px 0' }}>
          <SkeletonCard
            variant="generic"
            message="Connect a provider to sync your files"
            showSpinner={false}
            height={120}
          />
        </div>
      )}

      {/* Storage Usage */}
      {cs.connected && (
        <>
          <div className="settings-section-header">Storage</div>
          <div style={{ padding: '0 20px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--fm)', fontSize: 11, color: '#5E6B7C', marginBottom: 4 }}>
              <span>{formatBytes(cs.storageUsedBytes)} used</span>
              <span>{cs.storageBudgetGB} GB budget</span>
            </div>
            <div style={{ width: '100%', height: 8, borderRadius: 9999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 9999, background: '#6ECFA3', width: `${usagePercent}%`, transition: 'width 220ms ease-out' }} />
            </div>
            <div style={{ fontFamily: 'var(--fm)', fontSize: 11, color: '#5E6B7C', marginTop: 4 }}>
              {cs.filesSynced} files synced
              {cs.lastSyncedAt && <> &middot; Last sync: {new Date(cs.lastSyncedAt).toLocaleString()}</>}
            </div>
          </div>
        </>
      )}

      {/* Sync Controls */}
      {cs.connected && (
        <>
          <div className="settings-section-header">Sync</div>

          <div style={{ padding: '12px 20px' }}>
            <div style={{ fontSize: 13, color: '#A8B4C0', marginBottom: 8 }}>Sync Interval</div>
            <div className="settings-segment">
              {syncIntervalOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`settings-segment__option ${syncInterval === opt.value ? 'settings-segment__option--active' : ''}`}
                  onClick={() => handleSyncIntervalChange(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: '12px 20px' }}>
            <div style={{ fontSize: 13, color: '#A8B4C0', marginBottom: 8 }}>Max File Size</div>
            <div className="settings-segment">
              {maxFileSizeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`settings-segment__option ${maxFileSize === opt.value ? 'settings-segment__option--active' : ''}`}
                  onClick={() => handleMaxFileSizeChange(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: '12px 20px 0' }}>
            <button type="button" className="settings-ghost-button" onClick={handleSyncNow} disabled={syncing}>
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
