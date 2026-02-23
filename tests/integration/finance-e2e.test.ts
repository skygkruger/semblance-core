/**
 * Step 19 — Finance E2E integration tests.
 * CSV→categorize→breakdown→insights, anomaly detection on imported data,
 * feature gate blocks spending insights for free tier.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { TransactionStore, type Transaction } from '@semblance/core/finance/transaction-store';
import { SpendingAnalyzer } from '@semblance/core/finance/spending-analyzer';
import { AnomalyStore } from '@semblance/core/finance/anomaly-store';
import { AnomalyDetector } from '@semblance/core/finance/anomaly-detector';
import { PremiumGate } from '@semblance/core/premium/premium-gate';

let db: InstanceType<typeof Database>;
let store: TransactionStore;
let analyzer: SpendingAnalyzer;
let anomalyStore: AnomalyStore;
let detector: AnomalyDetector;
let gate: PremiumGate;

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
  gate = new PremiumGate(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('Finance E2E (Step 19)', () => {
  it('CSV import → categorize → breakdown → insights', () => {
    // Simulate CSV import: 5 transactions across 2 categories
    const txns: Transaction[] = [
      makeTxn({ id: 'csv-1', date: '2026-01-05', merchantNormalized: 'Starbucks', amount: -450, category: 'Food & Dining' }),
      makeTxn({ id: 'csv-2', date: '2026-01-08', merchantNormalized: 'Target', amount: -3500, category: 'Shopping' }),
      makeTxn({ id: 'csv-3', date: '2026-01-12', merchantNormalized: 'Chipotle', amount: -1200, category: 'Food & Dining' }),
      makeTxn({ id: 'csv-4', date: '2026-01-18', merchantNormalized: 'Uber', amount: -2500, category: 'Transportation' }),
      makeTxn({ id: 'csv-5', date: '2026-01-20', merchantNormalized: 'Netflix', amount: -1599, category: 'Subscriptions' }),
    ];
    store.addTransactions(txns);

    // Verify monthly breakdown
    const breakdown = analyzer.getMonthlyBreakdown(2026, 1);
    expect(breakdown.totalSpending).toBe(9249); // 450+3500+1200+2500+1599
    expect(breakdown.categoryBreakdown.length).toBeGreaterThanOrEqual(3);
    expect(breakdown.transactionCount).toBe(5);

    // Verify insights generation (will generate for categories with prior month data)
    const insights = analyzer.generateInsights(2026, 1);
    expect(insights).toBeDefined();
    // No prior month data → no category-increase insights, but no crash either
    expect(Array.isArray(insights)).toBe(true);
  });

  it('anomaly detection on imported data', () => {
    // Seed 31+ transactions for activation
    const seedTxns: Transaction[] = [];
    for (let i = 0; i < 31; i++) {
      seedTxns.push(makeTxn({
        id: `seed-${i}`,
        date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
        merchantNormalized: `Merchant${i % 5}`,
        amount: -(1000 + i * 100),
        category: ['Food & Dining', 'Entertainment', 'Shopping', 'Other', 'Transportation'][i % 5]!,
      }));
    }
    store.addTransactions(seedTxns);

    // Import new transactions with anomalies
    const newTxns: Transaction[] = [
      // First-time merchant
      makeTxn({ id: 'new-1', merchantNormalized: 'BrandNewShop', date: '2026-01-28', amount: -2000 }),
      // Duplicate charge
      makeTxn({ id: 'dup-1', merchantNormalized: 'Merchant0', amount: -1000, date: '2026-01-28' }),
      makeTxn({ id: 'dup-2', merchantNormalized: 'Merchant0', amount: -1000, date: '2026-01-28' }),
    ];
    store.addTransactions(newTxns);

    const anomalies = detector.detectAnomalies(newTxns);
    expect(anomalies.length).toBeGreaterThan(0);

    // Should find at least a first-time merchant anomaly
    const firstTime = anomalies.find(a => a.type === 'first-time-merchant');
    expect(firstTime).toBeDefined();

    // Verify active anomalies are queryable
    const active = detector.getActiveAnomalies();
    expect(active.length).toBeGreaterThan(0);

    // Dismiss one
    detector.dismissAnomaly(active[0]!.id);
    const afterDismiss = detector.getActiveAnomalies();
    expect(afterDismiss.length).toBeLessThan(active.length);
  });

  it('feature gate blocks spending insights for free tier', () => {
    // Free tier cannot access spending features
    expect(gate.isPremium()).toBe(false);
    expect(gate.isFeatureAvailable('spending-insights')).toBe(false);
    expect(gate.isFeatureAvailable('anomaly-detection')).toBe(false);
    expect(gate.isFeatureAvailable('plaid-integration')).toBe(false);

    // Activate Digital Representative
    activatePremium(gate);

    expect(gate.isPremium()).toBe(true);
    expect(gate.isFeatureAvailable('spending-insights')).toBe(true);
    expect(gate.isFeatureAvailable('anomaly-detection')).toBe(true);
    expect(gate.isFeatureAvailable('plaid-integration')).toBe(true);
    expect(gate.isFeatureAvailable('financial-dashboard')).toBe(true);
  });
});
