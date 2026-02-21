// Tests for StatementParser CSV parsing — various CSV formats, auto-detection, edge cases.

import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { StatementParser } from '@semblance/core/finance/statement-parser.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'statements');

describe('StatementParser — CSV', () => {
  let parser: StatementParser;

  beforeEach(() => {
    parser = new StatementParser();
  });

  describe('Chase credit card CSV', () => {
    it('parses Chase CSV with correct transaction count', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'chase-credit-card.csv'));
      expect(result.transactions.length).toBeGreaterThanOrEqual(5);
      expect(result.import.fileFormat).toBe('csv');
    });

    it('extracts negative amounts for charges', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'chase-credit-card.csv'));
      const charges = result.transactions.filter(t => t.amount < 0);
      expect(charges.length).toBeGreaterThan(0);
    });

    it('extracts dates in ISO format', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'chase-credit-card.csv'));
      for (const t of result.transactions) {
        expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });

  describe('Bank of America checking CSV', () => {
    it('parses BofA CSV with correct transaction count', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'bofa-checking.csv'));
      expect(result.transactions.length).toBeGreaterThanOrEqual(4);
    });

    it('extracts amounts as numbers', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'bofa-checking.csv'));
      for (const t of result.transactions) {
        expect(typeof t.amount).toBe('number');
        expect(Number.isFinite(t.amount)).toBe(true);
      }
    });

    it('extracts descriptions', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'bofa-checking.csv'));
      const descriptions = result.transactions.map(t => t.description);
      const hasNetflix = descriptions.some(d => d.includes('NETFLIX'));
      expect(hasNetflix).toBe(true);
    });
  });

  describe('European bank CSV', () => {
    it('detects semicolon delimiter', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'european-bank.csv'));
      expect(result.transactions.length).toBeGreaterThanOrEqual(4);
    });

    it('parses European date format (DD/MM/YYYY)', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'european-bank.csv'));
      for (const t of result.transactions) {
        expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('handles comma decimal amounts', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'european-bank.csv'));
      const nonZero = result.transactions.filter(t => t.amount !== 0);
      expect(nonZero.length).toBeGreaterThan(0);
    });
  });

  describe('Minimal CSV', () => {
    it('handles minimal 3-column CSV', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'minimal.csv'));
      expect(result.transactions.length).toBeGreaterThanOrEqual(3);
    });

    it('auto-detects column mapping without named headers', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'minimal.csv'));
      // Should still extract date, amount, description
      for (const t of result.transactions) {
        expect(t.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Messy CSV', () => {
    it('skips metadata header rows', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'messy.csv'));
      expect(result.transactions.length).toBeGreaterThanOrEqual(3);
    });

    it('produces valid dates despite messy format', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'messy.csv'));
      for (const t of result.transactions) {
        expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });

  describe('No subscriptions CSV', () => {
    it('parses one-time purchases correctly', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'no-subscriptions.csv'));
      expect(result.transactions.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Import metadata', () => {
    it('returns correct file format', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'chase-credit-card.csv'));
      expect(result.import.fileFormat).toBe('csv');
    });

    it('includes date range in import record', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'chase-credit-card.csv'));
      expect(result.import.dateRange.start).toBeTruthy();
      expect(result.import.dateRange.end).toBeTruthy();
    });

    it('includes transaction count in import record', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'chase-credit-card.csv'));
      expect(result.import.transactionCount).toBe(result.transactions.length);
    });

    it('generates unique import ID', async () => {
      const result1 = await parser.parseStatement(join(FIXTURES, 'chase-credit-card.csv'));
      const result2 = await parser.parseStatement(join(FIXTURES, 'chase-credit-card.csv'));
      expect(result1.import.id).not.toBe(result2.import.id);
    });
  });
});
