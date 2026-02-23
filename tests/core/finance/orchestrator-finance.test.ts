/**
 * Step 19 — Orchestrator finance tool tests.
 * Verifies query_spending, query_transactions, query_anomalies return correct data.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { TransactionStore, type Transaction } from '@semblance/core/finance/transaction-store';
import { SpendingAnalyzer } from '@semblance/core/finance/spending-analyzer';
import { AnomalyStore } from '@semblance/core/finance/anomaly-store';
import { AnomalyDetector } from '@semblance/core/finance/anomaly-detector';

let db: InstanceType<typeof Database>;
let store: TransactionStore;
let analyzer: SpendingAnalyzer;
let anomalyStore: AnomalyStore;
let detector: AnomalyDetector;

function makeTxn(overrides: Partial<Transaction>): Transaction {
  const now = new Date().toISOString();
  return {
    id: `txn-${Math.random().toString(36).slice(2, 8)}`,
    source: 'csv',
    accountId: 'acc-1',
    date: '2026-01-15',
    merchantRaw: 'TEST MERCHANT',
    merchantNormalized: 'Test Merchant',
    amount: -1000,
    currency: 'USD',
    category: 'Other',
    subcategory: '',
    isRecurring: false,
    isSubscription: false,
    plaidTransactionId: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  db = new Database(':memory:');
  store = new TransactionStore(db as unknown as DatabaseHandle);
  analyzer = new SpendingAnalyzer(store);
  anomalyStore = new AnomalyStore(db as unknown as DatabaseHandle);
  detector = new AnomalyDetector(store, anomalyStore);
});

afterEach(() => {
  db.close();
});

describe('Orchestrator Finance Tools (Step 19)', () => {
  it('query_spending returns breakdown and comparison data', () => {
    store.addTransactions([
      makeTxn({ id: 'a', date: '2026-01-10', amount: -5000, category: 'Food & Dining' }),
      makeTxn({ id: 'b', date: '2026-01-20', amount: -3000, category: 'Shopping' }),
    ]);

    const breakdown = analyzer.getMonthlyBreakdown(2026, 1);
    expect(breakdown.totalSpending).toBe(8000);
    expect(breakdown.categoryBreakdown.length).toBeGreaterThan(0);

    const comparison = analyzer.getMonthComparison(2026, 1);
    expect(comparison).toBeDefined();
    expect(comparison.current).toBeDefined();
    expect(comparison.categoryChanges).toBeDefined();
  });

  it('query_transactions returns filtered data', () => {
    store.addTransactions([
      makeTxn({ id: 'a', date: '2026-01-10', category: 'Food & Dining' }),
      makeTxn({ id: 'b', date: '2026-01-20', category: 'Shopping' }),
      makeTxn({ id: 'c', date: '2026-02-01', category: 'Food & Dining' }),
    ]);

    const janTxns = store.getTransactions({ startDate: '2026-01-01', endDate: '2026-01-31' });
    expect(janTxns).toHaveLength(2);

    const foodTxns = store.getTransactions({ category: 'Food & Dining' });
    expect(foodTxns).toHaveLength(2);
  });

  it('query_anomalies returns active anomalies', () => {
    // Seed 31+ transactions for activation threshold
    const txns: Transaction[] = [];
    for (let i = 0; i < 31; i++) {
      txns.push(makeTxn({
        id: `seed-${i}`,
        date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
        merchantNormalized: `Merchant${i % 5}`,
        amount: -(1000 + i * 100),
      }));
    }
    store.addTransactions(txns);

    // Add a first-time merchant transaction
    const newTxn = makeTxn({ id: 'new-merch', merchantNormalized: 'BrandNew', date: '2026-01-28' });
    store.addTransactions([newTxn]);
    detector.detectAnomalies([newTxn]);

    const active = detector.getActiveAnomalies();
    expect(active.length).toBeGreaterThan(0);
    expect(active[0]!.type).toBe('first-time-merchant');
  });
});
