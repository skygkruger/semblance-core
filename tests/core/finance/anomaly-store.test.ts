/**
 * Step 19 — AnomalyStore tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { AnomalyStore } from '@semblance/core/finance/anomaly-store';

let db: InstanceType<typeof Database>;
let anomalyStore: AnomalyStore;

beforeEach(() => {
  db = new Database(':memory:');
  anomalyStore = new AnomalyStore(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('AnomalyStore (Step 19)', () => {
  it('saves and retrieves an anomaly', () => {
    const saved = anomalyStore.saveAnomaly({
      transactionId: 'txn-1',
      type: 'first-time-merchant',
      severity: 'low',
      title: 'First purchase at NewStore',
      description: 'You have not purchased here before.',
      detectedAt: new Date().toISOString(),
      dismissed: false,
    });

    expect(saved.id).toBeDefined();
    const active = anomalyStore.getActiveAnomalies();
    expect(active).toHaveLength(1);
    expect(active[0]!.type).toBe('first-time-merchant');
  });

  it('dismisses an anomaly', () => {
    const saved = anomalyStore.saveAnomaly({
      transactionId: 'txn-1',
      type: 'unusual-amount',
      severity: 'medium',
      title: 'High charge',
      description: 'Higher than usual.',
      detectedAt: new Date().toISOString(),
      dismissed: false,
    });

    anomalyStore.dismissAnomaly(saved.id);
    const active = anomalyStore.getActiveAnomalies();
    expect(active).toHaveLength(0);
  });

  it('getActiveAnomalies excludes dismissed anomalies', () => {
    anomalyStore.saveAnomaly({
      transactionId: 'txn-1',
      type: 'first-time-merchant',
      severity: 'low',
      title: 'First A',
      description: 'desc',
      detectedAt: new Date().toISOString(),
      dismissed: false,
    });
    const b = anomalyStore.saveAnomaly({
      transactionId: 'txn-2',
      type: 'duplicate-charge',
      severity: 'medium',
      title: 'Duplicate B',
      description: 'desc',
      detectedAt: new Date().toISOString(),
      dismissed: false,
    });

    anomalyStore.dismissAnomaly(b.id);
    const active = anomalyStore.getActiveAnomalies();
    expect(active).toHaveLength(1);
    expect(active[0]!.transactionId).toBe('txn-1');
  });
});
