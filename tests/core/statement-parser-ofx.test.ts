// Tests for StatementParser OFX parsing — standard OFX format, transaction extraction.

import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { StatementParser } from '@semblance/core/finance/statement-parser.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'statements');

describe('StatementParser — OFX', () => {
  let parser: StatementParser;

  beforeEach(() => {
    parser = new StatementParser();
  });

  describe('Wells Fargo OFX', () => {
    it('parses OFX file and extracts transactions', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'wells-fargo.ofx'));
      expect(result.transactions.length).toBeGreaterThanOrEqual(3);
      expect(result.import.fileFormat).toBe('ofx');
    });

    it('extracts correct dates from OFX date format (YYYYMMDD)', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'wells-fargo.ofx'));
      for (const t of result.transactions) {
        expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('extracts transaction amounts as numbers', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'wells-fargo.ofx'));
      for (const t of result.transactions) {
        expect(typeof t.amount).toBe('number');
        expect(Number.isFinite(t.amount)).toBe(true);
      }
    });

    it('extracts merchant/payee names', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'wells-fargo.ofx'));
      for (const t of result.transactions) {
        expect(t.description.length).toBeGreaterThan(0);
      }
    });

    it('includes negative amounts for debits', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'wells-fargo.ofx'));
      const debits = result.transactions.filter(t => t.amount < 0);
      expect(debits.length).toBeGreaterThan(0);
    });

    it('includes positive amounts for credits', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'wells-fargo.ofx'));
      const credits = result.transactions.filter(t => t.amount > 0);
      expect(credits.length).toBeGreaterThan(0);
    });
  });

  describe('Import metadata', () => {
    it('returns ofx format', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'wells-fargo.ofx'));
      expect(result.import.fileFormat).toBe('ofx');
    });

    it('includes date range', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'wells-fargo.ofx'));
      expect(result.import.dateRange.start).toBeTruthy();
      expect(result.import.dateRange.end).toBeTruthy();
    });

    it('includes correct transaction count', async () => {
      const result = await parser.parseStatement(join(FIXTURES, 'wells-fargo.ofx'));
      expect(result.import.transactionCount).toBe(result.transactions.length);
    });
  });
});
