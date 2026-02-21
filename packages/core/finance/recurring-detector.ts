/**
 * Recurring Charge Detector — Identifies subscriptions from transaction patterns.
 *
 * Groups transactions by merchant, detects periodicity, assigns confidence,
 * flags "forgotten" subscriptions by cross-referencing email index.
 */

import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { Transaction, StatementImport } from './statement-parser.js';
import type { MerchantNormalizer } from './merchant-normalizer.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RecurringCharge {
  id: string;
  merchantName: string;
  amount: number;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'annual';
  confidence: number;             // 0-1
  lastChargeDate: string;
  chargeCount: number;
  estimatedAnnualCost: number;
  transactions: Transaction[];
  status: 'active' | 'forgotten' | 'cancelled' | 'user_confirmed';
}

export interface SubscriptionSummary {
  totalMonthly: number;
  totalAnnual: number;
  activeCount: number;
  forgottenCount: number;
  potentialSavings: number;       // annual savings from forgotten subscriptions
}

// ─── Frequency Detection ────────────────────────────────────────────────────

interface FrequencyResult {
  frequency: RecurringCharge['frequency'];
  confidence: number;
  avgInterval: number;
}

/**
 * AUTONOMOUS DECISION: Frequency detection uses interval-based heuristics.
 * Reasoning: Deterministic pattern matching with configurable tolerance.
 * Escalation check: Build prompt grants autonomy for detection thresholds.
 */
const FREQUENCY_RANGES = {
  weekly: { min: 5, max: 9, multiplier: 52 },
  monthly: { min: 26, max: 35, multiplier: 12 },
  quarterly: { min: 82, max: 100, multiplier: 4 },
  annual: { min: 340, max: 395, multiplier: 1 },
} as const;

function detectFrequency(intervals: number[]): FrequencyResult | null {
  if (intervals.length === 0) return null;

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

  for (const [freq, range] of Object.entries(FREQUENCY_RANGES)) {
    if (avgInterval >= range.min && avgInterval <= range.max) {
      // Calculate consistency: how close are intervals to the average?
      const variance = intervals.reduce((sum, i) => sum + Math.abs(i - avgInterval), 0) / intervals.length;
      const maxExpectedVariance = (range.max - range.min) / 2;
      const consistency = Math.max(0, 1 - variance / maxExpectedVariance);

      return {
        frequency: freq as RecurringCharge['frequency'],
        confidence: consistency,
        avgInterval,
      };
    }
  }

  return null;
}

function calculateIntervals(dates: string[]): number[] {
  const sorted = dates.map(d => new Date(d).getTime()).sort((a, b) => a - b);
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const diffDays = (sorted[i]! - sorted[i - 1]!) / (1000 * 60 * 60 * 24);
    intervals.push(diffDays);
  }
  return intervals;
}

function amountsAreConsistent(amounts: number[]): { consistent: boolean; typical: number } {
  if (amounts.length === 0) return { consistent: false, typical: 0 };

  const absAmounts = amounts.map(Math.abs);
  const median = absAmounts.sort((a, b) => a - b)[Math.floor(absAmounts.length / 2)]!;

  // Check if all amounts are within 15% of the median
  const allClose = absAmounts.every(a => Math.abs(a - median) / median < 0.15);
  return { consistent: allClose, typical: -median };
}

// ─── SQLite Schema ──────────────────────────────────────────────────────────

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS statement_imports (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_format TEXT NOT NULL,
    transaction_count INTEGER NOT NULL,
    date_range_start TEXT,
    date_range_end TEXT,
    imported_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stored_transactions (
    id TEXT PRIMARY KEY,
    import_id TEXT NOT NULL,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    raw_description TEXT NOT NULL,
    normalized_merchant TEXT NOT NULL,
    category TEXT DEFAULT '',
    is_recurring INTEGER DEFAULT 0,
    recurrence_group_id TEXT,
    imported_at TEXT NOT NULL,
    FOREIGN KEY (import_id) REFERENCES statement_imports(id)
  );

  CREATE TABLE IF NOT EXISTS recurring_charges (
    id TEXT PRIMARY KEY,
    merchant_name TEXT NOT NULL,
    typical_amount REAL NOT NULL,
    frequency TEXT NOT NULL,
    confidence REAL NOT NULL,
    last_charge_date TEXT,
    charge_count INTEGER NOT NULL,
    estimated_annual_cost REAL NOT NULL,
    status TEXT DEFAULT 'active',
    last_email_contact_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_txn_import ON stored_transactions(import_id);
  CREATE INDEX IF NOT EXISTS idx_txn_merchant ON stored_transactions(normalized_merchant);
  CREATE INDEX IF NOT EXISTS idx_recurring_status ON recurring_charges(status);
`;

// ─── Public API ─────────────────────────────────────────────────────────────

export class RecurringDetector {
  private db: Database.Database;
  private normalizer: MerchantNormalizer;

  constructor(config: { db: Database.Database; normalizer: MerchantNormalizer }) {
    this.db = config.db;
    this.normalizer = config.normalizer;
    this.db.exec(CREATE_TABLES);
  }

  /**
   * Detect recurring charges from a set of transactions.
   */
  detect(transactions: Transaction[]): RecurringCharge[] {
    const groups = this.normalizer.groupByMerchant(transactions);
    const charges: RecurringCharge[] = [];

    for (const [merchant, txns] of groups) {
      if (txns.length < 2) continue;

      const dates = txns.map(t => t.date).filter(d => d);
      if (dates.length < 2) continue;

      const intervals = calculateIntervals(dates);
      const freqResult = detectFrequency(intervals);
      if (!freqResult) continue;

      const amounts = txns.map(t => t.amount);
      const { consistent, typical } = amountsAreConsistent(amounts);

      // Confidence combines frequency regularity + amount consistency + sample size
      const sampleBonus = Math.min(txns.length / 6, 0.3);
      const amountBonus = consistent ? 0.2 : 0;
      const confidence = Math.min(1, freqResult.confidence * 0.5 + amountBonus + sampleBonus);

      if (confidence < 0.3) continue; // Too uncertain

      const sortedDates = dates.sort();
      const multiplier = FREQUENCY_RANGES[freqResult.frequency].multiplier;

      charges.push({
        id: nanoid(),
        merchantName: merchant,
        amount: typical,
        frequency: freqResult.frequency,
        confidence,
        lastChargeDate: sortedDates[sortedDates.length - 1]!,
        chargeCount: txns.length,
        estimatedAnnualCost: Math.abs(typical) * multiplier,
        transactions: txns,
        status: 'active',
      });
    }

    return charges.sort((a, b) => b.estimatedAnnualCost - a.estimatedAnnualCost);
  }

  /**
   * Flag subscriptions as "forgotten" if no email correspondence found.
   * @param charges - Detected recurring charges
   * @param emailSearchFn - Function to search indexed emails for merchant name
   * @param daysSinceEmail - Days threshold for "forgotten" (default 90)
   */
  async flagForgotten(
    charges: RecurringCharge[],
    emailSearchFn: (merchant: string) => Array<{ receivedAt: string }>,
    daysSinceEmail = 90,
  ): Promise<RecurringCharge[]> {
    const now = Date.now();
    const thresholdMs = daysSinceEmail * 24 * 60 * 60 * 1000;

    return charges.map(charge => {
      // Skip low-value charges (< $5/month equivalent)
      const monthlyEquiv = charge.estimatedAnnualCost / 12;
      if (monthlyEquiv < 5) return charge;

      const emails = emailSearchFn(charge.merchantName);
      const hasRecentEmail = emails.some(e => {
        const emailDate = new Date(e.receivedAt).getTime();
        return (now - emailDate) < thresholdMs;
      });

      if (!hasRecentEmail && charge.confidence >= 0.5) {
        return { ...charge, status: 'forgotten' as const };
      }
      return charge;
    });
  }

  /**
   * Store an import and its transactions in SQLite.
   */
  storeImport(importRecord: StatementImport, transactions: Transaction[]): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO statement_imports (id, file_name, file_format, transaction_count, date_range_start, date_range_end, imported_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      importRecord.id,
      importRecord.fileName,
      importRecord.fileFormat,
      importRecord.transactionCount,
      importRecord.dateRange.start,
      importRecord.dateRange.end,
      importRecord.importedAt,
    );

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO stored_transactions (id, import_id, date, amount, raw_description, normalized_merchant, category, is_recurring, recurrence_group_id, imported_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((txns: Transaction[]) => {
      for (const t of txns) {
        stmt.run(
          t.id, importRecord.id, t.date, t.amount, t.description,
          t.normalizedMerchant, t.category, t.isRecurring ? 1 : 0,
          t.recurrenceGroup, importRecord.importedAt,
        );
      }
    });
    insertMany(transactions);
  }

  /**
   * Store detected recurring charges in SQLite.
   */
  storeCharges(charges: RecurringCharge[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO recurring_charges (id, merchant_name, typical_amount, frequency, confidence, last_charge_date, charge_count, estimated_annual_cost, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    const insertMany = this.db.transaction((cs: RecurringCharge[]) => {
      for (const c of cs) {
        stmt.run(
          c.id, c.merchantName, c.amount, c.frequency, c.confidence,
          c.lastChargeDate, c.chargeCount, c.estimatedAnnualCost,
          c.status, now, now,
        );
      }
    });
    insertMany(charges);
  }

  /**
   * Get all stored recurring charges.
   */
  getStoredCharges(status?: string): RecurringCharge[] {
    const sql = status
      ? 'SELECT * FROM recurring_charges WHERE status = ? ORDER BY estimated_annual_cost DESC'
      : 'SELECT * FROM recurring_charges ORDER BY estimated_annual_cost DESC';
    const rows = (status ? this.db.prepare(sql).all(status) : this.db.prepare(sql).all()) as Array<{
      id: string; merchant_name: string; typical_amount: number; frequency: string;
      confidence: number; last_charge_date: string; charge_count: number;
      estimated_annual_cost: number; status: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      merchantName: r.merchant_name,
      amount: r.typical_amount,
      frequency: r.frequency as RecurringCharge['frequency'],
      confidence: r.confidence,
      lastChargeDate: r.last_charge_date,
      chargeCount: r.charge_count,
      estimatedAnnualCost: r.estimated_annual_cost,
      transactions: [],
      status: r.status as RecurringCharge['status'],
    }));
  }

  /**
   * Update the status of a recurring charge.
   */
  updateStatus(chargeId: string, status: RecurringCharge['status']): void {
    this.db.prepare(
      'UPDATE recurring_charges SET status = ?, updated_at = ? WHERE id = ?'
    ).run(status, new Date().toISOString(), chargeId);
  }

  /**
   * Get subscription summary statistics.
   */
  getSummary(): SubscriptionSummary {
    const charges = this.getStoredCharges();
    const active = charges.filter(c => c.status === 'active' || c.status === 'forgotten');
    const forgotten = charges.filter(c => c.status === 'forgotten');

    const totalAnnual = active.reduce((sum, c) => sum + c.estimatedAnnualCost, 0);
    const potentialSavings = forgotten.reduce((sum, c) => sum + c.estimatedAnnualCost, 0);

    return {
      totalMonthly: Math.round(totalAnnual / 12 * 100) / 100,
      totalAnnual: Math.round(totalAnnual * 100) / 100,
      activeCount: active.length,
      forgottenCount: forgotten.length,
      potentialSavings: Math.round(potentialSavings * 100) / 100,
    };
  }

  /**
   * Get import history.
   */
  getImports(): StatementImport[] {
    const rows = this.db.prepare(
      'SELECT * FROM statement_imports ORDER BY imported_at DESC'
    ).all() as Array<{
      id: string; file_name: string; file_format: string;
      transaction_count: number; date_range_start: string;
      date_range_end: string; imported_at: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      fileName: r.file_name,
      fileFormat: r.file_format as 'csv' | 'ofx' | 'qfx',
      transactionCount: r.transaction_count,
      dateRange: { start: r.date_range_start, end: r.date_range_end },
      importedAt: r.imported_at,
    }));
  }
}
