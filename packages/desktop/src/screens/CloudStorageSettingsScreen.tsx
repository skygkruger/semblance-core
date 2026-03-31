import { useState, useEffect, useCallback } from 'react';
import { SkeletonCard } from '@semblance/ui';
import { getConnectedServices, prefGet } from '../ipc/commands';
import { useAppDispatch } from '../state/AppState';
import { CloudStorageSettingsSection } from '../components/CloudStorageSettingsSection';

const STORAGE_KEY_CLOUD_FOLDERS = 'semblance.cloud_storage.synced_folders';
const STORAGE_KEY_CLOUD_SYNC = 'semblance.cloud_storage.last_sync';

export function CloudStorageSettingsScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const dispatch = useAppDispatch();

  const loadProviders = useCallback(async () => {
    try {
      const connectedRaw = await getConnectedServices().catch((err) => {
        console.error('[CloudStorage] Failed to get connected services:', err);
        return [] as Array<{ connectorId: string; lastSyncedAt: string | null }>;
      });
      const connectedIds = connectedRaw.map((svc) => typeof svc === 'string' ? svc : svc.connectorId);

      // Load persisted folder selections and sync times from SQLite prefs
      const savedFolders = await (async () => {
        try {
          const raw = await prefGet(STORAGE_KEY_CLOUD_FOLDERS);
          return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
        } catch { return {}; }
      })();

      const savedSync = await (async () => {
        try {
          const raw = await prefGet(STORAGE_KEY_CLOUD_SYNC);
          return raw ? (JSON.parse(raw) as Record<string, string>) : {};
        } catch { return {}; }
      })();

      const isGoogleDriveConnected = connectedIds.includes('google-drive');

      // Map IPC data into AppState shape for the component
      const googleFolders = savedFolders['google-drive'] ?? [];
      dispatch({
        type: 'SET_CLOUD_STORAGE_SETTINGS',
        settings: {
          connected: isGoogleDriveConnected,
          provider: isGoogleDriveConnected ? 'google_drive' : null,
          userEmail: null, // IPC doesn't return email; component handles display
          selectedFolders: googleFolders.map((name) => ({ folderId: name, folderName: name })),
          syncIntervalMinutes: 60,
          maxFileSizeMB: 50,
          storageBudgetGB: 4,
          lastSyncedAt: savedSync['google-drive'] ?? null,
          storageUsedBytes: 0,
          filesSynced: 0,
        },
      });
    } catch (err) {
      console.error('[CloudStorage] Failed to load providers:', err);
    } finally {
      setIsLoading(false);
    }
  }, [dispatch]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  if (isLoading) {
    return (
      <div className="page-scroll">
        <div className="page-layout">
          <SkeletonCard variant="generic" message="Loading cloud storage" subMessage="Checking connected providers" showSpinner />
        </div>
      </div>
    );
  }

  return (
    <div className="page-scroll">
      <div className="page-layout">
        <CloudStorageSettingsSection />
      </div>
    </div>
  );
}
