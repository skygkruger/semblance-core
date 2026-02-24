// Manual Entry Manager — Wraps HealthStore for manual health inputs.
// Available on ALL platforms (HealthKit is bonus on iOS; manual is universal).
// CRITICAL: This file is in packages/core/. No network imports.

import type { HealthStore } from './health-store.js';
import type { HealthEntry, HealthMetricType } from './types.js';

export class ManualEntryManager {
  private store: HealthStore;

  constructor(config: { store: HealthStore }) {
    this.store = config.store;
  }

  logMood(value: 1 | 2 | 3 | 4 | 5, note?: string): HealthEntry {
    return this.store.addEntry({
      metricType: 'mood',
      value,
      label: note,
      recordedAt: new Date().toISOString(),
      source: 'manual',
    });
  }

  logEnergy(value: 1 | 2 | 3 | 4 | 5, note?: string): HealthEntry {
    return this.store.addEntry({
      metricType: 'energy',
      value,
      label: note,
      recordedAt: new Date().toISOString(),
      source: 'manual',
    });
  }

  logSymptom(symptom: string, severity?: number): HealthEntry {
    return this.store.addEntry({
      metricType: 'symptom',
      value: severity ?? 1,
      label: symptom,
      recordedAt: new Date().toISOString(),
      source: 'manual',
    });
  }

  logMedication(name: string, dosage: string): HealthEntry {
    return this.store.addEntry({
      metricType: 'medication',
      value: 1,
      label: `${name} ${dosage}`,
      recordedAt: new Date().toISOString(),
      source: 'manual',
    });
  }

  logWater(amount: number, unit: 'glasses' | 'ml'): HealthEntry {
    const normalizedMl = unit === 'glasses' ? amount * 250 : amount;
    return this.store.addEntry({
      metricType: 'water',
      value: normalizedMl,
      label: `${amount} ${unit}`,
      recordedAt: new Date().toISOString(),
      source: 'manual',
    });
  }

  getEntriesForDate(date: Date): HealthEntry[] {
    return this.store.getEntriesForDate(date);
  }

  getRecentMedications(): string[] {
    const entries = this.store.getEntries(
      'medication',
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      new Date(),
    );
    const names = new Set<string>();
    for (const entry of entries) {
      if (entry.label) {
        const medName = entry.label.split(' ')[0];
        if (medName) names.add(medName);
      }
    }
    return [...names];
  }
}
