/**
 * Step 29 — ActionHistoryAggregator tests (Commit 2).
 * Tests audit_log aggregation for action history.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { ActionHistoryAggregator } from '@semblance/core/privacy/action-history-aggregator';

let db: InstanceType<typeof Database>;
let aggregator: ActionHistoryAggregator;

function createAuditLogTable(): void {
  db.exec(`
    CREATE TABLE audit_log (
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
}

function insertAuditEntry(
  id: string,
  action: string,
  status: string,
  autonomyTier: string,
  timeSaved: number = 0,
): void {
  const metadata = JSON.stringify({ autonomyTier });
  db.prepare(`
    INSERT INTO audit_log (id, request_id, timestamp, action, direction, status, payload_hash, signature, chain_hash, metadata, estimated_time_saved_seconds)
    VALUES (?, ?, '2026-06-15T10:00:00', ?, 'request', ?, 'hash', 'sig', 'chain', ?, ?)
  `).run(id, id, action, status, metadata, timeSaved);
}

beforeEach(() => {
  db = new Database(':memory:');
  aggregator = new ActionHistoryAggregator({ db: db as unknown as DatabaseHandle });
});

afterEach(() => {
  db.close();
});

describe('ActionHistoryAggregator (Step 29)', () => {
  it('returns total action count and tier breakdown', () => {
    createAuditLogTable();
    insertAuditEntry('a1', 'email.fetch', 'success', 'partner', 30);
    insertAuditEntry('a2', 'email.send', 'success', 'partner', 60);
    insertAuditEntry('a3', 'calendar.create', 'success', 'guardian', 10);

    const result = aggregator.aggregate();
    expect(result.totalActions).toBe(3);
    expect(result.byAutonomyTier).toEqual({ partner: 2, guardian: 1 });
  });

  it('returns zeroes when audit_log is missing', () => {
    // No audit_log table
    const result = aggregator.aggregate();
    expect(result.totalActions).toBe(0);
    expect(result.byAutonomyTier).toEqual({});
    expect(result.approvalRate).toBe(0);
    expect(result.averageTimeSavedSeconds).toBe(0);
  });

  it('computes average time saved', () => {
    createAuditLogTable();
    insertAuditEntry('a1', 'email.fetch', 'success', 'partner', 30);
    insertAuditEntry('a2', 'email.send', 'success', 'partner', 90);

    const result = aggregator.aggregate();
    expect(result.averageTimeSavedSeconds).toBe(60); // (30 + 90) / 2
  });
});
