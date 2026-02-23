// Cloud Storage AppState Tests — imports real initialState and appReducer from source.

import { describe, it, expect } from 'vitest';
import { initialState, appReducer } from '@semblance/desktop/state/AppState';

describe('CloudStorage AppState', () => {
  it('initial cloudStorageSettings defaults are correct', () => {
    const settings = initialState.cloudStorageSettings;
    expect(settings.connected).toBe(false);
    expect(settings.provider).toBeNull();
    expect(settings.syncIntervalMinutes).toBe(30);
    expect(settings.maxFileSizeMB).toBe(50);
    expect(settings.storageBudgetGB).toBe(5);
    expect(settings.lastSyncedAt).toBeNull();
    expect(settings.storageUsedBytes).toBe(0);
    expect(settings.filesSynced).toBe(0);
  });

  it('SET_CLOUD_STORAGE_SETTINGS reducer updates state', () => {
    const newSettings = {
      connected: true,
      provider: 'google_drive' as string | null,
      userEmail: 'user@gmail.com' as string | null,
      selectedFolders: [{ folderId: 'f1', folderName: 'Documents' }],
      syncIntervalMinutes: 15,
      maxFileSizeMB: 100,
      storageBudgetGB: 10,
      lastSyncedAt: '2026-01-15T10:00:00Z' as string | null,
      storageUsedBytes: 1024 * 1024,
      filesSynced: 5,
    };

    const nextState = appReducer(initialState, {
      type: 'SET_CLOUD_STORAGE_SETTINGS',
      settings: newSettings,
    });

    expect(nextState.cloudStorageSettings.connected).toBe(true);
    expect(nextState.cloudStorageSettings.provider).toBe('google_drive');
    expect(nextState.cloudStorageSettings.userEmail).toBe('user@gmail.com');
    expect(nextState.cloudStorageSettings.selectedFolders).toHaveLength(1);
    expect(nextState.cloudStorageSettings.syncIntervalMinutes).toBe(15);
    expect(nextState.cloudStorageSettings.filesSynced).toBe(5);
  });
});
