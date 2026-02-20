// Audit Trail Migration Tests — Validates the estimatedTimeSavedSeconds migration.
// Ensures the column exists, new entries include it, and existing entries default to 0.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AuditTrail } from '@semblance/gateway/audit/trail.js';
import { AuditEntry, sha256 } from '@semblance/core';
import { TIME_SAVED_DEFAULTS, TIME_SAVED_GRANULAR, getDefaultTimeSaved } from '@semblance/gateway/audit/time-saved-defaults.js';
import type { ActionType } from '@semblance/core';

describe('Audit Trail Migration — estimatedTimeSavedSeconds', () => {
  let db: Database.Database;
  let trail: AuditTrail;

  const makeEntry = (overrides?: Partial<Parameters<AuditTrail['append']>[0]>) => ({
    requestId: 'req_migrate_001',
    timestamp: '2026-02-20T10:00:00.000Z',
    action: 'email.send' as ActionType,
    direction: 'request' as const,
    status: 'pending' as const,
    payloadHash: sha256('test payload'),
    signature: 'sig_test_001',
    ...overrides,
  });

  beforeEach(() => {
    db = new Database(':memory:');
    trail = new AuditTrail(db);
  });

  afterEach(() => {
    db.close();
  });

  it('estimated_time_saved_seconds column exists in audit_log table', () => {
    const columns = db.prepare("PRAGMA table_info('audit_log')").all() as { name: string }[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('estimated_time_saved_seconds');
  });

  it('new entries include estimatedTimeSavedSeconds with explicit value', () => {
    trail.append(makeEntry({ estimatedTimeSavedSeconds: 120 }));
    const entries = trail.getByRequestId('req_migrate_001');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.estimatedTimeSavedSeconds).toBe(120);
  });

  it('new entries default to 0 when estimatedTimeSavedSeconds is not provided', () => {
    trail.append(makeEntry());
    const entries = trail.getByRequestId('req_migrate_001');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.estimatedTimeSavedSeconds).toBe(0);
  });

  it('Zod AuditEntry schema validates estimatedTimeSavedSeconds', () => {
    trail.append(makeEntry({ estimatedTimeSavedSeconds: 60 }));
    const entries = trail.getByRequestId('req_migrate_001');
    const parsed = AuditEntry.safeParse(entries[0]);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.estimatedTimeSavedSeconds).toBe(60);
    }
  });

  it('Zod AuditEntry schema defaults estimatedTimeSavedSeconds to 0', () => {
    const partial = {
      id: 'test-id',
      requestId: 'req-1',
      timestamp: '2026-02-20T10:00:00.000Z',
      action: 'email.send',
      direction: 'request',
      status: 'pending',
      payloadHash: 'hash',
      signature: 'sig',
      chainHash: 'chain',
    };
    const parsed = AuditEntry.safeParse(partial);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.estimatedTimeSavedSeconds).toBe(0);
    }
  });

  it('Zod AuditEntry schema rejects negative estimatedTimeSavedSeconds', () => {
    const entry = {
      id: 'test-id',
      requestId: 'req-1',
      timestamp: '2026-02-20T10:00:00.000Z',
      action: 'email.send',
      direction: 'request',
      status: 'pending',
      payloadHash: 'hash',
      signature: 'sig',
      chainHash: 'chain',
      estimatedTimeSavedSeconds: -5,
    };
    const parsed = AuditEntry.safeParse(entry);
    expect(parsed.success).toBe(false);
  });

  it('migration handles pre-existing Sprint 1 databases gracefully', () => {
    // Simulate a Sprint 1 database (without the column)
    const sprint1Db = new Database(':memory:');
    sprint1Db.exec(`
      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        direction TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        signature TEXT NOT NULL,
        chain_hash TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Insert a Sprint 1 entry (no estimated_time_saved_seconds column)
    sprint1Db.prepare(
      "INSERT INTO audit_log (id, request_id, timestamp, action, direction, status, payload_hash, signature, chain_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run('old-entry', 'req-old', '2026-01-15T10:00:00.000Z', 'email.send', 'request', 'pending', 'hash-old', 'sig-old', 'chain-old');

    // Creating AuditTrail should migrate without error
    const migratedTrail = new AuditTrail(sprint1Db);

    // Old entries should default to 0
    const row = sprint1Db.prepare("SELECT estimated_time_saved_seconds FROM audit_log WHERE id = 'old-entry'").get() as { estimated_time_saved_seconds: number };
    expect(row.estimated_time_saved_seconds).toBe(0);

    // New entries should include the field
    migratedTrail.append(makeEntry({ estimatedTimeSavedSeconds: 300 }));
    const entries = migratedTrail.getByRequestId('req_migrate_001');
    expect(entries[0]!.estimatedTimeSavedSeconds).toBe(300);

    sprint1Db.close();
  });

  it('chain integrity holds with estimatedTimeSavedSeconds populated', () => {
    trail.append(makeEntry({ requestId: 'req_001', estimatedTimeSavedSeconds: 60 }));
    trail.append(makeEntry({ requestId: 'req_002', estimatedTimeSavedSeconds: 120 }));
    trail.append(makeEntry({ requestId: 'req_003', estimatedTimeSavedSeconds: 0 }));

    const integrity = trail.verifyChainIntegrity();
    expect(integrity.valid).toBe(true);
  });
});

describe('Time-Saved Defaults', () => {
  it('TIME_SAVED_DEFAULTS has an entry for every ActionType', () => {
    const actionTypes: ActionType[] = [
      'email.fetch', 'email.send', 'email.draft',
      'calendar.fetch', 'calendar.create', 'calendar.update',
      'finance.fetch_transactions', 'health.fetch', 'service.api_call',
    ];

    for (const action of actionTypes) {
      expect(TIME_SAVED_DEFAULTS[action]).toBeDefined();
      expect(typeof TIME_SAVED_DEFAULTS[action]).toBe('number');
    }
  });

  it('fetch actions default to 0 time saved', () => {
    expect(TIME_SAVED_DEFAULTS['email.fetch']).toBe(0);
    expect(TIME_SAVED_DEFAULTS['calendar.fetch']).toBe(0);
    expect(TIME_SAVED_DEFAULTS['finance.fetch_transactions']).toBe(0);
    expect(TIME_SAVED_DEFAULTS['health.fetch']).toBe(0);
  });

  it('action types have correct estimates per build prompt', () => {
    expect(TIME_SAVED_DEFAULTS['email.send']).toBe(60);
    expect(TIME_SAVED_DEFAULTS['email.draft']).toBe(120);
    expect(TIME_SAVED_DEFAULTS['calendar.create']).toBe(180);
    expect(TIME_SAVED_DEFAULTS['calendar.update']).toBe(180);
  });

  it('TIME_SAVED_GRANULAR has correct values', () => {
    expect(TIME_SAVED_GRANULAR.emailArchive).toBe(15);
    expect(TIME_SAVED_GRANULAR.emailDraft).toBe(120);
    expect(TIME_SAVED_GRANULAR.emailSendRoutine).toBe(60);
    expect(TIME_SAVED_GRANULAR.calendarConflictResolution).toBe(180);
    expect(TIME_SAVED_GRANULAR.meetingPrepSurfacing).toBe(300);
    expect(TIME_SAVED_GRANULAR.subscriptionFlag).toBe(600);
  });

  it('getDefaultTimeSaved returns correct values', () => {
    expect(getDefaultTimeSaved('email.send')).toBe(60);
    expect(getDefaultTimeSaved('email.fetch')).toBe(0);
    expect(getDefaultTimeSaved('calendar.create')).toBe(180);
  });
});
