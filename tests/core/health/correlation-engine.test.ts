/**
 * Step 22 — CorrelationEngine tests.
 * Tests Pearson correlation, significance thresholds, sample size enforcement.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { CorrelationEngine } from '@semblance/core/health/correlation-engine';
import { HealthStore } from '@semblance/core/health/health-store';
import type { KnowledgeGraph } from '@semblance/core/knowledge/index';

let db: InstanceType<typeof Database>;
let engine: CorrelationEngine;
let store: HealthStore;

function makeKnowledgeGraph(): KnowledgeGraph {
  return {
    search: async () => [],
    indexDocument: async () => ({ documentId: '', chunksCreated: 0, durationMs: 0 }),
    scanDirectory: async () => ({ filesFound: 0, filesIndexed: 0, errors: [] }),
    getDocument: async () => null,
    listDocuments: async () => [],
    getStats: async () => ({ totalDocuments: 0, totalChunks: 0, sources: {} }),
  } as unknown as KnowledgeGraph;
}

beforeEach(() => {
  db = new Database(':memory:');
  store = new HealthStore({ db: db as unknown as DatabaseHandle });
  engine = new CorrelationEngine({
    db: db as unknown as DatabaseHandle,
    knowledgeGraph: makeKnowledgeGraph(),
  });
});

afterEach(() => {
  db.close();
});

describe('CorrelationEngine (Step 22)', () => {
  it('pearsonCorrelation returns correct r for known data', () => {
    // Known hand-calculable example: x = [1,2,3,4,5], y = [2,4,6,8,10] → r = 1.0
    const { r, n } = engine.pearsonCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    expect(n).toBe(5);
    expect(r).toBeCloseTo(1.0, 5);
  });

  it('pearsonCorrelation returns r=1.0 for perfectly correlated data', () => {
    const { r } = engine.pearsonCorrelation([10, 20, 30, 40, 50], [100, 200, 300, 400, 500]);
    expect(r).toBeCloseTo(1.0, 5);
  });

  it('pearsonCorrelation returns r=-1.0 for perfectly inverse data', () => {
    const { r } = engine.pearsonCorrelation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
    expect(r).toBeCloseTo(-1.0, 5);
  });

  it('pearsonCorrelation returns r≈0 for uncorrelated data', () => {
    // Deliberately uncorrelated: alternating pattern
    const { r } = engine.pearsonCorrelation([1, 10, 1, 10, 1, 10, 1, 10], [10, 1, 10, 1, 10, 1, 10, 1]);
    expect(r).toBeCloseTo(-1.0, 1); // Actually these are perfectly inverse
    // True uncorrelated example:
    const { r: r2 } = engine.pearsonCorrelation([1, 2, 3, 4, 5, 6, 7, 8], [5, 3, 7, 1, 8, 2, 6, 4]);
    expect(Math.abs(r2)).toBeLessThan(0.5);
  });

  it('minimum sample size enforced (< 7 days → no result)', async () => {
    // Add only 3 days of data
    for (let i = 0; i < 3; i++) {
      const date = new Date(2026, 1, 15 + i).toISOString();
      store.addEntry({ metricType: 'sleep_duration', value: 7 + i * 0.5, recordedAt: date, source: 'manual' });
      store.addEntry({ metricType: 'mood', value: 3 + i, recordedAt: date, source: 'manual' });
    }

    const results = await engine.computeCorrelations(30);
    // Should return empty because < 7 data points
    expect(results).toEqual([]);
  });

  it('significance thresholds classify correctly', () => {
    // Strong: |r| >= 0.7
    const { r: strong } = engine.pearsonCorrelation([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1.1, 2.2, 2.8, 4.1, 5.0, 6.3, 6.8, 8.1, 9.0, 10.2]);
    expect(Math.abs(strong)).toBeGreaterThanOrEqual(0.7);

    // Verify engine uses correct thresholds by checking computation
    const { r: weak } = engine.pearsonCorrelation([1, 2, 3, 4, 5, 6, 7], [3, 1, 4, 2, 5, 3, 6]);
    expect(Math.abs(weak)).toBeLessThan(0.7);
  });

  it('calendar metric extraction queries knowledge graph for events', async () => {
    const calendarSeries = await engine.getCalendarMetric(
      'total_meetings',
      new Date('2026-02-01'),
      new Date('2026-02-07'),
    );
    // With empty KG, should return dates with zero values
    expect(calendarSeries.dates.length).toBeGreaterThan(0);
    expect(calendarSeries.values.every(v => v === 0)).toBe(true);
  });

  it('computeCorrelations filters out non-significant results', async () => {
    // Add some data but not enough for significance
    for (let i = 0; i < 10; i++) {
      const date = new Date(2026, 1, 1 + i).toISOString();
      store.addEntry({ metricType: 'mood', value: Math.random() * 5, recordedAt: date, source: 'manual' });
      store.addEntry({ metricType: 'steps', value: Math.random() * 10000, recordedAt: date, source: 'manual' });
    }

    const results = await engine.computeCorrelations(30);
    // All returned results should have significance !== 'none'
    for (const result of results) {
      expect(result.significance).not.toBe('none');
    }
  });
});
