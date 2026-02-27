import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';
import { DarkPatternDetector, URGENCY_PATTERNS } from '@semblance/core/defense/dark-pattern-detector.js';
import type { ContentForAnalysis } from '@semblance/core/defense/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS license (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      tier TEXT NOT NULL DEFAULT 'free',
      activated_at TEXT NOT NULL,
      expires_at TEXT,
      founding_seat INTEGER
    )
  `);
  return db;
}

function activatePremium(db: Database.Database): void {
  db.prepare(`
    INSERT OR REPLACE INTO license (id, tier, activated_at, expires_at)
    VALUES (1, 'digital-representative', ?, NULL)
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

function makeLlmProvider(response: { patterns: unknown[]; overall_confidence: number; reframe: string; is_manipulative: boolean }) {
  return {
    chat: vi.fn(async () => ({
      message: { role: 'assistant' as const, content: JSON.stringify(response) },
      model: 'test',
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      durationMs: 10,
    })),
    isAvailable: vi.fn(async () => true),
    generate: vi.fn(),
    embed: vi.fn(),
    listModels: vi.fn(async () => []),
    getModel: vi.fn(async () => null),
  };
}

function makeContent(overrides: Partial<ContentForAnalysis> = {}): ContentForAnalysis {
  return {
    id: 'content-1',
    contentType: 'email',
    subject: 'Your order update',
    body: 'Your package is on its way.',
    sender: 'shop@example.com',
    receivedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DarkPatternDetector', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDb();
  });

  it('regex pre-filter catches urgency phrases ("LAST CHANCE", "expires in 24 hours")', async () => {
    activatePremium(db);
    const llm = makeLlmProvider({
      patterns: [{ category: 'urgency', evidence: 'LAST CHANCE', confidence: 0.9 }],
      overall_confidence: 0.9,
      reframe: 'A sale is available.',
      is_manipulative: true,
    });

    const detector = new DarkPatternDetector({
      llmProvider: llm as any,
      model: 'test',
      db: db as unknown as DatabaseHandle,
      premiumGate: makePremiumGate(db) as any,
    });
    detector.initSchema();

    const result = await detector.analyze(makeContent({
      subject: 'LAST CHANCE — expires in 24 hours!',
      body: 'ACT NOW before it\'s too late',
    }));

    // Pre-filter should trigger and pass to LLM
    expect(llm.chat).toHaveBeenCalled();
    expect(result.flagged).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('regex pre-filter skips benign content (no LLM call)', async () => {
    activatePremium(db);
    const llm = makeLlmProvider({
      patterns: [],
      overall_confidence: 0.1,
      reframe: '',
      is_manipulative: false,
    });

    const detector = new DarkPatternDetector({
      llmProvider: llm as any,
      model: 'test',
      db: db as unknown as DatabaseHandle,
      premiumGate: makePremiumGate(db) as any,
    });
    detector.initSchema();

    const result = await detector.analyze(makeContent({
      subject: 'Meeting tomorrow at 3pm',
      body: 'Looking forward to discussing the project with you.',
    }));

    expect(llm.chat).not.toHaveBeenCalled();
    expect(result.flagged).toBe(false);
    expect(result.method).toBe('regex');
  });

  it('LLM analysis returns detected patterns with evidence', async () => {
    activatePremium(db);
    const llm = makeLlmProvider({
      patterns: [
        { category: 'urgency', evidence: 'LAST CHANCE', confidence: 0.9 },
        { category: 'scarcity', evidence: 'only 3 left', confidence: 0.85 },
      ],
      overall_confidence: 0.88,
      reframe: 'This product is available for purchase.',
      is_manipulative: true,
    });

    const detector = new DarkPatternDetector({
      llmProvider: llm as any,
      model: 'test',
      db: db as unknown as DatabaseHandle,
      premiumGate: makePremiumGate(db) as any,
    });
    detector.initSchema();

    const result = await detector.analyze(makeContent({
      subject: 'LAST CHANCE — only 3 left!',
      body: 'Limited time offer.',
    }));

    expect(result.patterns).toHaveLength(2);
    expect(result.patterns[0]!.category).toBe('urgency');
    expect(result.patterns[0]!.evidence).toBe('LAST CHANCE');
    expect(result.reframe).toContain('available');
  });

  it('only flags when confidence > 0.7 (conservative threshold)', async () => {
    activatePremium(db);
    const llm = makeLlmProvider({
      patterns: [{ category: 'urgency', evidence: 'ACT NOW', confidence: 0.5 }],
      overall_confidence: 0.5,
      reframe: 'A sale is happening.',
      is_manipulative: false,
    });

    const detector = new DarkPatternDetector({
      llmProvider: llm as any,
      model: 'test',
      db: db as unknown as DatabaseHandle,
      premiumGate: makePremiumGate(db) as any,
    });
    detector.initSchema();

    // Two regex patterns match (ACT NOW + limited time) -> score 0.2 >= 0.15 -> LLM triggered
    const result = await detector.analyze(makeContent({
      subject: 'ACT NOW — limited time!',
      body: 'A promotional sale.',
    }));

    // LLM returns 0.5 confidence + is_manipulative: false -> NOT flagged
    expect(result.flagged).toBe(false);
    expect(result.confidence).toBe(0.5);
  });

  it('stores flagged result in dark_pattern_flags table', async () => {
    activatePremium(db);
    const llm = makeLlmProvider({
      patterns: [{ category: 'urgency', evidence: 'URGENT', confidence: 0.9 }],
      overall_confidence: 0.9,
      reframe: 'A message requires your attention.',
      is_manipulative: true,
    });

    const detector = new DarkPatternDetector({
      llmProvider: llm as any,
      model: 'test',
      db: db as unknown as DatabaseHandle,
      premiumGate: makePremiumGate(db) as any,
    });
    detector.initSchema();

    await detector.analyze(makeContent({
      id: 'email-123',
      subject: 'URGENT: ACT NOW',
      body: 'Don\'t miss this limited time offer!',
    }));

    const flags = detector.getRecentFlags();
    expect(flags).toHaveLength(1);
    expect(flags[0]!.contentId).toBe('email-123');
    expect(flags[0]!.confidence).toBe(0.9);
  });

  it('batch analyze processes multiple items', async () => {
    activatePremium(db);
    const llm = makeLlmProvider({
      patterns: [{ category: 'urgency', evidence: 'ACT NOW', confidence: 0.9 }],
      overall_confidence: 0.85,
      reframe: 'An offer is available.',
      is_manipulative: true,
    });

    const detector = new DarkPatternDetector({
      llmProvider: llm as any,
      model: 'test',
      db: db as unknown as DatabaseHandle,
      premiumGate: makePremiumGate(db) as any,
    });
    detector.initSchema();

    const items = [
      makeContent({ id: 'c1', subject: 'ACT NOW — limited time!', body: 'Expires in 2 hours' }),
      makeContent({ id: 'c2', subject: 'LAST CHANCE to save!', body: 'Don\'t miss out' }),
    ];

    const results = await detector.analyzeBatch(items);
    expect(results).toHaveLength(2);
    expect(results.every(r => r.flagged)).toBe(true);
  });

  it('dismiss flag marks record as dismissed', async () => {
    activatePremium(db);
    const llm = makeLlmProvider({
      patterns: [{ category: 'urgency', evidence: 'URGENT', confidence: 0.9 }],
      overall_confidence: 0.9,
      reframe: 'Message.',
      is_manipulative: true,
    });

    const detector = new DarkPatternDetector({
      llmProvider: llm as any,
      model: 'test',
      db: db as unknown as DatabaseHandle,
      premiumGate: makePremiumGate(db) as any,
    });
    detector.initSchema();

    await detector.analyze(makeContent({
      id: 'dismiss-test',
      subject: 'URGENT action required!',
      body: 'ACT NOW',
    }));

    expect(detector.getRecentFlags()).toHaveLength(1);

    detector.dismissFlag('dismiss-test');

    expect(detector.getRecentFlags()).toHaveLength(0);
    expect(detector.getDismissedIds().has('dismiss-test')).toBe(true);
  });

  it('skips analysis when premium gate is inactive', async () => {
    // Do NOT activate premium
    const llm = makeLlmProvider({
      patterns: [],
      overall_confidence: 0,
      reframe: '',
      is_manipulative: false,
    });

    const detector = new DarkPatternDetector({
      llmProvider: llm as any,
      model: 'test',
      db: db as unknown as DatabaseHandle,
      premiumGate: makePremiumGate(db) as any,
    });
    detector.initSchema();

    const result = await detector.analyze(makeContent({
      subject: 'URGENT LAST CHANCE ACT NOW!',
      body: 'Expires in 1 hour!',
    }));

    expect(result.flagged).toBe(false);
    expect(llm.chat).not.toHaveBeenCalled();
  });
});
