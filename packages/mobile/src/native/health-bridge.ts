// Health Bridge — Interface for HealthKit (iOS) and Google Fit (Android).
// Currently a stub — native modules not yet implemented.
// When native modules land, this becomes the integration point.
//
// TODO: Sprint where native HealthKit/Google Fit modules are wired.
// Replace the stub body in createHealthBridge() with real native calls.

export interface HealthDataPoint {
  type: 'steps' | 'heart_rate' | 'sleep' | 'weight' | 'blood_pressure' | 'blood_glucose';
  value: number;
  unit: string;
  timestamp: string;
  source: string;
}

export interface HealthBridge {
  isAvailable(): Promise<boolean>;
  requestPermissions(types: HealthDataPoint['type'][]): Promise<boolean>;
  fetchData(type: HealthDataPoint['type'], startDate: string, endDate: string): Promise<HealthDataPoint[]>;
  startBackgroundSync(types: HealthDataPoint['type'][]): Promise<void>;
  stopBackgroundSync(): Promise<void>;
}

/**
 * Create a HealthBridge instance.
 *
 * Stub implementation — returns not-available for all operations.
 * When HealthKit (iOS) or Google Fit (Android) native modules are implemented,
 * replace the stub body with real native calls.
 */
export function createHealthBridge(): HealthBridge {
  return {
    isAvailable: async () => false,
    requestPermissions: async (_types: HealthDataPoint['type'][]) => false,
    fetchData: async (
      _type: HealthDataPoint['type'],
      _startDate: string,
      _endDate: string,
    ) => [],
    startBackgroundSync: async (_types: HealthDataPoint['type'][]) => {},
    stopBackgroundSync: async () => {},
  };
}
