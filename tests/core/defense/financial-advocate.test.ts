import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';
import { FinancialAdvocate } from '@semblance/core/defense/financial-advocate.js';
import type { RecurringCharge } from '@semblance/core/finance/recurring-detector.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS license (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      tier TEXT NOT NULL DEFAULT 'free',
      activated_at TEXT NOT NULL,
      expires_at TEXT,
      license_key TEXT NOT NULL
    )
  `);
  // Import pipeline tables (for browser visit counting)
  db.exec(`
    CREATE TABLE IF NOT EXISTS imported_items (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      format TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      import_id TEXT NOT NULL,
      embedding_id TEXT,
      entity_id TEXT
    )
  `);
  return db;
}

function activatePremium(db: Database.Database): void {
  db.prepare(`
    INSERT OR REPLACE INTO license (id, tier, activated_at, expires_at, license_key)
    VALUES (1, 'digital-representative', ?, NULL, 'sem_test.eyJ0aWVyIjoiZGlnaXRhbC1yZXByZXNlbnRhdGl2ZSJ9.sig')
  `).run(new Date().toISOString());
}

function makePremiumGate(db: Database.Database) {
  return {
    isPremium: () => {
      const row = db.prepare('SELECT tier FROM license WHERE id = 1').get() as { tier: string } | undefined;
      return row?.tier === 'digital-representative' || row?.tier === 'lifetime';
    },
    isFeatureAvailable: (_feature: string) => {
      const row = db.prepare('SELECT tier FROM license WHERE id = 1').get() as { tier: string } | undefined;
      return row?.tier === 'digital-representative' || row?.tier === 'lifetime';
    },
  };
}

function makeCharge(overrides: Partial<RecurringCharge> = {}): RecurringCharge {
  return {
    id: 'charge-1',
    merchantName: 'Netflix',
    amount: -15.99,
    frequency: 'monthly',
    confidence: 0.9,
    lastChargeDate: '2024-01-15',
    chargeCount: 12,
    estimatedAnnualCost: 191.88,
    transactions: [],
    status: 'active',
    ...overrides,
  };
}

function makeRecurringDetector(charges: RecurringCharge[]) {
  return {
    getStoredCharges: () => charges,
    getSummary: () => ({
      totalMonthly: charges.reduce((s, c) => s + c.estimatedAnnualCost / 12, 0),
      totalAnnual: charges.reduce((s, c) => s + c.estimatedAnnualCost, 0),
      activeCount: charges.length,
      forgottenCount: 0,
      potentialSavings: 0,
    }),
    detect: () => charges,
    storeCharges: () => {},
    storeImport: () => {},
    updateStatus: () => {},
    getImports: () => [],
    flagForgotten: async () => charges,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('FinancialAdvocate', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDb();
  });

  it('analyzes subscriptions from RecurringDetector', () => {
    activatePremium(db);
    const charges = [
      makeCharge({ id: 'c1', merchantName: 'Netflix', estimatedAnnualCost: 191.88 }),
      makeCharge({ id: 'c2', merchantName: 'Spotify', estimatedAnnualCost: 119.88 }),
    ];

    const advocate = new FinancialAdvocate({
      recurringDetector: makeRecurringDetector(charges) as any,
      db: db as unknown as DatabaseHandle,
      premiumGate: makePremiumGate(db) as any,
    });

    const results = advocate.analyzeSubscriptions();
    expect(results).toHaveLength(2);
    expect(results[0]!.merchantName).toBe('Netflix');
    expect(results[1]!.merchantName).toBe('Spotify');
  });

  it('calculates correct value-to-cost ratio', () => {
    activatePremium(db);
    // High email mentions should increase the ratio
    const emailSearch = (merchant: string) => merchant === 'Netflix' ? 100 : 0;

    const advocate = new FinancialAdvocate({
      recurringDetector: makeRecurringDetector([
        makeCharge({ merchantName: 'Netflix', estimatedAnnualCost: 191.88, chargeCount: 12 }),
      ]) as any,
      db: db as unknown as DatabaseHandle,
      premiumGate: makePremiumGate(db) as any,
      emailSearchFn: emailSearch,
    });

    const results = advocate.analyzeSubscriptions();
    expect(results).toHaveLength(1);
    // 100 emails * 0.5 + 0 visits * 0.25 + 12 charges * 1.0 = 62 / 191.88 ≈ 0.323
    expect(results[0]!.valueToCostRatio).toBeGreaterThan(0.3);
  });

  it("recommends 'consider_cancelling' when ratio < 0.3", () => {
    activatePremium(db);
    // Zero email mentions, zero browser visits, low charge count, high cost
    const advocate = new FinancialAdvocate({
      recurringDetector: makeRecurringDetector([
        makeCharge({
          merchantName: 'UnusedService',
          estimatedAnnualCost: 200,
          chargeCount: 2,
        }),
      ]) as any,
      db: db as unknown as DatabaseHandle,
      premiumGate: makePremiumGate(db) as any,
      emailSearchFn: () => 0,
    });

    const results = advocate.analyzeSubscriptions();
    expect(results).toHaveLength(1);
    // 0 + 0 + 2*1.0 = 2 / 200 = 0.01 < 0.3
    expect(results[0]!.recommendation).toBe('consider_cancelling');
    expect(results[0]!.valueToCostRatio).toBeLessThan(0.3);
  });

  it("recommends 'review' when ratio between 0.3 and 0.7", () => {
    activatePremium(db);
    // Moderate usage: some emails, moderate cost
    const advocate = new FinancialAdvocate({
      recurringDetector: makeRecurringDetector([
        makeCharge({
          merchantName: 'ModerateService',
          estimatedAnnualCost: 100,
          chargeCount: 12,
        }),
      ]) as any,
      db: db as unknown as DatabaseHandle,
      premiumGate: makePremiumGate(db) as any,
      emailSearchFn: () => 50, // 50 emails
    });

    const results = advocate.analyzeSubscriptions();
    expect(results).toHaveLength(1);
    // 30 * 0.5 + 0 + 12 * 1.0 = 27 / 100 = 0.27... hmm that's < 0.3
    // Need more usage. Let's use 50 emails: 50*0.5 + 12*1.0 = 37 / 100 = 0.37
    expect(results[0]!.recommendation).toBe('review');
  });

  it("recommends 'keep' when ratio >= 0.7", () => {
    activatePremium(db);
    const advocate = new FinancialAdvocate({
      recurringDetector: makeRecurringDetector([
        makeCharge({
          merchantName: 'HeavyUseService',
          estimatedAnnualCost: 60,
          chargeCount: 12,
        }),
      ]) as any,
      db: db as unknown as DatabaseHandle,
      premiumGate: makePremiumGate(db) as any,
      emailSearchFn: () => 100, // 100 email mentions
    });

    const results = advocate.analyzeSubscriptions();
    expect(results).toHaveLength(1);
    // 100 * 0.5 + 0 + 12 * 1.0 = 62 / 60 = 1.03 >= 0.7
    expect(results[0]!.recommendation).toBe('keep');
    expect(results[0]!.valueToCostRatio).toBeGreaterThanOrEqual(0.7);
  });

  it('skips analysis when premium gate is inactive', () => {
    // Do NOT activate premium
    const advocate = new FinancialAdvocate({
      recurringDetector: makeRecurringDetector([makeCharge()]) as any,
      db: db as unknown as DatabaseHandle,
      premiumGate: makePremiumGate(db) as any,
    });

    const results = advocate.analyzeSubscriptions();
    expect(results).toHaveLength(0);
  });
});
