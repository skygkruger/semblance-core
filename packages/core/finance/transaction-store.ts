/**
 * Transaction Store — Persistent transaction storage with integer cents.
 *
 * All amounts are stored as INTEGER cents. $14.99 → 1499. No floating-point.
 * This is the Step 19 Transaction type — richer than Sprint 2's ParsedTransaction.
 */

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';

// ─── Types ──────────────────────────────────────────────────────────────────

export type TransactionSource = 'csv' | 'ofx' | 'plaid' | 'manual';

export interface Transaction {
  id: string;
  source: TransactionSource;
  accountId: string;
  date: string;                   // ISO 8601 date (YYYY-MM-DD)
  merchantRaw: string;            // original description
  merchantNormalized: string;     // cleaned via MerchantNormalizer
  amount: number;                 // INTEGER cents, negative = charge, positive = credit
  currency: string;               // ISO 4217, default 'USD'
  category: string;
  subcategory: string;
  isRecurring: boolean;
  isSubscription: boolean;
  plaidTransactionId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  name: string;
  institution: string;
  type: 'checking' | 'savings' | 'credit' | 'investment' | 'other';
  plaidAccountId: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface TransactionFilter {
  accountId?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  merchantNormalized?: string;
  minAmount?: number;            // cents
  maxAmount?: number;            // cents
  source?: TransactionSource;
  limit?: number;
  offset?: number;
}

export interface CategorySpending {
  category: string;
  total: number;                 // cents (absolute value of spending)
  count: number;
  percentage: number;
}

export interface MonthlyTotals {
  year: number;
  month: number;
  totalSpending: number;         // cents (absolute)
  totalIncome: number;           // cents
  transactionCount: number;
}

// ─── SQLite Schema ──────────────────────────────────────────────────────────

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    account_id TEXT NOT NULL,
    date TEXT NOT NULL,
    merchant_raw TEXT NOT NULL,
    merchant_normalized TEXT NOT NULL DEFAULT '',
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    category TEXT NOT NULL DEFAULT '',
    subcategory TEXT NOT NULL DEFAULT '',
    is_recurring INTEGER NOT NULL DEFAULT 0,
    is_subscription INTEGER NOT NULL DEFAULT 0,
    plaid_transaction_id TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    institution TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'checking',
    plaid_account_id TEXT,
    last_synced_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_txn_account ON transactions(account_id);
  CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(category);
  CREATE INDEX IF NOT EXISTS idx_txn_merchant ON transactions(merchant_normalized);
  CREATE INDEX IF NOT EXISTS idx_txn_plaid_id ON transactions(plaid_transaction_id);
`;

// ─── Public API ─────────────────────────────────────────────────────────────

export class TransactionStore {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.db.exec(CREATE_TABLES);
  }

  addTransactions(transactions: Transaction[]): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO transactions
        (id, source, account_id, date, merchant_raw, merchant_normalized, amount, currency,
         category, subcategory, is_recurring, is_subscription, plaid_transaction_id, metadata,
         created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((txns: Transaction[]) => {
      for (const t of txns) {
        stmt.run(
          t.id, t.source, t.accountId, t.date, t.merchantRaw, t.merchantNormalized,
          t.amount, t.currency, t.category, t.subcategory,
          t.isRecurring ? 1 : 0, t.isSubscription ? 1 : 0,
          t.plaidTransactionId, JSON.stringify(t.metadata),
          t.createdAt, t.updatedAt,
        );
      }
    });
    insertMany(transactions);
  }

  getTransaction(id: string): Transaction | null {
    const row = this.db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as RawTxnRow | undefined;
    return row ? this.rowToTransaction(row) : null;
  }

  getTransactions(filter: TransactionFilter = {}): Transaction[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.accountId) { conditions.push('account_id = ?'); params.push(filter.accountId); }
    if (filter.startDate) { conditions.push('date >= ?'); params.push(filter.startDate); }
    if (filter.endDate) { conditions.push('date <= ?'); params.push(filter.endDate); }
    if (filter.category) { conditions.push('category = ?'); params.push(filter.category); }
    if (filter.merchantNormalized) { conditions.push('merchant_normalized = ?'); params.push(filter.merchantNormalized); }
    if (filter.minAmount !== undefined) { conditions.push('amount >= ?'); params.push(filter.minAmount); }
    if (filter.maxAmount !== undefined) { conditions.push('amount <= ?'); params.push(filter.maxAmount); }
    if (filter.source) { conditions.push('source = ?'); params.push(filter.source); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter.limit ? `LIMIT ${filter.limit}` : '';
    const offset = filter.offset ? `OFFSET ${filter.offset}` : '';

    const rows = this.db.prepare(
      `SELECT * FROM transactions ${where} ORDER BY date DESC ${limit} ${offset}`
    ).all(...params) as RawTxnRow[];

    return rows.map(r => this.rowToTransaction(r));
  }

  updateCategory(transactionId: string, category: string, subcategory: string = ''): void {
    const now = new Date().toISOString();
    this.db.prepare(
      'UPDATE transactions SET category = ?, subcategory = ?, updated_at = ? WHERE id = ?'
    ).run(category, subcategory, now, transactionId);
  }

  getTransactionCount(filter: TransactionFilter = {}): number {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.accountId) { conditions.push('account_id = ?'); params.push(filter.accountId); }
    if (filter.startDate) { conditions.push('date >= ?'); params.push(filter.startDate); }
    if (filter.endDate) { conditions.push('date <= ?'); params.push(filter.endDate); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const row = this.db.prepare(
      `SELECT COUNT(*) as count FROM transactions ${where}`
    ).get(...params) as { count: number };

    return row.count;
  }

  // ─── Account Methods ────────────────────────────────────────────────────

  addAccount(account: Account): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO accounts (id, name, institution, type, plaid_account_id, last_synced_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      account.id, account.name, account.institution, account.type,
      account.plaidAccountId, account.lastSyncedAt, account.createdAt,
    );
  }

  getAccounts(): Account[] {
    const rows = this.db.prepare('SELECT * FROM accounts ORDER BY name').all() as RawAccountRow[];
    return rows.map(r => this.rowToAccount(r));
  }

  getAccount(id: string): Account | null {
    const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as RawAccountRow | undefined;
    return row ? this.rowToAccount(row) : null;
  }

  updateAccountSync(accountId: string): void {
    const now = new Date().toISOString();
    this.db.prepare(
      'UPDATE accounts SET last_synced_at = ? WHERE id = ?'
    ).run(now, accountId);
  }

  // ─── Aggregate Queries ──────────────────────────────────────────────────

  getMonthlySpending(year: number, month: number): CategorySpending[] {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const rows = this.db.prepare(`
      SELECT category, SUM(ABS(amount)) as total, COUNT(*) as count
      FROM transactions
      WHERE date >= ? AND date < ? AND amount < 0
      GROUP BY category
      ORDER BY total DESC
    `).all(startDate, endDate) as Array<{ category: string; total: number; count: number }>;

    const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

    return rows.map(r => ({
      category: r.category || 'Uncategorized',
      total: r.total,
      count: r.count,
      percentage: grandTotal > 0 ? Math.round((r.total / grandTotal) * 10000) / 100 : 0,
    }));
  }

  getSpendingByCategory(startDate: string, endDate: string): CategorySpending[] {
    const rows = this.db.prepare(`
      SELECT category, SUM(ABS(amount)) as total, COUNT(*) as count
      FROM transactions
      WHERE date >= ? AND date < ? AND amount < 0
      GROUP BY category
      ORDER BY total DESC
    `).all(startDate, endDate) as Array<{ category: string; total: number; count: number }>;

    const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

    return rows.map(r => ({
      category: r.category || 'Uncategorized',
      total: r.total,
      count: r.count,
      percentage: grandTotal > 0 ? Math.round((r.total / grandTotal) * 10000) / 100 : 0,
    }));
  }

  getMonthOverMonth(year: number, month: number): { current: MonthlyTotals; previous: MonthlyTotals } {
    const getCounts = (y: number, m: number): MonthlyTotals => {
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const end = m === 12
        ? `${y + 1}-01-01`
        : `${y}-${String(m + 1).padStart(2, '0')}-01`;

      const spending = this.db.prepare(`
        SELECT COALESCE(SUM(ABS(amount)), 0) as total, COUNT(*) as count
        FROM transactions WHERE date >= ? AND date < ? AND amount < 0
      `).get(start, end) as { total: number; count: number };

      const income = this.db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM transactions WHERE date >= ? AND date < ? AND amount > 0
      `).get(start, end) as { total: number };

      return {
        year: y,
        month: m,
        totalSpending: spending.total,
        totalIncome: income.total,
        transactionCount: spending.count,
      };
    };

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    return {
      current: getCounts(year, month),
      previous: getCounts(prevYear, prevMonth),
    };
  }

  getMerchantHistory(merchantNormalized: string, limit: number = 20): Transaction[] {
    const rows = this.db.prepare(`
      SELECT * FROM transactions
      WHERE merchant_normalized = ?
      ORDER BY date DESC
      LIMIT ?
    `).all(merchantNormalized, limit) as RawTxnRow[];

    return rows.map(r => this.rowToTransaction(r));
  }

  getRecentTransactions(limit: number = 50): Transaction[] {
    const rows = this.db.prepare(
      'SELECT * FROM transactions ORDER BY date DESC LIMIT ?'
    ).all(limit) as RawTxnRow[];

    return rows.map(r => this.rowToTransaction(r));
  }

  // ─── Deduplication ────────────────────────────────────────────────────────

  isDuplicate(accountId: string, date: string, merchantRaw: string, amount: number): boolean {
    const row = this.db.prepare(`
      SELECT id FROM transactions
      WHERE account_id = ? AND date = ? AND merchant_raw = ? AND amount = ?
      LIMIT 1
    `).get(accountId, date, merchantRaw, amount) as { id: string } | undefined;

    return !!row;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private rowToTransaction(r: RawTxnRow): Transaction {
    return {
      id: r.id,
      source: r.source as TransactionSource,
      accountId: r.account_id,
      date: r.date,
      merchantRaw: r.merchant_raw,
      merchantNormalized: r.merchant_normalized,
      amount: r.amount,
      currency: r.currency,
      category: r.category,
      subcategory: r.subcategory,
      isRecurring: r.is_recurring === 1,
      isSubscription: r.is_subscription === 1,
      plaidTransactionId: r.plaid_transaction_id,
      metadata: JSON.parse(r.metadata) as Record<string, unknown>,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private rowToAccount(r: RawAccountRow): Account {
    return {
      id: r.id,
      name: r.name,
      institution: r.institution,
      type: r.type as Account['type'],
      plaidAccountId: r.plaid_account_id,
      lastSyncedAt: r.last_synced_at,
      createdAt: r.created_at,
    };
  }
}

// ─── Raw row types ──────────────────────────────────────────────────────────

interface RawTxnRow {
  id: string;
  source: string;
  account_id: string;
  date: string;
  merchant_raw: string;
  merchant_normalized: string;
  amount: number;
  currency: string;
  category: string;
  subcategory: string;
  is_recurring: number;
  is_subscription: number;
  plaid_transaction_id: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

interface RawAccountRow {
  id: string;
  name: string;
  institution: string;
  type: string;
  plaid_account_id: string | null;
  last_synced_at: string | null;
  created_at: string;
}
