// HealthKit Adapter — Interface + NoOp default.
// Real iOS implementation provided by mobile platform layer.
// NoOp returns isAvailable()=false, empty arrays for all fetches.
// CRITICAL: This file is in packages/core/. No network imports.
// CRITICAL: Health data NEVER leaves the device. No Gateway adapter for health.

import type { HealthEntry } from './types.js';

export interface HealthKitAdapter {
  isAvailable(): boolean;
  requestAuthorization(): Promise<boolean>;
  fetchSteps(startDate: Date, endDate: Date): Promise<HealthEntry[]>;
  fetchSleep(startDate: Date, endDate: Date): Promise<HealthEntry[]>;
  fetchHeartRate(startDate: Date, endDate: Date): Promise<HealthEntry[]>;
  fetchWorkouts(startDate: Date, endDate: Date): Promise<HealthEntry[]>;
}

/**
 * NoOp HealthKit adapter — used on all non-iOS platforms.
 * Returns isAvailable()=false and empty arrays for all fetches.
 */
export class NoOpHealthKitAdapter implements HealthKitAdapter {
  isAvailable(): boolean {
    return false;
  }

  async requestAuthorization(): Promise<boolean> {
    return false;
  }

  async fetchSteps(_startDate: Date, _endDate: Date): Promise<HealthEntry[]> {
    return [];
  }

  async fetchSleep(_startDate: Date, _endDate: Date): Promise<HealthEntry[]> {
    return [];
  }

  async fetchHeartRate(_startDate: Date, _endDate: Date): Promise<HealthEntry[]> {
    return [];
  }

  async fetchWorkouts(_startDate: Date, _endDate: Date): Promise<HealthEntry[]> {
    return [];
  }
}
