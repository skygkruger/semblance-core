/**
 * Step 19 — FinancialInsightTracker tests.
 * Tests spending-alert and anomaly-alert generation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { TransactionStore, type Transaction } from '@semblance/core/finance/transaction-store';
import { SpendingAnalyzer } from '@semblance/core/finance/spending-analyzer';
import { AnomalyStore } from '@semblance/core/finance/anomaly-store';
import { AnomalyDetector } from '@semblance/core/finance/anomaly-detector';
import { RecurringDetector } from '@semblance/core/finance/recurring-detector';
import { MerchantNormalizer } from '@semblance/core/finance/merchant-normalizer';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { FinancialInsightTracker } from '@semblance/core/finance/financial-insight-tracker';

let db: InstanceType<typeof Database>;
let store: TransactionStore;
let analyzer: SpendingAnalyzer;
let anomalyStore: AnomalyStore;
let detector: AnomalyDetector;
let recurringDetector: RecurringDetector;
let gate: PremiumGate;
let tracker: FinancialInsightTracker;

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

function activatePremium(gate: PremiumGate): void {
  const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const payload = JSON.stringify({ tier: 'digital-representative', exp: futureDate });
  const encoded = Buffer.from(payload).toString('base64');
  gate.activateLicense(`sem_header.${encoded}.signature`);
}

beforeEach(() => {
  db = new Database(':memory:');
  store = new TransactionStore(db as unknown as DatabaseHandle);
  analyzer = new SpendingAnalyzer(store);
  anomalyStore = new AnomalyStore(db as unknown as DatabaseHandle);
  detector = new AnomalyDetector(store, anomalyStore);
  recurringDetector = new RecurringDetector({ db: db as unknown as DatabaseHandle, normalizer: new MerchantNormalizer() });
  gate = new PremiumGate(db as unknown as DatabaseHandle);

  tracker = new FinancialInsightTracker({
    transactionStore: store,
    spendingAnalyzer: analyzer,
    anomalyDetector: detector,
    recurringDetector,
    premiumGate: gate,
  });
});

afterEach(() => {
  db.close();
});

describe('FinancialInsightTracker (Step 19)', () => {
  it('generates spending-alert when category changes >30%', () => {
    activatePremium(gate);

    // The tracker uses new Date() which is Feb 2026, so comparison is Feb vs Jan
    // January spending: 5000 in Food & Dining (previous month)
    store.addTransactions([
      makeTxn({ id: 'jan-food', date: '2026-01-15', category: 'Food & Dining', amount: -5000 }),
    ]);

    // February spending: 8000 in Food & Dining (60% increase — current month)
    store.addTransactions([
      makeTxn({ id: 'feb-food', date: '2026-02-15', category: 'Food & Dining', amount: -8000 }),
    ]);

    const insights = tracker.generateInsights();
    const spendingAlert = insights.find(i => i.type === 'spending-alert');
    expect(spendingAlert).toBeDefined();
    expect(spendingAlert!.title).toContain('Food & Dining');
    expect(spendingAlert!.title).toContain('increased');
    expect(spendingAlert!.estimatedTimeSavedSeconds).toBe(300);
  });

  it('generates anomaly-alert for active anomalies', () => {
    activatePremium(gate);

    // Seed 31+ transactions
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

    // Add first-time merchant anomaly
    const newTxn = makeTxn({ id: 'new-merch', merchantNormalized: 'BrandNew', date: '2026-01-28' });
    store.addTransactions([newTxn]);
    detector.detectAnomalies([newTxn]);

    const insights = tracker.generateInsights();
    const anomalyAlert = insights.find(i => i.type === 'anomaly-alert');
    expect(anomalyAlert).toBeDefined();
    expect(anomalyAlert!.estimatedTimeSavedSeconds).toBe(120);
  });
});
