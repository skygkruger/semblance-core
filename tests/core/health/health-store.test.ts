/**
 * Step 22 — HealthStore tests.
 * Tests CRUD, daily aggregates, date filtering, source filtering, deletion.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { HealthStore } from '@semblance/core/health/health-store';

let db: InstanceType<typeof Database>;
let store: HealthStore;

beforeEach(() => {
  db = new Database(':memory:');
  store = new HealthStore({ db: db as unknown as DatabaseHandle });
});

afterEach(() => {
  db.close();
});

describe('HealthStore (Step 22)', () => {
  it('adds entry and retrieves by type', () => {
    store.addEntry({
      metricType: 'steps',
      value: 8000,
      recordedAt: '2026-02-20T12:00:00.000Z',
      source: 'healthkit',
    });

    const entries = store.getEntries(
      'steps',
      new Date('2026-02-19'),
      new Date('2026-02-21'),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.value).toBe(8000);
    expect(entries[0]!.metricType).toBe('steps');
    expect(entries[0]!.source).toBe('healthkit');
  });

  it('gets daily aggregates (averages values per day)', () => {
    // Add two step entries on the same day
    store.addEntry({ metricType: 'steps', value: 6000, recordedAt: '2026-02-20T08:00:00.000Z', source: 'healthkit' });
    store.addEntry({ metricType: 'steps', value: 10000, recordedAt: '2026-02-20T18:00:00.000Z', source: 'healthkit' });

    const series = store.getDailyAggregates('steps', new Date('2026-02-19'), new Date('2026-02-21'));
    expect(series.dates).toHaveLength(1);
    expect(series.values[0]).toBe(8000); // Average of 6000 and 10000
  });

  it('gets entries for specific date', () => {
    store.addEntry({ metricType: 'mood', value: 4, recordedAt: '2026-02-20T10:00:00.000Z', source: 'manual' });
    store.addEntry({ metricType: 'energy', value: 3, recordedAt: '2026-02-20T10:05:00.000Z', source: 'manual' });
    store.addEntry({ metricType: 'mood', value: 5, recordedAt: '2026-02-21T10:00:00.000Z', source: 'manual' });

    const entries = store.getEntriesForDate(new Date('2026-02-20'));
    expect(entries).toHaveLength(2);
  });

  it('handles empty date range (returns empty array)', () => {
    const entries = store.getEntries('steps', new Date('2026-01-01'), new Date('2026-01-02'));
    expect(entries).toEqual([]);
  });

  it('filters by source (healthkit vs manual)', () => {
    store.addEntry({ metricType: 'steps', value: 8000, recordedAt: '2026-02-20T12:00:00.000Z', source: 'healthkit' });
    store.addEntry({ metricType: 'steps', value: 2000, recordedAt: '2026-02-20T18:00:00.000Z', source: 'manual' });

    const healthkit = store.getEntriesBySource('healthkit', 'steps', new Date('2026-02-19'), new Date('2026-02-21'));
    const manual = store.getEntriesBySource('manual', 'steps', new Date('2026-02-19'), new Date('2026-02-21'));

    expect(healthkit).toHaveLength(1);
    expect(healthkit[0]!.value).toBe(8000);
    expect(manual).toHaveLength(1);
    expect(manual[0]!.value).toBe(2000);
  });

  it('deletes entry by id', () => {
    const entry = store.addEntry({ metricType: 'mood', value: 3, recordedAt: '2026-02-20T10:00:00.000Z', source: 'manual' });

    const deleted = store.deleteEntry(entry.id);
    expect(deleted).toBe(true);

    const entries = store.getEntriesForDate(new Date('2026-02-20'));
    expect(entries).toHaveLength(0);
  });

  it('handles multiple metric types in same query window', () => {
    store.addEntry({ metricType: 'mood', value: 4, recordedAt: '2026-02-20T10:00:00.000Z', source: 'manual' });
    store.addEntry({ metricType: 'energy', value: 3, recordedAt: '2026-02-20T10:05:00.000Z', source: 'manual' });
    store.addEntry({ metricType: 'steps', value: 8000, recordedAt: '2026-02-20T12:00:00.000Z', source: 'healthkit' });

    const mood = store.getEntries('mood', new Date('2026-02-19'), new Date('2026-02-21'));
    const energy = store.getEntries('energy', new Date('2026-02-19'), new Date('2026-02-21'));
    const steps = store.getEntries('steps', new Date('2026-02-19'), new Date('2026-02-21'));

    expect(mood).toHaveLength(1);
    expect(energy).toHaveLength(1);
    expect(steps).toHaveLength(1);
  });
});
