// Tests for WeeklyDigestGenerator — audit trail aggregation, narrative, highlights.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { WeeklyDigestGenerator } from '@semblance/core/digest/weekly-digest.js';
import type { LLMProvider } from '@semblance/core/llm/types.js';

function createMockLLM(): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn(),
    chat: vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: 'This week Semblance was busy. It archived 10 emails and resolved 2 calendar conflicts.' },
      model: 'llama3.2:8b',
      tokensUsed: { prompt: 100, completion: 50, total: 150 },
      durationMs: 1000,
    }),
    embed: vi.fn().mockResolvedValue([[0.1, 0.2]]),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn(),
  };
}

function seedAuditTrail(db: Database.Database, weekStart: string, weekEnd: string, count = 10): void {
  // Create audit_trail table (matches Gateway schema)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_trail (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      action TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'response',
      payload_hash TEXT NOT NULL DEFAULT '',
      signature TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'success',
      metadata TEXT DEFAULT '',
      estimated_time_saved_seconds INTEGER DEFAULT 30,
      chain_hash TEXT DEFAULT ''
    );
  `);

  const actions = ['email.archive', 'email.draft', 'email.send', 'calendar.create', 'calendar.update'];
  const start = new Date(weekStart).getTime();
  const end = new Date(weekEnd).getTime();

  for (let i = 0; i < count; i++) {
    const timestamp = new Date(start + Math.random() * (end - start)).toISOString();
    const action = actions[i % actions.length]!;
    db.prepare(`
      INSERT INTO audit_trail (id, request_id, timestamp, action, direction, status, metadata, estimated_time_saved_seconds)
      VALUES (?, ?, ?, ?, 'response', 'success', ?, ?)
    `).run(`entry-${i}`, `req-${i}`, timestamp, action, JSON.stringify({ autoExecuted: true }), 30 + i * 5);
  }
}

describe('WeeklyDigestGenerator', () => {
  let db: Database.Database;
  let llm: LLMProvider;
  let generator: WeeklyDigestGenerator;
  const weekStart = '2025-01-06';
  const weekEnd = '2025-01-12';

  beforeEach(() => {
    db = new Database(':memory:');
    llm = createMockLLM();
    seedAuditTrail(db, weekStart, weekEnd, 15);
    generator = new WeeklyDigestGenerator({
      db,
      auditDb: db,
      llm,
      aiName: 'Semblance',
    });
  });

  describe('schema', () => {
    it('creates weekly_digests table', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='weekly_digests'"
      ).all();
      expect(tables).toHaveLength(1);
    });
  });

  describe('generate', () => {
    it('generates a digest with correct week range', async () => {
      const digest = await generator.generate(weekStart, weekEnd);
      expect(digest).toBeDefined();
      expect(digest.weekStart).toBe(weekStart);
      expect(digest.weekEnd).toBe(weekEnd);
    });

    it('includes correct total action count', async () => {
      const digest = await generator.generate(weekStart, weekEnd);
      expect(digest.totalActions).toBe(15);
    });

    it('includes time-saved totals', async () => {
      const digest = await generator.generate(weekStart, weekEnd);
      expect(digest.totalTimeSavedSeconds).toBeGreaterThan(0);
      expect(digest.timeSavedFormatted).toBeTruthy();
    });

    it('includes action breakdown by type', async () => {
      const digest = await generator.generate(weekStart, weekEnd);
      expect(digest.actionsByType).toBeDefined();
      expect(Object.keys(digest.actionsByType).length).toBeGreaterThan(0);
    });

    it('includes email statistics', async () => {
      const digest = await generator.generate(weekStart, weekEnd);
      expect(digest.emailsProcessed).toBeDefined();
      expect(typeof digest.emailsArchived).toBe('number');
      expect(typeof digest.emailsDrafted).toBe('number');
      expect(typeof digest.emailsSent).toBe('number');
    });

    it('includes autonomy accuracy', async () => {
      const digest = await generator.generate(weekStart, weekEnd);
      expect(digest.autonomyAccuracy).toBeGreaterThanOrEqual(0);
      expect(digest.autonomyAccuracy).toBeLessThanOrEqual(1);
    });

    it('generates highlights', async () => {
      const digest = await generator.generate(weekStart, weekEnd);
      expect(digest.highlights).toBeDefined();
      expect(Array.isArray(digest.highlights)).toBe(true);
    });

    it('generates narrative text', async () => {
      const digest = await generator.generate(weekStart, weekEnd);
      expect(digest.narrative).toBeTruthy();
      expect(digest.narrative.length).toBeGreaterThan(10);
    });
  });

  describe('empty week', () => {
    it('produces valid digest for a week with no actions', async () => {
      const emptyDb = new Database(':memory:');
      emptyDb.exec(`
        CREATE TABLE IF NOT EXISTS audit_trail (
          id TEXT PRIMARY KEY, request_id TEXT, timestamp TEXT, action TEXT,
          direction TEXT DEFAULT 'response', payload_hash TEXT DEFAULT '',
          signature TEXT DEFAULT '', status TEXT, metadata TEXT DEFAULT '',
          estimated_time_saved_seconds INTEGER DEFAULT 0, chain_hash TEXT DEFAULT ''
        );
      `);
      const emptyGen = new WeeklyDigestGenerator({
        db: emptyDb,
        auditDb: emptyDb,
        llm,
        aiName: 'Semblance',
      });
      const digest = await emptyGen.generate('2025-02-01', '2025-02-07');
      expect(digest).toBeDefined();
      expect(digest.totalActions).toBe(0);
      expect(digest.totalTimeSavedSeconds).toBe(0);
      expect(digest.narrative).toBeTruthy(); // Should still have a message
    });
  });

  describe('storage and retrieval', () => {
    it('stores generated digest', async () => {
      await generator.generate(weekStart, weekEnd);
      const latest = generator.getLatest();
      expect(latest).not.toBeNull();
      expect(latest?.weekStart).toBe(weekStart);
    });

    it('lists all digests', async () => {
      await generator.generate(weekStart, weekEnd);
      await generator.generate('2025-01-13', '2025-01-19');
      const list = generator.list();
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('returns latest digest correctly', async () => {
      await generator.generate(weekStart, weekEnd);
      // Small delay to ensure different generated_at timestamps
      await new Promise(r => setTimeout(r, 10));
      await generator.generate('2025-01-13', '2025-01-19');
      const latest = generator.getLatest();
      // Latest should be the second one generated
      expect(latest).not.toBeNull();
      // The second generate creates a newer generated_at
      expect(latest?.weekEnd).toBe('2025-01-19');
    });
  });

  describe('LLM narrative', () => {
    it('calls LLM for narrative generation', async () => {
      await generator.generate(weekStart, weekEnd);
      expect(llm.chat).toHaveBeenCalled();
    });

    it('uses template fallback when LLM fails', async () => {
      vi.mocked(llm.chat).mockRejectedValue(new Error('LLM unavailable'));
      const digest = await generator.generate(weekStart, weekEnd);
      expect(digest.narrative).toBeTruthy();
      // Should contain template-based narrative
      expect(digest.narrative.length).toBeGreaterThan(10);
    });
  });
});
