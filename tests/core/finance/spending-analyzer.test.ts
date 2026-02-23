/**
 * Step 19 — SpendingAnalyzer tests.
 * All amounts in cents. Tests monthly breakdown, comparison, trends, merchants, and insights.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { TransactionStore, type Transaction } from '@semblance/core/finance/transaction-store';
import { SpendingAnalyzer } from '@semblance/core/finance/spending-analyzer';

let db: InstanceType<typeof Database>;
let store: TransactionStore;
let analyzer: SpendingAnalyzer;

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
});

afterEach(() => {
  db.close();
});

describe('SpendingAnalyzer (Step 19)', () => {
  it('computes monthly totals correctly', () => {
    store.addTransactions([
      makeTxn({ id: 'a', date: '2026-01-05', amount: -5000, category: 'Food & Dining' }),
      makeTxn({ id: 'b', date: '2026-01-20', amount: -3000, category: 'Entertainment' }),
      makeTxn({ id: 'c', date: '2026-01-25', amount: 100000, category: 'Income' }),
    ]);

    const breakdown = analyzer.getMonthlyBreakdown(2026, 1);
    expect(breakdown.totalSpending).toBe(8000); // 5000 + 3000
    expect(breakdown.totalIncome).toBe(100000);
    expect(breakdown.transactionCount).toBe(2); // only spending txns counted
  });

  it('computes category percentages', () => {
    store.addTransactions([
      makeTxn({ id: 'a', date: '2026-01-05', amount: -7500, category: 'Food & Dining' }),
      makeTxn({ id: 'b', date: '2026-01-10', amount: -2500, category: 'Entertainment' }),
    ]);

    const breakdown = analyzer.getMonthlyBreakdown(2026, 1);
    const food = breakdown.categoryBreakdown.find(c => c.category === 'Food & Dining');
    expect(food!.percentage).toBe(75);
    const ent = breakdown.categoryBreakdown.find(c => c.category === 'Entertainment');
    expect(ent!.percentage).toBe(25);
  });

  it('computes month-over-month comparison with changePercent', () => {
    store.addTransactions([
      makeTxn({ id: 'dec', date: '2025-12-15', amount: -10000, category: 'Food & Dining' }),
      makeTxn({ id: 'jan', date: '2026-01-15', amount: -15000, category: 'Food & Dining' }),
    ]);

    const comparison = analyzer.getMonthComparison(2026, 1);
    expect(comparison.current.totalSpending).toBe(15000);
    expect(comparison.previous.totalSpending).toBe(10000);
    expect(comparison.changePercent).toBe(50); // 50% increase
  });

  it('identifies category changes with direction', () => {
    store.addTransactions([
      makeTxn({ id: 'dec-food', date: '2025-12-10', amount: -10000, category: 'Food & Dining' }),
      makeTxn({ id: 'dec-ent', date: '2025-12-15', amount: -5000, category: 'Entertainment' }),
      makeTxn({ id: 'jan-food', date: '2026-01-10', amount: -5000, category: 'Food & Dining' }),
      makeTxn({ id: 'jan-ent', date: '2026-01-15', amount: -8000, category: 'Entertainment' }),
    ]);

    const comparison = analyzer.getMonthComparison(2026, 1);
    const food = comparison.categoryChanges.find(c => c.category === 'Food & Dining');
    expect(food!.direction).toBe('down');
    expect(food!.changePercent).toBe(-50);

    const ent = comparison.categoryChanges.find(c => c.category === 'Entertainment');
    expect(ent!.direction).toBe('up');
    expect(ent!.changePercent).toBe(60);
  });

  it('generates spending trends for multiple months', () => {
    store.addTransactions([
      makeTxn({ id: 'oct', date: '2025-10-15', amount: -8000 }),
      makeTxn({ id: 'nov', date: '2025-11-15', amount: -12000 }),
      makeTxn({ id: 'dec', date: '2025-12-15', amount: -15000 }),
    ]);

    const trends = analyzer.getSpendingTrends(3);
    expect(trends.length).toBeGreaterThanOrEqual(3);
    // Trends should be chronological
    expect(trends[0]!.year * 100 + trends[0]!.month)
      .toBeLessThanOrEqual(trends[1]!.year * 100 + trends[1]!.month);
  });

  it('computes top merchants by spending', () => {
    store.addTransactions([
      makeTxn({ id: 'a', date: '2026-01-05', amount: -5000, merchantNormalized: 'Starbucks' }),
      makeTxn({ id: 'b', date: '2026-01-10', amount: -3000, merchantNormalized: 'Starbucks' }),
      makeTxn({ id: 'c', date: '2026-01-15', amount: -15000, merchantNormalized: 'Amazon' }),
    ]);

    const merchants = analyzer.getTopMerchants('2026-01-01', '2026-02-01', 10);
    expect(merchants).toHaveLength(2);
    expect(merchants[0]!.merchantNormalized).toBe('Amazon');
    expect(merchants[0]!.total).toBe(15000);
    expect(merchants[1]!.merchantNormalized).toBe('Starbucks');
    expect(merchants[1]!.count).toBe(2);
    expect(merchants[1]!.averageAmount).toBe(4000); // (5000+3000)/2
  });

  it('generates category increase insight when >25%', () => {
    store.addTransactions([
      makeTxn({ id: 'dec', date: '2025-12-15', amount: -10000, category: 'Food & Dining' }),
      makeTxn({ id: 'jan', date: '2026-01-15', amount: -20000, category: 'Food & Dining' }),
    ]);

    const insights = analyzer.generateInsights(2026, 1);
    const increase = insights.find(i => i.type === 'category-increase');
    expect(increase).toBeDefined();
    expect(increase!.severity).toBe('warning');
    expect(increase!.title).toContain('Food & Dining');
  });

  it('generates category decrease insight when <-25%', () => {
    store.addTransactions([
      makeTxn({ id: 'dec', date: '2025-12-15', amount: -20000, category: 'Entertainment' }),
      makeTxn({ id: 'jan', date: '2026-01-15', amount: -5000, category: 'Entertainment' }),
    ]);

    const insights = analyzer.generateInsights(2026, 1);
    const decrease = insights.find(i => i.type === 'category-decrease');
    expect(decrease).toBeDefined();
    expect(decrease!.severity).toBe('info');
  });

  it('computes daily average correctly', () => {
    store.addTransactions([
      makeTxn({ id: 'a', date: '2026-01-05', amount: -31000 }),
    ]);

    const breakdown = analyzer.getMonthlyBreakdown(2026, 1);
    // January has 31 days: 31000 / 31 = 1000 cents/day
    expect(breakdown.dailyAverage).toBe(1000);
  });

  it('handles zero-transaction month gracefully', () => {
    const breakdown = analyzer.getMonthlyBreakdown(2026, 3);
    expect(breakdown.totalSpending).toBe(0);
    expect(breakdown.totalIncome).toBe(0);
    expect(breakdown.transactionCount).toBe(0);
    expect(breakdown.dailyAverage).toBe(0);
    expect(breakdown.categoryBreakdown).toHaveLength(0);
  });
});
