import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildTodaySnapshot } from '../../../packages/core/agent/today/index.js';
import type { DatabaseHandle } from '../../../packages/core/platform/types.js';
import { createInMemoryActionLifecycleStore } from '@semblance/kernel';
import { AuditTrail } from '../../../packages/gateway/audit/trail.js';

function wrapDatabase(dbPath: string): DatabaseHandle {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  return {
    pragma: (s: string) => db.pragma(s),
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      return {
        get: (...params: unknown[]) => stmt.get(...params),
        all: (...params: unknown[]) => stmt.all(...params),
        run: (...params: unknown[]) => stmt.run(...params),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transaction: <T extends (...args: any[]) => any>(fn: T): T => {
      return db.transaction(fn as Parameters<typeof db.transaction>[0]) as unknown as T;
    },
    exec: (sql: string) => db.exec(sql),
    close: () => db.close(),
  };
}

function createDocumentsSchema(db: DatabaseHandle): void {
  db.exec(`
    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_path TEXT,
      title TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      metadata TEXT
    );
  `);
}

function createPendingActionsSchema(db: DatabaseHandle): void {
  db.exec(`
    CREATE TABLE pending_actions (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      reasoning TEXT,
      domain TEXT,
      tier TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      executed_at TEXT,
      response_json TEXT
    );
  `);
}

describe('buildTodaySnapshot — empty vault honesty', () => {
  let tempDir: string;
  let documentsDb: DatabaseHandle;
  let prefsDb: DatabaseHandle;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'today-snapshot-'));
    documentsDb = wrapDatabase(join(tempDir, 'documents.db'));
    prefsDb = wrapDatabase(join(tempDir, 'prefs.db'));
    createDocumentsSchema(documentsDb);
    createPendingActionsSchema(prefsDb);
  });

  afterEach(() => {
    documentsDb.close();
    prefsDb.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns isEmpty true and no fabricated rows when vault is empty', () => {
    const snapshot = buildTodaySnapshot({
      prefsDb,
      documentsDb,
      actionLifecycleStore: null,
      auditTrail: null,
      proactiveEngine: null,
      intentManager: null,
      representativeWorkflowStore: null,
      now: () => new Date('2026-07-19T12:00:00.000Z'),
    });

    expect(snapshot.isEmpty).toBe(true);
    expect(snapshot.changes).toEqual([]);
    expect(snapshot.risks).toEqual([]);
    expect(snapshot.completedActions).toEqual([]);
    expect(snapshot.pendingDecisions).toEqual([]);
    expect(snapshot.outcomes).toEqual([]);
    expect(snapshot.agencyVerticals).toEqual([]);
    expect(snapshot.inbox.triage).toEqual([]);
    expect(snapshot.inbox.pendingReplies).toEqual([]);
    expect(snapshot.inbox.representativeActions).toEqual([]);
    expect(snapshot.provenance.totalDocuments).toBe(0);
    expect(snapshot.provenance.connectedSources).toEqual([]);
    expect(snapshot.provenance.lastIndexedAt).toBeNull();
  });

  it('surfaces real document changes without inventing extras', () => {
    documentsDb.prepare(
      `INSERT INTO documents (id, source, source_path, title, content_hash, mime_type, created_at, updated_at, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'doc-1',
      'files',
      '/Users/me/report.pdf',
      'Q2 Report',
      'hash-1',
      'application/pdf',
      '2026-07-18T10:00:00.000Z',
      '2026-07-19T08:00:00.000Z',
      '2026-07-19T08:00:00.000Z',
    );

    const snapshot = buildTodaySnapshot({
      prefsDb,
      documentsDb,
      actionLifecycleStore: null,
      auditTrail: null,
      proactiveEngine: null,
      intentManager: null,
      representativeWorkflowStore: null,
      now: () => new Date('2026-07-19T12:00:00.000Z'),
    });

    expect(snapshot.isEmpty).toBe(false);
    expect(snapshot.changes).toHaveLength(1);
    expect(snapshot.changes[0]?.title).toBe('Q2 Report');
    expect(snapshot.provenance.totalDocuments).toBe(1);
    expect(snapshot.provenance.connectedSources).toEqual(['files']);
  });

  it('includes pending approvals as risks and decisions from real rows only', () => {
    prefsDb.prepare(
      `INSERT INTO pending_actions (id, action, payload, reasoning, domain, tier, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'pa-1',
      'email.send',
      '{}',
      'Reply to investor thread',
      'email',
      'guardian',
      'pending_approval',
      '2026-07-19T09:00:00.000Z',
    );

    const snapshot = buildTodaySnapshot({
      prefsDb,
      documentsDb,
      actionLifecycleStore: null,
      auditTrail: null,
      proactiveEngine: null,
      intentManager: null,
      representativeWorkflowStore: null,
      now: () => new Date('2026-07-19T12:00:00.000Z'),
    });

    expect(snapshot.risks).toHaveLength(1);
    expect(snapshot.risks[0]?.title).toBe('email.send');
    expect(snapshot.pendingDecisions).toHaveLength(1);
    expect(snapshot.pendingDecisions[0]?.kind).toBe('approval');
  });

  it('includes completed audit outcomes with measured time saved', () => {
    const auditDb = new Database(':memory:');
    const auditTrail = new AuditTrail(auditDb);
    const nowIso = '2026-07-19T10:00:00.000Z';
    auditTrail.append({
      requestId: 'req-2',
      timestamp: nowIso,
      action: 'calendar.fetch',
      direction: 'response',
      status: 'success',
      payloadHash: 'def',
      signature: 'sig2-response',
      estimatedTimeSavedSeconds: 120,
    });

    const snapshot = buildTodaySnapshot({
      prefsDb,
      documentsDb,
      actionLifecycleStore: createInMemoryActionLifecycleStore(),
      auditTrail,
      proactiveEngine: null,
      intentManager: null,
      representativeWorkflowStore: null,
      now: () => new Date('2026-07-19T12:00:00.000Z'),
    });

    expect(snapshot.outcomes.some(o => o.timeSavedSeconds === 120)).toBe(true);
    expect(snapshot.provenance.auditChainValid).toBe(true);
  });
});

describe('morning-brief module re-export shim', () => {
  it('keeps MorningBriefGenerator import stable via morning-brief.js', async () => {
    const mod = await import('../../../packages/core/agent/morning-brief.js');
    expect(mod.MorningBriefGenerator).toBeDefined();
    expect(mod.BriefSection).toBeUndefined();
    expect(typeof mod.MorningBriefGenerator).toBe('function');
  });
});
