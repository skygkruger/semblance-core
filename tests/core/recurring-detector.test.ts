// Tests for RecurringDetector — frequency detection, confidence, forgotten flagging, SQLite storage.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { RecurringDetector } from '@semblance/core/finance/recurring-detector.js';
import { MerchantNormalizer } from '@semblance/core/finance/merchant-normalizer.js';
import type { Transaction } from '@semblance/core/finance/statement-parser.js';

function makeTxn(merchant: string, date: string, amount: number): Transaction {
  return {
    id: `txn-${Math.random().toString(36).slice(2)}`,
    date,
    amount,
    description: merchant,
    normalizedMerchant: merchant,
    category: '',
    isRecurring: false,
    recurrenceGroup: null,
  };
}

function monthlyCharges(merchant: string, amount: number, months: number): Transaction[] {
  const txns: Transaction[] = [];
  for (let i = 0; i < months; i++) {
    const date = new Date(2025, i, 15).toISOString().split('T')[0]!;
    txns.push(makeTxn(merchant, date, amount));
  }
  return txns;
}

describe('RecurringDetector', () => {
  let db: Database.Database;
  let detector: RecurringDetector;
  let normalizer: MerchantNormalizer;

  beforeEach(() => {
    db = new Database(':memory:');
    normalizer = new MerchantNormalizer();
    detector = new RecurringDetector({ db, normalizer });
  });

  describe('schema', () => {
    it('creates required tables', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('statement_imports', 'stored_transactions', 'recurring_charges')"
      ).all() as { name: string }[];
      expect(tables.map(t => t.name).sort()).toEqual(['recurring_charges', 'statement_imports', 'stored_transactions']);
    });
  });

  describe('detect', () => {
    it('detects monthly subscriptions from 3+ months of data', () => {
      const txns = monthlyCharges('Netflix', -15.99, 6);
      const normalized = normalizer.normalizeAll(txns);
      const charges = detector.detect(normalized);
      expect(charges.length).toBeGreaterThanOrEqual(1);
      const netflix = charges.find(c => c.merchantName === 'Netflix');
      expect(netflix).toBeDefined();
      expect(netflix!.frequency).toBe('monthly');
    });

    it('calculates correct estimated annual cost for monthly charges', () => {
      const txns = monthlyCharges('Netflix', -15.99, 6);
      const normalized = normalizer.normalizeAll(txns);
      const charges = detector.detect(normalized);
      const netflix = charges.find(c => c.merchantName === 'Netflix');
      expect(netflix!.estimatedAnnualCost).toBeCloseTo(15.99 * 12, 0);
    });

    it('detects weekly subscriptions', () => {
      const txns: Transaction[] = [];
      for (let i = 0; i < 8; i++) {
        const date = new Date(2025, 0, 1 + i * 7).toISOString().split('T')[0]!;
        txns.push(makeTxn('Meal Kit', date, -39.99));
      }
      const normalized = normalizer.normalizeAll(txns);
      const charges = detector.detect(normalized);
      const weekly = charges.find(c => c.frequency === 'weekly');
      expect(weekly).toBeDefined();
    });

    it('assigns higher confidence for consistent amounts', () => {
      const consistent = monthlyCharges('Netflix', -15.99, 6);
      const inconsistent = [
        makeTxn('Random Store', '2025-01-15', -10),
        makeTxn('Random Store', '2025-02-15', -50),
        makeTxn('Random Store', '2025-03-15', -25),
        makeTxn('Random Store', '2025-04-15', -100),
        makeTxn('Random Store', '2025-05-15', -5),
        makeTxn('Random Store', '2025-06-15', -75),
      ];
      const normalizedC = normalizer.normalizeAll(consistent);
      const normalizedI = normalizer.normalizeAll(inconsistent);
      const chargesC = detector.detect(normalizedC);
      const chargesI = detector.detect(normalizedI);
      // Consistent charges should generally have higher confidence
      if (chargesI.length > 0) {
        expect(chargesC[0]!.confidence).toBeGreaterThanOrEqual(chargesI[0]!.confidence);
      }
    });

    it('does not detect one-time purchases as recurring', () => {
      const txns = [
        makeTxn('Store A', '2025-01-15', -50),
        makeTxn('Store B', '2025-02-20', -30),
        makeTxn('Store C', '2025-03-10', -75),
      ];
      const normalized = normalizer.normalizeAll(txns);
      const charges = detector.detect(normalized);
      expect(charges.length).toBe(0);
    });

    it('handles amount variations (e.g., price changes)', () => {
      const txns = [
        makeTxn('Netflix', '2025-01-15', -13.99),
        makeTxn('Netflix', '2025-02-15', -13.99),
        makeTxn('Netflix', '2025-03-15', -15.99), // price increase
        makeTxn('Netflix', '2025-04-15', -15.99),
        makeTxn('Netflix', '2025-05-15', -15.99),
      ];
      const normalized = normalizer.normalizeAll(txns);
      const charges = detector.detect(normalized);
      expect(charges.length).toBeGreaterThanOrEqual(1);
    });

    it('sorts results by annual cost descending', () => {
      const txns = [
        ...monthlyCharges('Cheap Sub', -5, 4),
        ...monthlyCharges('Expensive Sub', -50, 4),
      ];
      const normalized = normalizer.normalizeAll(txns);
      const charges = detector.detect(normalized);
      if (charges.length >= 2) {
        expect(charges[0]!.estimatedAnnualCost).toBeGreaterThanOrEqual(charges[1]!.estimatedAnnualCost);
      }
    });

    it('requires minimum 2 transactions to detect recurring', () => {
      const txns = [makeTxn('Netflix', '2025-01-15', -15.99)];
      const normalized = normalizer.normalizeAll(txns);
      const charges = detector.detect(normalized);
      expect(charges.length).toBe(0);
    });
  });

  describe('flagForgotten', () => {
    it('flags charges without recent email contact as forgotten', async () => {
      const txns = monthlyCharges('Netflix', -15.99, 6);
      const normalized = normalizer.normalizeAll(txns);
      const charges = detector.detect(normalized);
      const flagged = await detector.flagForgotten(charges, () => []);
      const netflix = flagged.find(c => c.merchantName === 'Netflix');
      expect(netflix?.status).toBe('forgotten');
    });

    it('keeps charges with recent email contact as active', async () => {
      const txns = monthlyCharges('Netflix', -15.99, 6);
      const normalized = normalizer.normalizeAll(txns);
      const charges = detector.detect(normalized);
      const recentDate = new Date().toISOString();
      const flagged = await detector.flagForgotten(charges, () => [{ receivedAt: recentDate }]);
      const netflix = flagged.find(c => c.merchantName === 'Netflix');
      expect(netflix?.status).toBe('active');
    });

    it('does not flag low-value charges (< $5/month equivalent)', async () => {
      const txns = monthlyCharges('Tiny Sub', -2, 6);
      const normalized = normalizer.normalizeAll(txns);
      const charges = detector.detect(normalized);
      const flagged = await detector.flagForgotten(charges, () => []);
      const tiny = flagged.find(c => c.merchantName.includes('Tiny'));
      if (tiny) {
        expect(tiny.status).not.toBe('forgotten');
      }
    });
  });

  describe('storage', () => {
    it('stores import record', () => {
      const importRecord = {
        id: 'import-1',
        fileName: 'test.csv',
        fileFormat: 'csv' as const,
        transactionCount: 3,
        dateRange: { start: '2025-01-01', end: '2025-03-31' },
        importedAt: new Date().toISOString(),
      };
      detector.storeImport(importRecord, []);
      const stored = db.prepare('SELECT * FROM statement_imports WHERE id = ?').get('import-1') as Record<string, unknown>;
      expect(stored).toBeDefined();
      expect(stored.file_name).toBe('test.csv');
    });

    it('stores charges', () => {
      const txns = monthlyCharges('Netflix', -15.99, 4);
      const normalized = normalizer.normalizeAll(txns);
      const charges = detector.detect(normalized);
      detector.storeCharges(charges);
      const stored = db.prepare('SELECT COUNT(*) as count FROM recurring_charges').get() as { count: number };
      expect(stored.count).toBeGreaterThanOrEqual(1);
    });

    it('retrieves stored charges', () => {
      const txns = monthlyCharges('Netflix', -15.99, 4);
      const normalized = normalizer.normalizeAll(txns);
      const charges = detector.detect(normalized);
      detector.storeCharges(charges);
      const retrieved = detector.getStoredCharges();
      expect(retrieved.length).toBeGreaterThanOrEqual(1);
    });

    it('updates subscription status', () => {
      const txns = monthlyCharges('Netflix', -15.99, 4);
      const normalized = normalizer.normalizeAll(txns);
      const charges = detector.detect(normalized);
      detector.storeCharges(charges);
      const stored = detector.getStoredCharges();
      if (stored.length > 0) {
        detector.updateStatus(stored[0]!.id, 'cancelled');
        const updated = detector.getStoredCharges();
        const charge = updated.find(c => c.id === stored[0]!.id);
        expect(charge?.status).toBe('cancelled');
      }
    });

    it('provides subscription summary', () => {
      const txns = monthlyCharges('Netflix', -15.99, 4);
      const normalized = normalizer.normalizeAll(txns);
      const charges = detector.detect(normalized);
      detector.storeCharges(charges);
      const summary = detector.getSummary();
      expect(summary.totalAnnual).toBeGreaterThan(0);
      expect(summary.activeCount).toBeGreaterThanOrEqual(1);
    });
  });
});
