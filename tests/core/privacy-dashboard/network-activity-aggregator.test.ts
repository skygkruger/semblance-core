/**
 * Step 29 — NetworkActivityAggregator tests (Commit 2).
 * Tests audit_log aggregation for network activity.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { NetworkActivityAggregator } from '@semblance/core/privacy/network-activity-aggregator';

let db: InstanceType<typeof Database>;
let aggregator: NetworkActivityAggregator;

const PERIOD = { start: '2026-01-01T00:00:00', end: '2026-12-31T23:59:59' };

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

function insertAuditEntry(id: string, action: string, status: string, timeSaved: number = 0): void {
  db.prepare(`
    INSERT INTO audit_log (id, request_id, timestamp, action, direction, status, payload_hash, signature, chain_hash, estimated_time_saved_seconds)
    VALUES (?, ?, '2026-06-15T10:00:00', ?, 'response', ?, 'hash', 'sig', 'chain', ?)
  `).run(id, id, action, status, timeSaved);
}

beforeEach(() => {
  db = new Database(':memory:');
  aggregator = new NetworkActivityAggregator({ db: db as unknown as DatabaseHandle });
});

afterEach(() => {
  db.close();
});

describe('NetworkActivityAggregator (Step 29)', () => {
  it('returns zeroes on empty audit_log', () => {
    // No audit_log table — should handle gracefully
    const result = aggregator.aggregate(PERIOD);
    expect(result.services).toHaveLength(0);
    expect(result.totalRequests).toBe(0);
    expect(result.totalRejected).toBe(0);
    expect(result.totalRateLimited).toBe(0);
    expect(result.dataExfiltratedBytes).toBe(0);
    expect(result.unknownDestinations).toBe(0);
  });

  it('groups actions by service prefix', () => {
    createAuditLogTable();
    insertAuditEntry('a1', 'email.fetch', 'success', 10);
    insertAuditEntry('a2', 'email.send', 'success', 20);
    insertAuditEntry('a3', 'calendar.fetch', 'success', 5);

    const result = aggregator.aggregate(PERIOD);
    expect(result.services).toHaveLength(2);

    const email = result.services.find(s => s.service === 'email');
    expect(email).toBeDefined();
    expect(email!.requestCount).toBe(2);
    expect(email!.successCount).toBe(2);
    expect(email!.totalTimeSavedSeconds).toBe(30);

    const calendar = result.services.find(s => s.service === 'calendar');
    expect(calendar).toBeDefined();
    expect(calendar!.requestCount).toBe(1);
  });

  it('counts rejected and rate-limited actions', () => {
    createAuditLogTable();
    insertAuditEntry('a1', 'email.fetch', 'success');
    insertAuditEntry('a2', 'email.fetch', 'rejected');
    insertAuditEntry('a3', 'email.fetch', 'rate_limited');
    insertAuditEntry('a4', 'email.fetch', 'error');

    const result = aggregator.aggregate(PERIOD);
    expect(result.totalRequests).toBe(4);
    expect(result.totalRejected).toBe(1);
    expect(result.totalRateLimited).toBe(1);

    const email = result.services.find(s => s.service === 'email');
    expect(email!.rejectedCount).toBe(1);
    expect(email!.rateLimitedCount).toBe(1);
    expect(email!.errorCount).toBe(1);
  });

  it('sums time saved across services', () => {
    createAuditLogTable();
    insertAuditEntry('a1', 'email.fetch', 'success', 60);
    insertAuditEntry('a2', 'calendar.create', 'success', 120);

    const result = aggregator.aggregate(PERIOD);
    expect(result.totalTimeSavedSeconds).toBe(180);
  });
});
