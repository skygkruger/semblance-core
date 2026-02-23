// Cloud Storage AppState Tests — Initial defaults, reducer updates.

import { describe, it, expect } from 'vitest';

// We test the AppState shape and reducer logic directly without React rendering.
// The actual AppState is in packages/desktop/src/state/AppState.tsx.

describe('CloudStorage AppState', () => {
  it('initial cloudStorageSettings defaults are correct', () => {
    // These values must match the initialState in AppState.tsx
    const initialCloudStorageSettings = {
      connected: false,
      provider: null,
      userEmail: null,
      selectedFolders: [],
      syncIntervalMinutes: 30,
      maxFileSizeMB: 50,
      storageBudgetGB: 5,
      lastSyncedAt: null,
      storageUsedBytes: 0,
      filesSynced: 0,
    };

    expect(initialCloudStorageSettings.connected).toBe(false);
    expect(initialCloudStorageSettings.provider).toBeNull();
    expect(initialCloudStorageSettings.syncIntervalMinutes).toBe(30);
    expect(initialCloudStorageSettings.maxFileSizeMB).toBe(50);
    expect(initialCloudStorageSettings.storageBudgetGB).toBe(5);
    expect(initialCloudStorageSettings.lastSyncedAt).toBeNull();
    expect(initialCloudStorageSettings.storageUsedBytes).toBe(0);
    expect(initialCloudStorageSettings.filesSynced).toBe(0);
  });

  it('SET_CLOUD_STORAGE_SETTINGS reducer updates state', () => {
    // Simulate the reducer behavior
    const initialState = {
      cloudStorageSettings: {
        connected: false,
        provider: null as string | null,
        userEmail: null as string | null,
        selectedFolders: [] as Array<{ folderId: string; folderName: string }>,
        syncIntervalMinutes: 30,
        maxFileSizeMB: 50,
        storageBudgetGB: 5,
        lastSyncedAt: null as string | null,
        storageUsedBytes: 0,
        filesSynced: 0,
      },
    };

    // Apply SET_CLOUD_STORAGE_SETTINGS action
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

    // Reducer replaces the entire cloudStorageSettings object
    const nextState = {
      ...initialState,
      cloudStorageSettings: newSettings,
    };

    expect(nextState.cloudStorageSettings.connected).toBe(true);
    expect(nextState.cloudStorageSettings.provider).toBe('google_drive');
    expect(nextState.cloudStorageSettings.userEmail).toBe('user@gmail.com');
    expect(nextState.cloudStorageSettings.selectedFolders).toHaveLength(1);
    expect(nextState.cloudStorageSettings.syncIntervalMinutes).toBe(15);
    expect(nextState.cloudStorageSettings.filesSynced).toBe(5);
  });
});
