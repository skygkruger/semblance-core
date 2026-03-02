// Tests for IntentManager — user intent, hard limits, personal values, observations.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { IntentManager } from '@semblance/core/agent/intent-manager.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';
import type { LLMProvider } from '@semblance/core/llm/types.js';

function createMockLLM(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn().mockResolvedValue({
      text: '{}',
      model: 'test',
      tokensUsed: { prompt: 10, completion: 5, total: 15 },
      durationMs: 100,
    }),
    chat: vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: '' },
      model: 'test',
      tokensUsed: { prompt: 10, completion: 5, total: 15 },
      durationMs: 100,
    }),
    embed: vi.fn().mockResolvedValue({
      embeddings: [[0.1, 0.2]],
      model: 'test',
      durationMs: 50,
    }),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe('IntentManager', () => {
  let db: Database.Database;
  let manager: IntentManager;

  beforeEach(() => {
    db = new Database(':memory:');
    // Create the preferences table that IntentManager.getLastCheckInTimestamp/setLastCheckInTimestamp depend on
    db.exec(`
      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    manager = new IntentManager({ db: db as unknown as DatabaseHandle });
  });

  afterEach(() => {
    db.close();
  });

  // ─── 1. Constructor / Schema ───────────────────────────────────────────────

  it('constructor creates tables without error', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('user_intent');
    expect(names).toContain('hard_limits');
    expect(names).toContain('personal_values');
    expect(names).toContain('intent_observations');
  });

  // ─── 2. getIntent — initial state ─────────────────────────────────────────

  it('getIntent returns null initially', () => {
    const intent = manager.getIntent();
    expect(intent).toBeNull();
  });

  // ─── 3–4. setPrimaryGoal ──────────────────────────────────────────────────

  it('setPrimaryGoal stores and retrieves goal', () => {
    manager.setPrimaryGoal('Build a sustainable business');
    const intent = manager.getIntent();
    expect(intent).not.toBeNull();
    expect(intent!.primaryGoal).toBe('Build a sustainable business');
    expect(intent!.primaryGoalSetAt).toBeTruthy();
  });

  it('setPrimaryGoal updates existing goal', () => {
    manager.setPrimaryGoal('First goal');
    manager.setPrimaryGoal('Updated goal');
    const intent = manager.getIntent();
    expect(intent!.primaryGoal).toBe('Updated goal');
  });

  // ─── 5–7. addHardLimit ────────────────────────────────────────────────────

  it('addHardLimit with LLM parses rule correctly', async () => {
    const llm = createMockLLM({
      generate: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          action: 'never',
          scope: 'email.send',
          target: 'my ex',
          category: 'person',
          confidence: 0.9,
        }),
        model: 'test',
        tokensUsed: { prompt: 10, completion: 5, total: 15 },
        durationMs: 100,
      }),
    });
    const mgr = new IntentManager({
      db: db as unknown as DatabaseHandle,
      llm,
      model: 'test-model',
    });

    const limit = await mgr.addHardLimit('Never email my ex', 'settings');
    expect(limit.parsedRule.action).toBe('never');
    expect(limit.parsedRule.scope).toBe('email.send');
    expect(limit.parsedRule.target).toBe('my ex');
    expect(limit.parsedRule.category).toBe('person');
    expect(limit.parsedRule.confidence).toBe(0.9);
    expect(limit.active).toBe(true);
    expect(limit.source).toBe('settings');
  });

  it('addHardLimit without LLM creates unparsed limit (confidence=0)', async () => {
    const limit = await manager.addHardLimit('Never email my ex', 'onboarding');
    expect(limit.parsedRule.confidence).toBe(0);
    expect(limit.parsedRule.scope).toBe('');
    expect(limit.parsedRule.action).toBe('never');
  });

  it('addHardLimit preserves rawText exactly', async () => {
    const rawText = '  Never contact my ex-partner Bob Smith!!!  ';
    const limit = await manager.addHardLimit(rawText, 'chat');
    expect(limit.rawText).toBe(rawText);
  });

  // ─── 8. removeHardLimit ───────────────────────────────────────────────────

  it('removeHardLimit deletes the limit', async () => {
    const limit = await manager.addHardLimit('No crypto', 'settings');
    manager.removeHardLimit(limit.id);
    const intent = manager.getIntent();
    // With no goal and no limits/values, getIntent returns null
    expect(intent).toBeNull();
  });

  // ─── 9. toggleHardLimit ───────────────────────────────────────────────────

  it('toggleHardLimit activates/deactivates', async () => {
    const limit = await manager.addHardLimit('No crypto', 'settings');
    expect(limit.active).toBe(true);

    manager.toggleHardLimit(limit.id, false);
    const intent1 = manager.getIntent();
    expect(intent1).not.toBeNull();
    const deactivated = intent1!.hardLimits.find(l => l.id === limit.id);
    expect(deactivated!.active).toBe(false);

    manager.toggleHardLimit(limit.id, true);
    const intent2 = manager.getIntent();
    const reactivated = intent2!.hardLimits.find(l => l.id === limit.id);
    expect(reactivated!.active).toBe(true);
  });

  // ─── 10. getIntent returns all limits and values ──────────────────────────

  it('getIntent returns all limits and values', async () => {
    manager.setPrimaryGoal('Be productive');
    await manager.addHardLimit('No spam', 'settings');
    await manager.addHardLimit('No crypto', 'onboarding');
    await manager.addPersonalValue('Family first', 'onboarding');

    const intent = manager.getIntent();
    expect(intent).not.toBeNull();
    expect(intent!.primaryGoal).toBe('Be productive');
    expect(intent!.hardLimits).toHaveLength(2);
    expect(intent!.personalValues).toHaveLength(1);
  });

  // ─── 11–13. addPersonalValue / removePersonalValue ────────────────────────

  it('addPersonalValue with LLM extracts theme', async () => {
    const llm = createMockLLM({
      generate: vi.fn().mockResolvedValue({
        text: 'family',
        model: 'test',
        tokensUsed: { prompt: 10, completion: 5, total: 15 },
        durationMs: 100,
      }),
    });
    const mgr = new IntentManager({
      db: db as unknown as DatabaseHandle,
      llm,
      model: 'test-model',
    });

    const value = await mgr.addPersonalValue('My kids come first', 'onboarding');
    expect(value.theme).toBe('family');
    expect(value.rawText).toBe('My kids come first');
    expect(value.source).toBe('onboarding');
    expect(value.active).toBe(true);
  });

  it('addPersonalValue without LLM uses empty theme', async () => {
    const value = await manager.addPersonalValue('Health matters', 'settings');
    expect(value.theme).toBe('');
  });

  it('removePersonalValue deletes the value', async () => {
    const value = await manager.addPersonalValue('Health matters', 'settings');
    manager.removePersonalValue(value.id);
    const intent = manager.getIntent();
    expect(intent).toBeNull();
  });

  // ─── 14–16. buildIntentContext ────────────────────────────────────────────

  it('buildIntentContext returns empty string when no intent', () => {
    const ctx = manager.buildIntentContext();
    expect(ctx).toBe('');
  });

  it('buildIntentContext includes goal, limits, and values', async () => {
    manager.setPrimaryGoal('Launch the product');
    await manager.addHardLimit('No spam emails', 'settings');
    await manager.addPersonalValue('Work-life balance', 'chat');

    const ctx = manager.buildIntentContext();
    expect(ctx).toContain('USER INTENT CONTEXT');
    expect(ctx).toContain('Primary Goal: Launch the product');
    expect(ctx).toContain('Hard Limits (NEVER violate these):');
    expect(ctx).toContain('- No spam emails');
    expect(ctx).toContain('Personal Values:');
    expect(ctx).toContain('- Work-life balance');
    expect(ctx).toContain('When taking autonomous actions:');
  });

  it('buildIntentContext only includes active limits', async () => {
    manager.setPrimaryGoal('Ship it');
    const limit1 = await manager.addHardLimit('No crypto', 'settings');
    await manager.addHardLimit('No spam', 'settings');
    manager.toggleHardLimit(limit1.id, false);

    const ctx = manager.buildIntentContext();
    expect(ctx).not.toContain('- No crypto');
    expect(ctx).toContain('- No spam');
  });

  // ─── 17. getUnparsedLimits ────────────────────────────────────────────────

  it('getUnparsedLimits returns limits with confidence=0', async () => {
    // No LLM → all limits will be unparsed (confidence=0)
    await manager.addHardLimit('Limit A', 'settings');
    await manager.addHardLimit('Limit B', 'chat');

    const unparsed = manager.getUnparsedLimits();
    expect(unparsed).toHaveLength(2);
    expect(unparsed[0]!.parsedRule.confidence).toBe(0);
    expect(unparsed[1]!.parsedRule.confidence).toBe(0);
  });

  // ─── 18. retryParsing ────────────────────────────────────────────────────

  it('retryParsing re-parses unparsed limits', async () => {
    // Add limits without LLM (unparsed)
    await manager.addHardLimit('Never email my ex', 'settings');
    await manager.addHardLimit('No crypto trades', 'chat');

    expect(manager.getUnparsedLimits()).toHaveLength(2);

    // Create a new manager with LLM to retry
    const llm = createMockLLM({
      generate: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          action: 'never',
          scope: 'email.send',
          target: 'my ex',
          category: 'person',
          confidence: 0.85,
        }),
        model: 'test',
        tokensUsed: { prompt: 10, completion: 5, total: 15 },
        durationMs: 100,
      }),
    });
    const mgrWithLLM = new IntentManager({
      db: db as unknown as DatabaseHandle,
      llm,
      model: 'test-model',
    });

    const count = await mgrWithLLM.retryParsing();
    expect(count).toBe(2);
    expect(mgrWithLLM.getUnparsedLimits()).toHaveLength(0);
  });

  // ─── 19–22. Observations ──────────────────────────────────────────────────

  it('recordObservation stores observation', () => {
    const obs = manager.recordObservation({
      observedAt: new Date().toISOString(),
      type: 'drift',
      description: 'User started approving crypto actions despite hard limit',
      evidence: ['approved crypto trade on 2026-01-15'],
      surfacedMorningBrief: false,
      surfacedInChat: false,
      dismissed: false,
    });

    expect(obs.id).toBeTruthy();
    expect(obs.type).toBe('drift');
    expect(obs.description).toContain('crypto');
    expect(obs.evidence).toHaveLength(1);
  });

  it('getPendingObservations returns unsurfaced observations', () => {
    manager.recordObservation({
      observedAt: new Date().toISOString(),
      type: 'alignment',
      description: 'Actions align with goal',
      evidence: [],
      surfacedMorningBrief: false,
      surfacedInChat: false,
      dismissed: false,
    });
    manager.recordObservation({
      observedAt: new Date().toISOString(),
      type: 'conflict',
      description: 'Conflicting values detected',
      evidence: ['evidence-1'],
      surfacedMorningBrief: false,
      surfacedInChat: false,
      dismissed: false,
    });

    const pending = manager.getPendingObservations();
    expect(pending).toHaveLength(2);
  });

  it('getPendingObservations filters by channel (morning_brief)', () => {
    const obs1 = manager.recordObservation({
      observedAt: new Date().toISOString(),
      type: 'drift',
      description: 'Drift obs',
      evidence: [],
      surfacedMorningBrief: false,
      surfacedInChat: false,
      dismissed: false,
    });
    manager.recordObservation({
      observedAt: new Date().toISOString(),
      type: 'alignment',
      description: 'Alignment obs',
      evidence: [],
      surfacedMorningBrief: false,
      surfacedInChat: false,
      dismissed: false,
    });

    // Mark first as surfaced in morning brief
    manager.markSurfacedMorningBrief(obs1.id);

    const morningPending = manager.getPendingObservations('morning_brief');
    expect(morningPending).toHaveLength(1);
    expect(morningPending[0]!.description).toBe('Alignment obs');

    // chat channel should still see both (neither surfaced in chat)
    const chatPending = manager.getPendingObservations('chat');
    expect(chatPending).toHaveLength(2);
  });

  it('getPendingObservations filters by channel (chat)', () => {
    const obs1 = manager.recordObservation({
      observedAt: new Date().toISOString(),
      type: 'drift',
      description: 'Drift obs',
      evidence: [],
      surfacedMorningBrief: false,
      surfacedInChat: false,
      dismissed: false,
    });
    manager.recordObservation({
      observedAt: new Date().toISOString(),
      type: 'conflict',
      description: 'Conflict obs',
      evidence: [],
      surfacedMorningBrief: false,
      surfacedInChat: false,
      dismissed: false,
    });

    manager.markSurfacedInChat(obs1.id);

    const chatPending = manager.getPendingObservations('chat');
    expect(chatPending).toHaveLength(1);
    expect(chatPending[0]!.description).toBe('Conflict obs');
  });

  it('dismissObservation marks observation dismissed', () => {
    const obs = manager.recordObservation({
      observedAt: new Date().toISOString(),
      type: 'drift',
      description: 'Some drift',
      evidence: [],
      surfacedMorningBrief: false,
      surfacedInChat: false,
      dismissed: false,
    });

    manager.dismissObservation(obs.id, 'I know, I changed my mind');

    const pending = manager.getPendingObservations();
    expect(pending).toHaveLength(0);

    // Verify the dismissed row has the user response
    const row = db.prepare('SELECT * FROM intent_observations WHERE id = ?').get(obs.id) as {
      dismissed: number;
      dismissed_at: string | null;
      user_response: string | null;
    };
    expect(row.dismissed).toBe(1);
    expect(row.dismissed_at).toBeTruthy();
    expect(row.user_response).toBe('I know, I changed my mind');
  });

  // ─── 23–24. markSurfaced ──────────────────────────────────────────────────

  it('markSurfacedMorningBrief updates flag', () => {
    const obs = manager.recordObservation({
      observedAt: new Date().toISOString(),
      type: 'alignment',
      description: 'Good alignment',
      evidence: [],
      surfacedMorningBrief: false,
      surfacedInChat: false,
      dismissed: false,
    });

    manager.markSurfacedMorningBrief(obs.id);

    const row = db.prepare('SELECT surfaced_morning_brief FROM intent_observations WHERE id = ?').get(obs.id) as {
      surfaced_morning_brief: number;
    };
    expect(row.surfaced_morning_brief).toBe(1);
  });

  it('markSurfacedInChat updates flag', () => {
    const obs = manager.recordObservation({
      observedAt: new Date().toISOString(),
      type: 'conflict',
      description: 'Conflict detected',
      evidence: [],
      surfacedMorningBrief: false,
      surfacedInChat: false,
      dismissed: false,
    });

    manager.markSurfacedInChat(obs.id);

    const row = db.prepare('SELECT surfaced_in_chat FROM intent_observations WHERE id = ?').get(obs.id) as {
      surfaced_in_chat: number;
    };
    expect(row.surfaced_in_chat).toBe(1);
  });

  // ─── 25. getLastCheckInTimestamp / setLastCheckInTimestamp ─────────────────

  it('getLastCheckInTimestamp returns null initially', () => {
    expect(manager.getLastCheckInTimestamp()).toBeNull();
  });

  it('setLastCheckInTimestamp stores and retrieves timestamp', () => {
    const ts = '2026-03-01T09:00:00.000Z';
    manager.setLastCheckInTimestamp(ts);
    expect(manager.getLastCheckInTimestamp()).toBe(ts);
  });

  it('setLastCheckInTimestamp overwrites previous value', () => {
    manager.setLastCheckInTimestamp('2026-03-01T09:00:00.000Z');
    manager.setLastCheckInTimestamp('2026-03-02T10:00:00.000Z');
    expect(manager.getLastCheckInTimestamp()).toBe('2026-03-02T10:00:00.000Z');
  });
});
