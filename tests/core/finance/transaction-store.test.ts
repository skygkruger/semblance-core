/**
 * Step 19 — TransactionStore tests.
 * Verifies CRUD, filtering, aggregation, and deduplication.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { TransactionStore, type Transaction } from '@semblance/core/finance/transaction-store';

let db: InstanceType<typeof Database>;
let store: TransactionStore;

function makeTxn(overrides: Partial<Transaction> = {}): Transaction {
  const now = new Date().toISOString();
  return {
    id: `txn-${Math.random().toString(36).slice(2, 8)}`,
    source: 'csv',
    accountId: 'acc-1',
    date: '2026-01-15',
    merchantRaw: 'NETFLIX INC',
    merchantNormalized: 'Netflix',
    amount: -1499,
    currency: 'USD',
    category: 'Entertainment',
    subcategory: 'Streaming',
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
});

afterEach(() => {
  db.close();
});

describe('TransactionStore (Step 19)', () => {
  it('adds and retrieves a transaction by ID', () => {
    const txn = makeTxn({ id: 'txn-1' });
    store.addTransactions([txn]);

    const result = store.getTransaction('txn-1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('txn-1');
    expect(result!.amount).toBe(-1499);
    expect(result!.merchantNormalized).toBe('Netflix');
    expect(result!.category).toBe('Entertainment');
  });

  it('filters transactions by date range and category', () => {
    store.addTransactions([
      makeTxn({ id: 'txn-a', date: '2026-01-10', category: 'Food & Dining' }),
      makeTxn({ id: 'txn-b', date: '2026-01-20', category: 'Entertainment' }),
      makeTxn({ id: 'txn-c', date: '2026-02-05', category: 'Entertainment' }),
    ]);

    const janEntertainment = store.getTransactions({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      category: 'Entertainment',
    });
    expect(janEntertainment).toHaveLength(1);
    expect(janEntertainment[0]!.id).toBe('txn-b');
  });

  it('computes monthly spending by category', () => {
    store.addTransactions([
      makeTxn({ id: 'txn-1', date: '2026-01-05', amount: -1499, category: 'Entertainment' }),
      makeTxn({ id: 'txn-2', date: '2026-01-10', amount: -5000, category: 'Food & Dining' }),
      makeTxn({ id: 'txn-3', date: '2026-01-15', amount: -2500, category: 'Food & Dining' }),
      makeTxn({ id: 'txn-4', date: '2026-01-20', amount: 100000, category: 'Income' }), // positive = income, excluded
    ]);

    const spending = store.getMonthlySpending(2026, 1);
    expect(spending).toHaveLength(2); // Entertainment + Food & Dining (Income excluded — positive amount)

    const food = spending.find(s => s.category === 'Food & Dining');
    expect(food).toBeDefined();
    expect(food!.total).toBe(7500); // 5000 + 2500
    expect(food!.count).toBe(2);
  });

  it('computes month-over-month totals', () => {
    store.addTransactions([
      makeTxn({ id: 'txn-dec', date: '2025-12-15', amount: -10000 }),
      makeTxn({ id: 'txn-jan', date: '2026-01-15', amount: -15000 }),
    ]);

    const mom = store.getMonthOverMonth(2026, 1);
    expect(mom.current.totalSpending).toBe(15000);
    expect(mom.previous.totalSpending).toBe(10000);
    expect(mom.current.year).toBe(2026);
    expect(mom.previous.month).toBe(12);
  });

  it('deduplicates transactions by (accountId, date, merchantRaw, amount)', () => {
    const txn = makeTxn({ id: 'txn-orig', accountId: 'acc-1', date: '2026-01-15', amount: -1499 });
    store.addTransactions([txn]);

    const isDup = store.isDuplicate('acc-1', '2026-01-15', txn.merchantRaw, -1499);
    expect(isDup).toBe(true);

    const notDup = store.isDuplicate('acc-1', '2026-01-16', txn.merchantRaw, -1499);
    expect(notDup).toBe(false);
  });

  it('handles accounts — add, retrieve, update sync', () => {
    store.addAccount({
      id: 'acc-1',
      name: 'Checking Account',
      institution: 'Bank of America',
      type: 'checking',
      plaidAccountId: null,
      lastSyncedAt: null,
      createdAt: new Date().toISOString(),
    });

    const accounts = store.getAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.name).toBe('Checking Account');

    store.updateAccountSync('acc-1');
    const updated = store.getAccount('acc-1');
    expect(updated!.lastSyncedAt).not.toBeNull();
  });
});
