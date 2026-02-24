/**
 * Step 22 — ManualEntryManager tests.
 * Tests mood, energy, symptom, medication, water logging.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { HealthStore } from '@semblance/core/health/health-store';
import { ManualEntryManager } from '@semblance/core/health/manual-entry';

let db: InstanceType<typeof Database>;
let store: HealthStore;
let manager: ManualEntryManager;

beforeEach(() => {
  db = new Database(':memory:');
  store = new HealthStore({ db: db as unknown as DatabaseHandle });
  manager = new ManualEntryManager({ store });
});

afterEach(() => {
  db.close();
});

describe('ManualEntryManager (Step 22)', () => {
  it('logMood stores entry with correct type and 1-5 value', () => {
    const entry = manager.logMood(4, 'feeling good');
    expect(entry.metricType).toBe('mood');
    expect(entry.value).toBe(4);
    expect(entry.label).toBe('feeling good');
    expect(entry.source).toBe('manual');
  });

  it('logEnergy stores entry with correct type and 1-5 value', () => {
    const entry = manager.logEnergy(2);
    expect(entry.metricType).toBe('energy');
    expect(entry.value).toBe(2);
    expect(entry.source).toBe('manual');
  });

  it('logSymptom stores entry with text label', () => {
    const entry = manager.logSymptom('headache', 3);
    expect(entry.metricType).toBe('symptom');
    expect(entry.label).toBe('headache');
    expect(entry.value).toBe(3);
  });

  it('logMedication stores name and dosage', () => {
    const entry = manager.logMedication('Ibuprofen', '400mg');
    expect(entry.metricType).toBe('medication');
    expect(entry.label).toBe('Ibuprofen 400mg');
    expect(entry.value).toBe(1);
  });

  it('logWater stores amount correctly', () => {
    const entry = manager.logWater(3, 'glasses');
    expect(entry.metricType).toBe('water');
    expect(entry.value).toBe(750); // 3 glasses × 250ml
    expect(entry.label).toBe('3 glasses');
  });

  it('getRecentMedications returns deduplicated medication names', () => {
    manager.logMedication('Ibuprofen', '400mg');
    manager.logMedication('Ibuprofen', '200mg');
    manager.logMedication('Aspirin', '500mg');

    const meds = manager.getRecentMedications();
    expect(meds).toContain('Ibuprofen');
    expect(meds).toContain('Aspirin');
    expect(meds).toHaveLength(2); // Deduplicated
  });
});
