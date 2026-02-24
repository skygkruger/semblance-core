import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';
import { DarkPatternTracker } from '@semblance/core/defense/dark-pattern-tracker.js';
import { FinancialAdvocacyTracker } from '@semblance/core/defense/financial-advocacy-tracker.js';
import { OptOutAutopilot } from '@semblance/core/defense/optout-autopilot.js';
import type { SubscriptionAdvocacy } from '@semblance/core/defense/types.js';
import { AutonomyManager } from '@semblance/core/agent/autonomy.js';

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

function initDarkPatternTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dark_pattern_flags (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      content_type TEXT NOT NULL,
      flagged_at TEXT NOT NULL,
      confidence REAL NOT NULL,
      patterns_json TEXT NOT NULL DEFAULT '[]',
      reframe TEXT NOT NULL DEFAULT '',
      dismissed INTEGER NOT NULL DEFAULT 0,
      dismissed_at TEXT
    )
  `);
}

function insertFlag(db: Database.Database, overrides: Record<string, unknown> = {}): void {
  const defaults = {
    id: 'flag-1',
    content_id: 'email-001',
    content_type: 'email',
    flagged_at: new Date().toISOString(),
    confidence: 0.9,
    patterns_json: JSON.stringify([{ category: 'urgency', evidence: 'ACT NOW', confidence: 0.9 }]),
    reframe: 'An offer is available.',
    dismissed: 0,
  };
  const row = { ...defaults, ...overrides };
  db.prepare(`
    INSERT INTO dark_pattern_flags (id, content_id, content_type, flagged_at, confidence, patterns_json, reframe, dismissed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.content_id, row.content_type, row.flagged_at, row.confidence, row.patterns_json, row.reframe, row.dismissed);
}

function makeAdvocacy(overrides: Partial<SubscriptionAdvocacy> = {}): SubscriptionAdvocacy {
  return {
    chargeId: 'charge-1',
    merchantName: 'UnusedService',
    monthlyCost: 9.99,
    annualCost: 119.88,
    usage: { emailMentions: 0, browserVisits: 0, transactionCount: 2 },
    valueToCostRatio: 0.02,
    recommendation: 'consider_cancelling',
    reasoning: 'Low usage detected for UnusedService.',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DarkPatternTracker', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDb();
  });

  it('returns insights from recent flags', () => {
    activatePremium(db);
    initDarkPatternTable(db);
    insertFlag(db, { id: 'f1', content_id: 'email-001', confidence: 0.92 });
    insertFlag(db, { id: 'f2', content_id: 'email-002', confidence: 0.85 });

    const tracker = new DarkPatternTracker({
      db: db as unknown as DatabaseHandle,
      premiumGate: makePremiumGate(db) as any,
    });

    const insights = tracker.generateInsights();
    expect(insights).toHaveLength(2);
    expect(insights[0]!.type).toBe('dark_pattern');
    expect(insights[0]!.sourceIds).toContain('email-001');
    expect(insights[1]!.sourceIds).toContain('email-002');
  });

  it('returns empty when premium inactive', () => {
    // Do NOT activate premium
    initDarkPatternTable(db);
    insertFlag(db);

    const tracker = new DarkPatternTracker({
      db: db as unknown as DatabaseHandle,
      premiumGate: makePremiumGate(db) as any,
    });

    const insights = tracker.generateInsights();
    expect(insights).toHaveLength(0);
  });
});

describe('FinancialAdvocacyTracker', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDb();
  });

  it('returns insights for low-value subscriptions', () => {
    activatePremium(db);

    const mockAdvocate = {
      analyzeSubscriptions: () => [
        makeAdvocacy({ chargeId: 'c1', merchantName: 'UnusedApp', recommendation: 'consider_cancelling' }),
        makeAdvocacy({ chargeId: 'c2', merchantName: 'ModerateApp', recommendation: 'review' }),
        makeAdvocacy({ chargeId: 'c3', merchantName: 'GoodApp', recommendation: 'keep' }),
      ],
    };

    const tracker = new FinancialAdvocacyTracker({
      advocate: mockAdvocate as any,
      premiumGate: makePremiumGate(db) as any,
    });

    const insights = tracker.generateInsights();
    // Only 'consider_cancelling' and 'review' returned
    expect(insights).toHaveLength(2);
    expect(insights[0]!.type).toBe('subscription_advocacy');
    expect(insights[0]!.title).toContain('Consider cancelling');
    expect(insights[0]!.priority).toBe('high');
    expect(insights[1]!.title).toContain('Review');
    expect(insights[1]!.priority).toBe('normal');
  });

  it('returns empty when premium inactive', () => {
    // Do NOT activate premium
    const mockAdvocate = {
      analyzeSubscriptions: () => [makeAdvocacy()],
    };

    const tracker = new FinancialAdvocacyTracker({
      advocate: mockAdvocate as any,
      premiumGate: makePremiumGate(db) as any,
    });

    const insights = tracker.generateInsights();
    expect(insights).toHaveLength(0);
  });
});

describe('OptOutAutopilot', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDb();
  });

  it('proposes cancellation for consider_cancelling subscriptions in Alter Ego mode', () => {
    const autonomy = new AutonomyManager(db as unknown as DatabaseHandle, {
      defaultTier: 'partner',
      domainOverrides: { finances: 'alter_ego' },
    });

    const autopilot = new OptOutAutopilot({ autonomyManager: autonomy });

    const advocacyResults: SubscriptionAdvocacy[] = [
      makeAdvocacy({ chargeId: 'c1', merchantName: 'UnusedStreaming', recommendation: 'consider_cancelling' }),
      makeAdvocacy({ chargeId: 'c2', merchantName: 'GoodService', recommendation: 'keep' }),
      makeAdvocacy({ chargeId: 'c3', merchantName: 'LowUseApp', recommendation: 'consider_cancelling' }),
    ];

    const proposals = autopilot.evaluateCancellations(advocacyResults);

    // Only 'consider_cancelling' items returned
    expect(proposals).toHaveLength(2);
    expect(proposals[0]!.merchantName).toBe('UnusedStreaming');
    expect(proposals[0]!.autoApproved).toBe(true); // Alter Ego mode
    expect(proposals[1]!.merchantName).toBe('LowUseApp');
    expect(proposals[1]!.autoApproved).toBe(true);
  });
});
