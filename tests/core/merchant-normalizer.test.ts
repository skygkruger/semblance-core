// Tests for MerchantNormalizer — noise stripping, dictionary matching, edge cases.

import { describe, it, expect, beforeEach } from 'vitest';
import { MerchantNormalizer } from '@semblance/core/finance/merchant-normalizer.js';
import type { Transaction } from '@semblance/core/finance/statement-parser.js';

function makeTxn(description: string): Transaction {
  return {
    id: `txn-${Math.random()}`,
    date: '2025-01-15',
    amount: -9.99,
    description,
    normalizedMerchant: '',
    category: '',
    isRecurring: false,
    recurrenceGroup: null,
  };
}

describe('MerchantNormalizer', () => {
  let normalizer: MerchantNormalizer;

  beforeEach(() => {
    normalizer = new MerchantNormalizer();
  });

  describe('known merchant dictionary', () => {
    it('normalizes Netflix', () => {
      const result = normalizer.normalize('NETFLIX.COM 800-555-1234');
      expect(result.name).toBe('Netflix');
      expect(result.category).toBe('Entertainment');
    });

    it('normalizes Spotify', () => {
      const result = normalizer.normalize('SPOTIFY USA');
      expect(result.name).toBe('Spotify');
    });

    it('normalizes Amazon Prime', () => {
      const result = normalizer.normalize('AMZN PRIME*AB1234');
      expect(result.name).toBe('Amazon Prime');
    });

    it('normalizes Apple services', () => {
      const result = normalizer.normalize('APPLE.COM/BILL ONE APPLE PARK WAY');
      expect(result.name).toBe('Apple');
    });

    it('normalizes Google Storage', () => {
      const result = normalizer.normalize('GOOGLE *STORAGE');
      expect(result.name).toBe('Google Storage');
    });

    it('normalizes Adobe', () => {
      const result = normalizer.normalize('ADOBE CREATIVE CLOUD SAN JOSE CA');
      expect(result.name).toBe('Adobe Creative Cloud');
    });

    it('normalizes Uber vs Uber Eats', () => {
      expect(normalizer.normalize('UBER EATS TRIP').name).toBe('Uber Eats');
      expect(normalizer.normalize('UBER TRIP').name).toBe('Uber');
    });

    it('normalizes ChatGPT Plus', () => {
      const result = normalizer.normalize('CHATGPT SUBSCRIPTION');
      expect(result.name).toBe('ChatGPT Plus');
    });
  });

  describe('noise stripping', () => {
    it('removes phone numbers', () => {
      const result = normalizer.normalize('RANDOM STORE 555-123-4567');
      expect(result.name).not.toContain('555');
    });

    it('removes POS PURCHASE prefix', () => {
      const result = normalizer.normalize('POS PURCHASE COFFEE SHOP');
      expect(result.name).not.toMatch(/POS/i);
    });

    it('removes Square prefix', () => {
      const result = normalizer.normalize('SQ *LOCAL BAKERY');
      expect(result.name).not.toContain('SQ *');
    });

    it('removes Stripe prefix', () => {
      const result = normalizer.normalize('STRIPE *INDIE APP');
      expect(result.name).not.toContain('STRIPE *');
    });

    it('removes PayPal prefix', () => {
      const result = normalizer.normalize('PP *SMALL BUSINESS');
      expect(result.name).not.toContain('PP *');
    });

    it('removes card last four digits', () => {
      const result = normalizer.normalize('STORE NAME ****1234');
      expect(result.name).not.toContain('1234');
    });
  });

  describe('consistency', () => {
    it('same merchant always produces same name', () => {
      const name1 = normalizer.normalize('NETFLIX.COM 800-555-1234').name;
      const name2 = normalizer.normalize('NETFLIX.COM CA').name;
      expect(name1).toBe(name2);
    });

    it('case insensitive matching', () => {
      const name1 = normalizer.normalize('netflix').name;
      const name2 = normalizer.normalize('NETFLIX').name;
      expect(name1).toBe(name2);
    });
  });

  describe('normalizeAll', () => {
    it('normalizes all transactions in a batch', () => {
      const txns = [makeTxn('NETFLIX.COM'), makeTxn('SPOTIFY USA'), makeTxn('RANDOM STORE')];
      const result = normalizer.normalizeAll(txns);
      expect(result[0]!.normalizedMerchant).toBe('Netflix');
      expect(result[1]!.normalizedMerchant).toBe('Spotify');
      expect(result[2]!.normalizedMerchant.length).toBeGreaterThan(0);
    });

    it('assigns categories to known merchants', () => {
      const txns = [makeTxn('NETFLIX.COM')];
      const result = normalizer.normalizeAll(txns);
      expect(result[0]!.category).toBe('Entertainment');
    });
  });

  describe('groupByMerchant', () => {
    it('groups transactions by normalized merchant name', () => {
      const txns = [
        makeTxn('NETFLIX.COM 800'),
        makeTxn('NETFLIX.COM CA'),
        makeTxn('SPOTIFY USA'),
      ];
      const normalized = normalizer.normalizeAll(txns);
      const groups = normalizer.groupByMerchant(normalized);
      expect(groups.has('Netflix')).toBe(true);
      expect(groups.get('Netflix')!.length).toBe(2);
    });
  });

  describe('user corrections', () => {
    it('applies user correction over dictionary match', () => {
      normalizer.addCorrection('WEIRD CHARGE 123', 'My Subscription');
      const result = normalizer.normalize('WEIRD CHARGE 123');
      expect(result.name).toBe('My Subscription');
    });
  });

  describe('edge cases', () => {
    it('handles empty description', () => {
      const result = normalizer.normalize('');
      expect(result.name).toBeDefined();
    });

    it('handles very long descriptions', () => {
      const long = 'A'.repeat(500);
      const result = normalizer.normalize(long);
      expect(result.name.length).toBeGreaterThan(0);
    });
  });
});
