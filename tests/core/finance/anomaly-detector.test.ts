/**
 * Step 19 — AnomalyDetector tests.
 * Tests first-time merchant, unusual amount, duplicate charge, category spike,
 * and the <30 transactions activation guard.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { TransactionStore, type Transaction } from '@semblance/core/finance/transaction-store';
import { AnomalyStore } from '@semblance/core/finance/anomaly-store';
import { AnomalyDetector } from '@semblance/core/finance/anomaly-detector';

let db: InstanceType<typeof Database>;
let store: TransactionStore;
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

function seedMinimumTransactions() {
  // Seed 30+ varied transactions to pass the activation threshold
  const txns: Transaction[] = [];
  for (let i = 0; i < 31; i++) {
    txns.push(makeTxn({
      id: `seed-${i}`,
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      merchantNormalized: `Merchant${i % 5}`,
      merchantRaw: `MERCHANT${i % 5}`,
      amount: -(1000 + i * 100),
      category: ['Food & Dining', 'Entertainment', 'Shopping', 'Other', 'Transportation'][i % 5]!,
    }));
  }
  store.addTransactions(txns);
}

beforeEach(() => {
  db = new Database(':memory:');
  store = new TransactionStore(db as unknown as DatabaseHandle);
  anomalyStore = new AnomalyStore(db as unknown as DatabaseHandle);
  detector = new AnomalyDetector(store, anomalyStore);
});

afterEach(() => {
  db.close();
});

describe('AnomalyDetector (Step 19)', () => {
  it('detects first-time merchant', () => {
    seedMinimumTransactions();

    const newTxn = makeTxn({
      id: 'new-merchant',
      merchantNormalized: 'BrandNewStore',
      date: '2026-01-28',
    });
    store.addTransactions([newTxn]);

    const anomalies = detector.detectAnomalies([newTxn]);
    const firstTime = anomalies.find(a => a.type === 'first-time-merchant');
    expect(firstTime).toBeDefined();
    expect(firstTime!.severity).toBe('low');
  });

  it('detects unusual amount (>2.5x median)', () => {
    seedMinimumTransactions();

    // Add several normal-amount transactions for "TestMerchant"
    const normals: Transaction[] = [];
    for (let i = 0; i < 5; i++) {
      normals.push(makeTxn({
        id: `normal-${i}`,
        merchantNormalized: 'TestMerchant',
        merchantRaw: 'TESTMERCHANT',
        amount: -1000,
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      }));
    }
    store.addTransactions(normals);

    // New transaction at 3x the median
    const expensive = makeTxn({
      id: 'expensive',
      merchantNormalized: 'TestMerchant',
      merchantRaw: 'TESTMERCHANT',
      amount: -3000,
      date: '2026-01-28',
    });
    store.addTransactions([expensive]);

    const anomalies = detector.checkTransaction(expensive);
    const unusual = anomalies.find(a => a.type === 'unusual-amount');
    expect(unusual).toBeDefined();
    expect(unusual!.severity).toBe('medium');
  });

  it('detects duplicate charge (same merchant + amount within 24 hours)', () => {
    seedMinimumTransactions();

    const txn1 = makeTxn({
      id: 'dup-1',
      merchantNormalized: 'DupMerchant',
      amount: -2500,
      date: '2026-01-20',
    });
    const txn2 = makeTxn({
      id: 'dup-2',
      merchantNormalized: 'DupMerchant',
      amount: -2500,
      date: '2026-01-20',
    });
    store.addTransactions([txn1, txn2]);

    const anomalies = detector.checkTransaction(txn2);
    const duplicate = anomalies.find(a => a.type === 'duplicate-charge');
    expect(duplicate).toBeDefined();
    expect(duplicate!.severity).toBe('medium');
  });

  it('detects category spending spike (>3x of 3-month average)', () => {
    seedMinimumTransactions();

    // Prior months: ~1000 in Entertainment each
    for (let m = 10; m <= 12; m++) {
      store.addTransactions([makeTxn({
        id: `prior-${m}`,
        date: `2025-${String(m).padStart(2, '0')}-15`,
        category: 'Entertainment',
        amount: -1000,
      })]);
    }

    // Current month: 5000 in Entertainment (5x average)
    store.addTransactions([makeTxn({
      id: 'spike',
      date: '2026-01-15',
      category: 'Entertainment',
      amount: -5000,
    })]);

    const anomalies = detector.checkCategorySpikes(2026, 1);
    const spike = anomalies.find(a => a.type === 'category-spike');
    expect(spike).toBeDefined();
    expect(spike!.severity).toBe('high');
  });

  it('returns empty when total transactions < 30', () => {
    store.addTransactions([
      makeTxn({ id: 'a', merchantNormalized: 'NewStore' }),
    ]);

    const anomalies = detector.detectAnomalies([
      makeTxn({ id: 'b', merchantNormalized: 'AnotherNewStore' }),
    ]);
    expect(anomalies).toHaveLength(0);
  });
});
