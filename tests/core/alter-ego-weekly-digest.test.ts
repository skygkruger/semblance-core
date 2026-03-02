import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { WeeklyDigestGenerator } from '@semblance/core/digest/weekly-digest.js';
import { AlterEgoStore } from '@semblance/core/agent/alter-ego-store.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';

describe('Weekly Digest — Alter Ego integration', () => {
  let db: Database.Database;
  let auditDb: Database.Database;
  let alterEgoStore: AlterEgoStore;

  beforeEach(() => {
    db = new Database(':memory:');
    auditDb = new Database(':memory:');

    // Create audit_trail table for the digest generator
    auditDb.exec(`
      CREATE TABLE IF NOT EXISTS audit_trail (
        id TEXT PRIMARY KEY,
        request_id TEXT,
        timestamp TEXT,
        action TEXT,
        direction TEXT,
        status TEXT,
        payload_hash TEXT,
        signature TEXT,
        chain_hash TEXT,
        metadata TEXT,
        estimated_time_saved_seconds INTEGER DEFAULT 0
      )
    `);

    alterEgoStore = new AlterEgoStore(db as unknown as DatabaseHandle);
  });

  afterEach(() => {
    db.close();
    auditDb.close();
  });

  it('digest includes alter ego executed/undone/batched counts', async () => {
    // Seed alter ego receipts
    const weekStart = '2026-02-23';
    const weekEnd = '2026-03-01';

    alterEgoStore.logReceipt({
      id: 'ae_1',
      actionType: 'email.send',
      summary: 'Sent email',
      reasoning: 'test',
      status: 'executed',
      undoAvailable: false,
      undoExpiresAt: null,
      weekGroup: '2026-W09',
      createdAt: '2026-02-24T10:00:00Z',
      executedAt: '2026-02-24T10:00:00Z',
    });
    alterEgoStore.logReceipt({
      id: 'ae_2',
      actionType: 'calendar.create',
      summary: 'Created event',
      reasoning: 'test',
      status: 'executed',
      undoAvailable: false,
      undoExpiresAt: null,
      weekGroup: '2026-W09',
      createdAt: '2026-02-25T10:00:00Z',
      executedAt: '2026-02-25T10:00:00Z',
    });
    alterEgoStore.logReceipt({
      id: 'ae_3',
      actionType: 'email.draft',
      summary: 'Drafted email',
      reasoning: 'test',
      status: 'undone',
      undoAvailable: false,
      undoExpiresAt: null,
      weekGroup: '2026-W09',
      createdAt: '2026-02-26T10:00:00Z',
      executedAt: '2026-02-26T10:00:00Z',
    });

    const gen = new WeeklyDigestGenerator({
      db: db as unknown as DatabaseHandle,
      auditDb: auditDb as unknown as DatabaseHandle,
      alterEgoStore,
    });

    const digest = await gen.generate(weekStart, weekEnd);
    expect(digest.alterEgoActionsExecuted).toBe(2);
    expect(digest.alterEgoActionsUndone).toBe(1);
    expect(digest.alterEgoActionsBatched).toBe(0);
  });

  it('shows zero alter ego stats when no activity', async () => {
    const gen = new WeeklyDigestGenerator({
      db: db as unknown as DatabaseHandle,
      auditDb: auditDb as unknown as DatabaseHandle,
      alterEgoStore,
    });

    const digest = await gen.generate('2026-02-23', '2026-03-01');
    expect(digest.alterEgoActionsExecuted).toBe(0);
    expect(digest.alterEgoActionsUndone).toBe(0);
    expect(digest.alterEgoActionsBatched).toBe(0);
  });

  it('shows zero alter ego stats when no alterEgoStore provided', async () => {
    const gen = new WeeklyDigestGenerator({
      db: db as unknown as DatabaseHandle,
      auditDb: auditDb as unknown as DatabaseHandle,
      // No alterEgoStore
    });

    const digest = await gen.generate('2026-02-23', '2026-03-01');
    expect(digest.alterEgoActionsExecuted).toBe(0);
    expect(digest.alterEgoActionsUndone).toBe(0);
    expect(digest.alterEgoActionsBatched).toBe(0);
  });

  it('uses correct date range for week grouping', async () => {
    // Receipt inside the range
    alterEgoStore.logReceipt({
      id: 'in_range',
      actionType: 'email.send',
      summary: 'Inside range',
      reasoning: 'test',
      status: 'executed',
      undoAvailable: false,
      undoExpiresAt: null,
      weekGroup: '2026-W09',
      createdAt: '2026-02-25T10:00:00Z',
      executedAt: '2026-02-25T10:00:00Z',
    });
    // Receipt outside the range
    alterEgoStore.logReceipt({
      id: 'out_range',
      actionType: 'email.send',
      summary: 'Outside range',
      reasoning: 'test',
      status: 'executed',
      undoAvailable: false,
      undoExpiresAt: null,
      weekGroup: '2026-W10',
      createdAt: '2026-03-05T10:00:00Z',
      executedAt: '2026-03-05T10:00:00Z',
    });

    const gen = new WeeklyDigestGenerator({
      db: db as unknown as DatabaseHandle,
      auditDb: auditDb as unknown as DatabaseHandle,
      alterEgoStore,
    });

    const digest = await gen.generate('2026-02-23', '2026-03-01');
    expect(digest.alterEgoActionsExecuted).toBe(1);
  });

  it('stores and retrieves alter ego stats from digest DB', async () => {
    alterEgoStore.logReceipt({
      id: 'store_test',
      actionType: 'email.send',
      summary: 'Stored',
      reasoning: 'test',
      status: 'executed',
      undoAvailable: false,
      undoExpiresAt: null,
      weekGroup: '2026-W09',
      createdAt: '2026-02-24T10:00:00Z',
      executedAt: '2026-02-24T10:00:00Z',
    });

    const gen = new WeeklyDigestGenerator({
      db: db as unknown as DatabaseHandle,
      auditDb: auditDb as unknown as DatabaseHandle,
      alterEgoStore,
    });

    await gen.generate('2026-02-23', '2026-03-01');

    // Retrieve the stored digest
    const latest = gen.getLatest();
    expect(latest).not.toBeNull();
    expect(latest!.alterEgoActionsExecuted).toBe(1);
    expect(latest!.alterEgoActionsUndone).toBe(0);
    expect(latest!.alterEgoActionsBatched).toBe(0);
  });
});
