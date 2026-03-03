// Reasoning Context in Audit Trail Tests
// Verifies that knowledge chunks informing orchestrator decisions are
// captured, attached to actions, and stored in the audit trail.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type {
  ReasoningContext,
  ReasoningChunkRef,
  AgentAction,
  DatabaseHandle,
} from '@semblance/core';

// ─── Helpers ───────────────────────────────────────────────────────────────

interface MockSearchResult {
  chunk: { id: string; documentId: string; content: string; chunkIndex: number; metadata: Record<string, unknown> };
  document: { id: string; source: string; sourcePath?: string; title: string; content: string; contentHash: string; mimeType: string; createdAt: string; updatedAt: string; indexedAt: string; metadata: Record<string, unknown> };
  score: number;
  highlights?: string[];
}

function makeSearchResult(overrides?: Partial<{ chunkId: string; docId: string; title: string; source: string; score: number }>): MockSearchResult {
  const chunkId = overrides?.chunkId ?? 'chunk_001';
  const docId = overrides?.docId ?? 'doc_001';
  return {
    chunk: { id: chunkId, documentId: docId, content: 'Test content', chunkIndex: 0, metadata: {} },
    document: {
      id: docId,
      source: overrides?.source ?? 'email',
      title: overrides?.title ?? 'Test Email',
      content: 'Full document content',
      contentHash: 'abc123',
      mimeType: 'text/plain',
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-01-15T00:00:00Z',
      indexedAt: '2026-01-15T00:00:00Z',
      metadata: {},
    },
    score: overrides?.score ?? 0.85,
  };
}

/**
 * Replicate the buildReasoningContext logic from the orchestrator
 * for direct unit testing without needing the full orchestrator.
 */
function buildReasoningContext(query: string, context: MockSearchResult[]): ReasoningContext {
  const chunks: ReasoningChunkRef[] = context.map(sr => ({
    chunkId: sr.chunk.id,
    documentId: sr.document.id,
    title: sr.document.title,
    source: sr.document.source,
    score: sr.score,
  }));
  return {
    query,
    chunks,
    retrievedAt: new Date().toISOString(),
  };
}

const CREATE_PENDING_ACTIONS = `
  CREATE TABLE IF NOT EXISTS pending_actions (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    payload TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    domain TEXT NOT NULL,
    tier TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_approval',
    created_at TEXT NOT NULL,
    executed_at TEXT,
    response_json TEXT,
    reasoning_context TEXT
  );
`;

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Reasoning Context in Audit Trail', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(CREATE_PENDING_ACTIONS);
  });

  afterEach(() => {
    db.close();
  });

  // ─── ReasoningChunkRef ───

  describe('ReasoningChunkRef', () => {
    it('captures chunk ID, document ID, title, source, and score', () => {
      const ref: ReasoningChunkRef = {
        chunkId: 'chunk_001',
        documentId: 'doc_001',
        title: 'Meeting Notes',
        source: 'local_file',
        score: 0.92,
      };
      expect(ref.chunkId).toBe('chunk_001');
      expect(ref.documentId).toBe('doc_001');
      expect(ref.title).toBe('Meeting Notes');
      expect(ref.source).toBe('local_file');
      expect(ref.score).toBe(0.92);
    });
  });

  // ─── ReasoningContext ───

  describe('ReasoningContext', () => {
    it('includes query, chunks array, and retrievedAt timestamp', () => {
      const ctx: ReasoningContext = {
        query: 'What meetings do I have tomorrow?',
        chunks: [{
          chunkId: 'chunk_001',
          documentId: 'doc_001',
          title: 'Calendar Event',
          source: 'calendar',
          score: 0.88,
        }],
        retrievedAt: '2026-01-15T10:00:00.000Z',
      };
      expect(ctx.query).toBe('What meetings do I have tomorrow?');
      expect(ctx.chunks).toHaveLength(1);
      expect(ctx.retrievedAt).toBeTruthy();
    });

    it('supports empty chunks array (no knowledge retrieved)', () => {
      const ctx: ReasoningContext = {
        query: 'Hello',
        chunks: [],
        retrievedAt: new Date().toISOString(),
      };
      expect(ctx.chunks).toHaveLength(0);
    });
  });

  // ─── buildReasoningContext ───

  describe('buildReasoningContext', () => {
    it('builds context from search results', () => {
      const results = [
        makeSearchResult({ chunkId: 'c1', docId: 'd1', title: 'Email from Alice', source: 'email', score: 0.95 }),
        makeSearchResult({ chunkId: 'c2', docId: 'd2', title: 'Budget Report', source: 'local_file', score: 0.82 }),
      ];

      const ctx = buildReasoningContext('Send Alice the budget report', results);
      expect(ctx.query).toBe('Send Alice the budget report');
      expect(ctx.chunks).toHaveLength(2);
      expect(ctx.chunks[0]!.chunkId).toBe('c1');
      expect(ctx.chunks[0]!.title).toBe('Email from Alice');
      expect(ctx.chunks[0]!.source).toBe('email');
      expect(ctx.chunks[0]!.score).toBe(0.95);
      expect(ctx.chunks[1]!.chunkId).toBe('c2');
      expect(ctx.chunks[1]!.title).toBe('Budget Report');
      expect(ctx.retrievedAt).toBeTruthy();
    });

    it('preserves score ordering from search results', () => {
      const results = [
        makeSearchResult({ chunkId: 'c1', score: 0.95 }),
        makeSearchResult({ chunkId: 'c2', score: 0.80 }),
        makeSearchResult({ chunkId: 'c3', score: 0.70 }),
      ];

      const ctx = buildReasoningContext('test query', results);
      expect(ctx.chunks[0]!.score).toBeGreaterThan(ctx.chunks[1]!.score);
      expect(ctx.chunks[1]!.score).toBeGreaterThan(ctx.chunks[2]!.score);
    });

    it('returns valid ISO timestamp in retrievedAt', () => {
      const ctx = buildReasoningContext('test', [makeSearchResult()]);
      const date = new Date(ctx.retrievedAt);
      expect(date.toISOString()).toBe(ctx.retrievedAt);
    });
  });

  // ─── AgentAction integration ───

  describe('AgentAction with ReasoningContext', () => {
    it('AgentAction includes optional reasoningContext field', () => {
      const action: AgentAction = {
        id: 'act_001',
        action: 'email.send',
        payload: { to: ['alice@example.com'], subject: 'Hi', body: 'Hello' },
        reasoning: 'User requested email',
        domain: 'email',
        tier: 'partner',
        status: 'executed',
        createdAt: new Date().toISOString(),
        reasoningContext: {
          query: 'Send an email to Alice',
          chunks: [{
            chunkId: 'c1',
            documentId: 'd1',
            title: 'Previous Alice thread',
            source: 'email',
            score: 0.91,
          }],
          retrievedAt: new Date().toISOString(),
        },
      };
      expect(action.reasoningContext).toBeDefined();
      expect(action.reasoningContext!.chunks).toHaveLength(1);
    });

    it('AgentAction works without reasoningContext (backwards compatible)', () => {
      const action: AgentAction = {
        id: 'act_002',
        action: 'calendar.fetch',
        payload: {},
        reasoning: 'Fetching calendar events',
        domain: 'calendar',
        tier: 'partner',
        status: 'executed',
        createdAt: new Date().toISOString(),
      };
      expect(action.reasoningContext).toBeUndefined();
    });
  });

  // ─── Database storage ───

  describe('pending_actions storage', () => {
    it('stores reasoning_context as JSON in pending_actions', () => {
      const ctx: ReasoningContext = {
        query: 'Schedule a meeting with Bob',
        chunks: [{
          chunkId: 'c1',
          documentId: 'd1',
          title: 'Bob contact',
          source: 'contacts',
          score: 0.88,
        }],
        retrievedAt: '2026-01-15T10:00:00.000Z',
      };

      db.prepare(`
        INSERT INTO pending_actions (id, action, payload, reasoning, domain, tier, status, created_at, reasoning_context)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('act_001', 'calendar.create', '{}', 'Schedule meeting', 'calendar', 'partner', 'pending_approval',
             '2026-01-15T10:00:00Z', JSON.stringify(ctx));

      const row = db.prepare('SELECT reasoning_context FROM pending_actions WHERE id = ?').get('act_001') as { reasoning_context: string };
      const parsed = JSON.parse(row.reasoning_context) as ReasoningContext;
      expect(parsed.query).toBe('Schedule a meeting with Bob');
      expect(parsed.chunks).toHaveLength(1);
      expect(parsed.chunks[0]!.chunkId).toBe('c1');
    });

    it('allows null reasoning_context for actions without knowledge', () => {
      db.prepare(`
        INSERT INTO pending_actions (id, action, payload, reasoning, domain, tier, status, created_at, reasoning_context)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('act_002', 'email.fetch', '{}', 'Fetch emails', 'email', 'partner', 'pending_approval',
             '2026-01-15T10:00:00Z', null);

      const row = db.prepare('SELECT reasoning_context FROM pending_actions WHERE id = ?').get('act_002') as { reasoning_context: string | null };
      expect(row.reasoning_context).toBeNull();
    });

    it('reasoning_context round-trips through JSON correctly', () => {
      const original: ReasoningContext = {
        query: 'What did Alice say about the project?',
        chunks: [
          { chunkId: 'c1', documentId: 'd1', title: 'Alice email thread', source: 'email', score: 0.95 },
          { chunkId: 'c2', documentId: 'd2', title: 'Project doc', source: 'local_file', score: 0.88 },
          { chunkId: 'c3', documentId: 'd3', title: 'Meeting notes', source: 'calendar', score: 0.75 },
        ],
        retrievedAt: '2026-01-15T10:30:00.000Z',
      };

      const json = JSON.stringify(original);
      const restored = JSON.parse(json) as ReasoningContext;

      expect(restored.query).toBe(original.query);
      expect(restored.chunks).toHaveLength(3);
      expect(restored.retrievedAt).toBe(original.retrievedAt);
      for (let i = 0; i < original.chunks.length; i++) {
        expect(restored.chunks[i]!.chunkId).toBe(original.chunks[i]!.chunkId);
        expect(restored.chunks[i]!.score).toBe(original.chunks[i]!.score);
      }
    });

    it('multiple chunks from different sources are preserved', () => {
      const ctx: ReasoningContext = {
        query: 'Prepare weekly summary',
        chunks: [
          { chunkId: 'email_1', documentId: 'e1', title: 'Weekly recap email', source: 'email', score: 0.9 },
          { chunkId: 'cal_1', documentId: 'c1', title: 'Team standup', source: 'calendar', score: 0.85 },
          { chunkId: 'file_1', documentId: 'f1', title: 'Sprint notes.md', source: 'local_file', score: 0.78 },
          { chunkId: 'msg_1', documentId: 'm1', title: 'Slack thread', source: 'messaging', score: 0.65 },
        ],
        retrievedAt: new Date().toISOString(),
      };

      db.prepare(`
        INSERT INTO pending_actions (id, action, payload, reasoning, domain, tier, status, created_at, reasoning_context)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('act_003', 'email.draft', '{}', 'Draft weekly summary', 'email', 'partner', 'pending_approval',
             new Date().toISOString(), JSON.stringify(ctx));

      const row = db.prepare('SELECT reasoning_context FROM pending_actions WHERE id = ?').get('act_003') as { reasoning_context: string };
      const parsed = JSON.parse(row.reasoning_context) as ReasoningContext;
      expect(parsed.chunks).toHaveLength(4);
      const sources = parsed.chunks.map(c => c.source);
      expect(sources).toContain('email');
      expect(sources).toContain('calendar');
      expect(sources).toContain('local_file');
      expect(sources).toContain('messaging');
    });
  });

  // ─── Edge cases ───

  describe('edge cases', () => {
    it('handles very long queries without truncation', () => {
      const longQuery = 'a'.repeat(5000);
      const ctx = buildReasoningContext(longQuery, [makeSearchResult()]);
      expect(ctx.query).toBe(longQuery);
      expect(ctx.query.length).toBe(5000);
    });

    it('handles chunks with zero score', () => {
      const result = makeSearchResult({ chunkId: 'c_zero', score: 0.0 });
      const ctx = buildReasoningContext('test', [result]);
      expect(ctx.chunks[0]!.score).toBe(0.0);
    });
  });

  // ─── Audit trail metadata ───

  describe('audit trail metadata integration', () => {
    it('reasoning context fits in audit metadata Record<string, unknown>', () => {
      const ctx: ReasoningContext = {
        query: 'Test query',
        chunks: [{ chunkId: 'c1', documentId: 'd1', title: 'Doc', source: 'email', score: 0.9 }],
        retrievedAt: new Date().toISOString(),
      };

      // Audit trail metadata accepts Record<string, unknown>
      const metadata: Record<string, unknown> = {
        reasoningContext: ctx,
      };

      expect(metadata['reasoningContext']).toBeDefined();
      const json = JSON.stringify(metadata);
      const restored = JSON.parse(json) as Record<string, unknown>;
      const restoredCtx = restored['reasoningContext'] as ReasoningContext;
      expect(restoredCtx.query).toBe('Test query');
      expect(restoredCtx.chunks).toHaveLength(1);
    });

    it('schema migration adds reasoning_context column', () => {
      // Create a table WITHOUT reasoning_context to simulate migration
      const migrateDb = new Database(':memory:');
      migrateDb.exec(`
        CREATE TABLE IF NOT EXISTS pending_actions (
          id TEXT PRIMARY KEY,
          action TEXT NOT NULL,
          payload TEXT NOT NULL,
          reasoning TEXT NOT NULL,
          domain TEXT NOT NULL,
          tier TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending_approval',
          created_at TEXT NOT NULL,
          executed_at TEXT,
          response_json TEXT
        );
      `);

      // Run migration (same pattern as orchestrator constructor)
      try {
        migrateDb.exec('ALTER TABLE pending_actions ADD COLUMN reasoning_context TEXT');
      } catch {
        // Column already exists
      }

      // Verify column exists and accepts data
      migrateDb.prepare(`
        INSERT INTO pending_actions (id, action, payload, reasoning, domain, tier, status, created_at, reasoning_context)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('test_id', 'email.send', '{}', 'test', 'email', 'partner', 'pending_approval', new Date().toISOString(),
             JSON.stringify({ query: 'test', chunks: [], retrievedAt: new Date().toISOString() }));

      const row = migrateDb.prepare('SELECT reasoning_context FROM pending_actions WHERE id = ?').get('test_id') as { reasoning_context: string };
      expect(row.reasoning_context).toBeTruthy();
      migrateDb.close();
    });
  });
});
