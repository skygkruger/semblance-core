// Storybook mock for packages/desktop/src/state/AppState.ts

const mockState = {
  voiceSettings: {
    enabled: false,
    whisperModel: null,
    piperVoice: null,
    speed: 1.0,
    silenceSensitivity: 'medium' as const,
  },
  soundSettings: {
    enabled: true,
    categoryVolumes: { actions: 1.0, system: 1.0, voice: 1.0 },
  },
  clipboardSettings: {
    monitoringEnabled: false,
    recentActions: [],
  },
  cloudStorageSettings: {
    connected: false,
    provider: null,
    userEmail: null,
    selectedFolders: [],
    lastSyncedAt: null,
    storageUsedBytes: 0,
    filesSynced: 0,
    storageBudgetGB: 5,
    syncIntervalMinutes: 30,
    maxFileSizeMB: 25,
  },
  locationSettings: {
    enabled: false,
    remindersEnabled: false,
    commuteEnabled: false,
    weatherEnabled: false,
    defaultCity: '',
    retentionDays: 7,
  },
};

export function useAppState() {
  return mockState;
}

export function useAppDispatch() {
  return () => {};
}
