// Tests for IntentDriftAnalyzer — behavioral drift detection against stated values/goals.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { IntentDriftAnalyzer } from '@semblance/core/agent/intent-drift-analyzer.js';
import { IntentManager } from '@semblance/core/agent/intent-manager.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';
import type { LLMProvider } from '@semblance/core/llm/types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function createMockLLM(responseText?: string): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn().mockResolvedValue({
      text: responseText ?? JSON.stringify([
        { type: 'drift', description: 'You mentioned family is important but this week was heavily work-focused.' },
      ]),
      model: 'llama3.2:8b',
      tokensUsed: { prompt: 100, completion: 50, total: 150 },
      durationMs: 500,
    }),
    chat: vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: '' },
      model: 'llama3.2:8b',
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      durationMs: 0,
    }),
    embed: vi.fn().mockResolvedValue([[0.1, 0.2]]),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn(),
  };
}

function createPendingActionsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_actions (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_approval',
      created_at TEXT NOT NULL
    );
  `);
}

function seedActions(
  db: Database.Database,
  actions: Array<{ id: string; action: string; status: string; created_at: string }>,
): void {
  const stmt = db.prepare(
    'INSERT INTO pending_actions (id, action, status, created_at) VALUES (?, ?, ?, ?)',
  );
  for (const a of actions) {
    stmt.run(a.id, a.action, a.status, a.created_at);
  }
}

describe('IntentDriftAnalyzer', () => {
  let db: Database.Database;
  let intentManager: IntentManager;

  beforeEach(() => {
    db = new Database(':memory:');
    createPendingActionsTable(db);
    intentManager = new IntentManager({ db: db as unknown as DatabaseHandle });
  });

  afterEach(() => {
    db.close();
  });

  // ── Test 1: Empty array when no intent is set ────────────────────────────

  it('returns empty array when no intent is set', async () => {
    // No primary goal, no values set — intentManager.getIntent() returns null
    const llm = createMockLLM();
    const analyzer = new IntentDriftAnalyzer({
      db: db as unknown as DatabaseHandle,
      intentManager,
      llm,
      model: 'llama3.2:8b',
    });

    const result = await analyzer.analyzeBehaviorPatterns();
    expect(result).toEqual([]);
    // LLM should never be called when no intent exists
    expect(llm.generate).not.toHaveBeenCalled();
  });

  // ── Test 2: Empty array when no actions in audit trail ───────────────────

  it('returns empty array when no actions in audit trail', async () => {
    intentManager.setPrimaryGoal('Spend more time with family');
    await intentManager.addPersonalValue('Family comes first', 'onboarding');

    const llm = createMockLLM();
    const analyzer = new IntentDriftAnalyzer({
      db: db as unknown as DatabaseHandle,
      intentManager,
      llm,
      model: 'llama3.2:8b',
    });

    // No actions seeded — pending_actions table is empty
    const result = await analyzer.analyzeBehaviorPatterns();
    expect(result).toEqual([]);
    expect(llm.generate).not.toHaveBeenCalled();
  });

  // ── Test 3: Empty array when no LLM available ───────────────────────────

  it('returns empty array when no LLM available', async () => {
    intentManager.setPrimaryGoal('Be more productive');
    await intentManager.addPersonalValue('Health is a priority', 'onboarding');

    const now = new Date();
    seedActions(db, [
      { id: 'a1', action: 'email.send', status: 'success', created_at: now.toISOString() },
      { id: 'a2', action: 'email.archive', status: 'success', created_at: now.toISOString() },
    ]);

    // No LLM provided
    const analyzer = new IntentDriftAnalyzer({
      db: db as unknown as DatabaseHandle,
      intentManager,
    });

    const result = await analyzer.analyzeBehaviorPatterns();
    expect(result).toEqual([]);
  });

  // ── Test 4: Generates observations when actions and intent exist ─────────

  it('generates observations when actions and intent exist', async () => {
    intentManager.setPrimaryGoal('Spend more time with family');
    await intentManager.addPersonalValue('Family is my top priority', 'onboarding');

    const now = new Date();
    seedActions(db, [
      { id: 'a1', action: 'email.send', status: 'success', created_at: now.toISOString() },
      { id: 'a2', action: 'email.send', status: 'success', created_at: now.toISOString() },
      { id: 'a3', action: 'email.archive', status: 'success', created_at: now.toISOString() },
      { id: 'a4', action: 'calendar.create', status: 'success', created_at: now.toISOString() },
    ]);

    const llm = createMockLLM();
    const analyzer = new IntentDriftAnalyzer({
      db: db as unknown as DatabaseHandle,
      intentManager,
      llm,
      model: 'llama3.2:8b',
    });

    const result = await analyzer.analyzeBehaviorPatterns();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.type).toBe('drift');
    expect(result[0]!.description).toContain('family');
    expect(result[0]!.evidence).toEqual(expect.arrayContaining([expect.stringContaining('This week')]));
    expect(result[0]!.surfacedMorningBrief).toBe(false);
    expect(result[0]!.surfacedInChat).toBe(false);
    expect(result[0]!.dismissed).toBe(false);
    expect(llm.generate).toHaveBeenCalledTimes(1);
  });

  // ── Test 5: Limits to max 2 observations ─────────────────────────────────

  it('limits to max 2 observations', async () => {
    intentManager.setPrimaryGoal('Balance work and life');
    await intentManager.addPersonalValue('Health matters', 'onboarding');

    const now = new Date();
    seedActions(db, [
      { id: 'a1', action: 'email.send', status: 'success', created_at: now.toISOString() },
      { id: 'a2', action: 'calendar.create', status: 'success', created_at: now.toISOString() },
    ]);

    // LLM returns 4 observations — only 2 should survive
    const llm = createMockLLM(JSON.stringify([
      { type: 'drift', description: 'Observation one about drift.' },
      { type: 'alignment', description: 'Observation two about alignment.' },
      { type: 'conflict', description: 'Observation three about conflict.' },
      { type: 'drift', description: 'Observation four about drift.' },
    ]));

    const analyzer = new IntentDriftAnalyzer({
      db: db as unknown as DatabaseHandle,
      intentManager,
      llm,
      model: 'llama3.2:8b',
    });

    const result = await analyzer.analyzeBehaviorPatterns();
    expect(result.length).toBe(2);
    expect(result[0]!.description).toBe('Observation one about drift.');
    expect(result[1]!.description).toBe('Observation two about alignment.');
  });

  // ── Test 6: Only queries non-pending_approval actions ────────────────────

  it('only queries non-pending_approval actions', async () => {
    intentManager.setPrimaryGoal('Stay organized');
    await intentManager.addPersonalValue('Productivity matters', 'onboarding');

    const now = new Date();
    // Seed mix of statuses: only success/error should count
    seedActions(db, [
      { id: 'a1', action: 'email.send', status: 'pending_approval', created_at: now.toISOString() },
      { id: 'a2', action: 'email.send', status: 'pending_approval', created_at: now.toISOString() },
      { id: 'a3', action: 'email.send', status: 'pending_approval', created_at: now.toISOString() },
    ]);

    // All actions are pending_approval — should be excluded by the WHERE clause
    const llm = createMockLLM();
    const analyzer = new IntentDriftAnalyzer({
      db: db as unknown as DatabaseHandle,
      intentManager,
      llm,
      model: 'llama3.2:8b',
    });

    const result = await analyzer.analyzeBehaviorPatterns();
    // No non-pending actions → frequencies empty → early return
    expect(result).toEqual([]);
    expect(llm.generate).not.toHaveBeenCalled();
  });
});

// ─── Structural Tests ──────────────────────────────────────────────────────

describe('IntentDriftAnalyzer — DATA BOUNDARY structural', () => {
  // Test 7: SQL query does NOT contain payload/content columns
  it('SQL query does NOT contain payload or content columns', () => {
    const sourcePath = path.resolve(
      __dirname,
      '../../packages/core/agent/intent-drift-analyzer.ts',
    );
    const source = fs.readFileSync(sourcePath, 'utf-8');

    // The SQL in getActionFrequencies selects only action, COUNT(*), DATE(created_at)
    // It must NOT reference payload, content, body, subject, or message columns
    const forbiddenColumns = ['payload', 'content', 'body', 'subject', 'message_text', 'email_body'];
    for (const col of forbiddenColumns) {
      // Match the column name in SQL context (after SELECT, in WHERE, in JOIN, etc.)
      // but NOT in comments or string literals describing the rule
      const sqlBlocks = source.match(/this\.db\.prepare\(`[\s\S]*?`\)/g) ?? [];
      for (const block of sqlBlocks) {
        // Check that the SQL query itself does not reference forbidden columns
        // Allow the word in comments (lines starting with //) but not in SQL
        const sqlOnly = block.replace(/\/\/.*$/gm, '');
        expect(sqlOnly.toLowerCase()).not.toContain(col.toLowerCase());
      }
    }
  });
});

describe('MorningBrief — intent_alignment structural', () => {
  const sourcePath = path.resolve(
    __dirname,
    '../../packages/core/agent/morning-brief.ts',
  );
  let source: string;

  beforeEach(() => {
    source = fs.readFileSync(sourcePath, 'utf-8');
  });

  // Test 8: BriefSection type union includes intent_alignment
  it('BriefSection type includes intent_alignment in its type union', () => {
    // The type field on BriefSection should include 'intent_alignment'
    expect(source).toContain("'intent_alignment'");
    // Specifically verify it appears in the BriefSection interface type union
    const briefSectionMatch = source.match(/type:\s*['"](meetings|follow_ups|reminders|weather|financial|insights|intent_alignment)['"]/g);
    expect(briefSectionMatch).not.toBeNull();
    const types = briefSectionMatch!.map(m => m.match(/['"]([^'"]+)['"]/)?.[1]);
    expect(types).toContain('intent_alignment');
  });

  // Test 9: SECTION_PRIORITIES includes intent_alignment
  it('SECTION_PRIORITIES includes intent_alignment', () => {
    // SECTION_PRIORITIES should have an intent_alignment key
    expect(source).toMatch(/SECTION_PRIORITIES[\s\S]*intent_alignment:\s*\d+/);
  });

  // Test 10: MorningBriefDeps includes intentManager field
  it('MorningBriefDeps includes intentManager field', () => {
    // The MorningBriefDeps interface should declare intentManager
    expect(source).toMatch(/interface\s+MorningBriefDeps[\s\S]*intentManager\??\s*:\s*IntentManager/);
  });
});
