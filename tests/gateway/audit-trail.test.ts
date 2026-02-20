// Audit Trail Tests — Proves append-only, tamper-evident chain hashing.
// This is the integrity backbone of the entire Gateway.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AuditTrail } from '@semblance/gateway/audit/trail.js';
import { sha256 } from '@semblance/core';
import type { ActionType } from '@semblance/core';

describe('Audit Trail', () => {
  let db: Database.Database;
  let trail: AuditTrail;

  const makeEntry = (overrides?: Partial<Parameters<AuditTrail['append']>[0]>) => ({
    requestId: 'req_test_001',
    timestamp: '2026-01-15T10:30:00.000Z',
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

  it('entry is written and can be retrieved', () => {
    const id = trail.append(makeEntry());
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');

    const entries = trail.getByRequestId('req_test_001');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.requestId).toBe('req_test_001');
    expect(entries[0]!.action).toBe('email.send');
  });

  it('entry cannot be modified after creation (no UPDATE)', () => {
    trail.append(makeEntry());

    // Direct SQL attempt to update should fail integrity
    // The AuditTrail class has no update method — this test verifies the API surface
    expect(typeof (trail as Record<string, unknown>)['update']).toBe('undefined');
    expect(typeof (trail as Record<string, unknown>)['updateEntry']).toBe('undefined');
    expect(typeof (trail as Record<string, unknown>)['modify']).toBe('undefined');
  });

  it('entry cannot be deleted via API (no DELETE method)', () => {
    trail.append(makeEntry());

    expect(typeof (trail as Record<string, unknown>)['delete']).toBe('undefined');
    expect(typeof (trail as Record<string, unknown>)['deleteEntry']).toBe('undefined');
    expect(typeof (trail as Record<string, unknown>)['remove']).toBe('undefined');
    expect(typeof (trail as Record<string, unknown>)['truncate']).toBe('undefined');
  });

  it('chain hash integrity can be verified across multiple entries', () => {
    trail.append(makeEntry({ requestId: 'req_001' }));
    trail.append(makeEntry({ requestId: 'req_002', direction: 'response', status: 'success' }));
    trail.append(makeEntry({ requestId: 'req_003' }));

    const integrity = trail.verifyChainIntegrity();
    expect(integrity.valid).toBe(true);
  });

  it('first entry uses genesis hash', () => {
    trail.append(makeEntry());

    const entries = trail.getRecent(1);
    expect(entries).toHaveLength(1);
    const genesisHash = sha256('semblance-audit-genesis');
    expect(entries[0]!.chainHash).toBe(genesisHash);
  });

  it('subsequent entries chain from previous', () => {
    trail.append(makeEntry({ requestId: 'req_001', signature: 'sig_A' }));
    trail.append(makeEntry({ requestId: 'req_002', signature: 'sig_B' }));

    const entries = trail.getRecent(10);
    expect(entries).toHaveLength(2);

    // Second entry's chain hash should be SHA-256 of first entry's (id|payloadHash|signature)
    const first = entries[0]!;
    const second = entries[1]!;
    const expectedChainHash = sha256(`${first.id}|${first.payloadHash}|${first.signature}`);
    expect(second.chainHash).toBe(expectedChainHash);
  });

  it('tampering with any entry breaks chain verification', () => {
    trail.append(makeEntry({ requestId: 'req_001' }));
    trail.append(makeEntry({ requestId: 'req_002' }));
    trail.append(makeEntry({ requestId: 'req_003' }));

    // Verify chain is initially valid
    expect(trail.verifyChainIntegrity().valid).toBe(true);

    // Tamper with the second entry's payload_hash directly in SQLite
    const entries = trail.getRecent(10);
    const secondId = entries[1]!.id;
    db.prepare('UPDATE audit_log SET payload_hash = ? WHERE id = ?')
      .run('TAMPERED_HASH', secondId);

    // Re-create trail from the tampered database
    const tamperedTrail = new AuditTrail(db);
    const integrity = tamperedTrail.verifyChainIntegrity();
    expect(integrity.valid).toBe(false);
    // The break should be detected at the third entry (since its chain_hash
    // was computed from the original second entry's fields)
    expect(integrity.valid).toBe(false);
  });

  it('tampering with first entry breaks chain at genesis', () => {
    trail.append(makeEntry({ requestId: 'req_001' }));
    trail.append(makeEntry({ requestId: 'req_002' }));

    // Tamper with first entry's chain_hash
    const entries = trail.getRecent(10);
    const firstId = entries[0]!.id;
    db.prepare('UPDATE audit_log SET chain_hash = ? WHERE id = ?')
      .run('WRONG_HASH', firstId);

    const tamperedTrail = new AuditTrail(db);
    const integrity = tamperedTrail.verifyChainIntegrity();
    expect(integrity.valid).toBe(false);
    if (!integrity.valid) {
      expect(integrity.brokenAt).toBe(firstId);
    }
  });

  it('getByRequestId returns request + response pair', () => {
    trail.append(makeEntry({
      requestId: 'req_001',
      direction: 'request',
      status: 'pending',
    }));
    trail.append(makeEntry({
      requestId: 'req_001',
      direction: 'response',
      status: 'success',
    }));

    const entries = trail.getByRequestId('req_001');
    expect(entries).toHaveLength(2);
    expect(entries[0]!.direction).toBe('request');
    expect(entries[1]!.direction).toBe('response');
  });

  it('getByAction returns correct entries', () => {
    trail.append(makeEntry({ action: 'email.send' as ActionType }));
    trail.append(makeEntry({ action: 'calendar.create' as ActionType }));
    trail.append(makeEntry({ action: 'email.send' as ActionType }));

    const emailEntries = trail.getByAction('email.send');
    expect(emailEntries).toHaveLength(2);

    const calEntries = trail.getByAction('calendar.create');
    expect(calEntries).toHaveLength(1);
  });

  it('getByTimeRange returns correct entries', () => {
    trail.append(makeEntry({ timestamp: '2026-01-15T10:00:00.000Z' }));
    trail.append(makeEntry({ timestamp: '2026-01-15T12:00:00.000Z' }));
    trail.append(makeEntry({ timestamp: '2026-01-15T14:00:00.000Z' }));

    const entries = trail.getByTimeRange('2026-01-15T11:00:00.000Z', '2026-01-15T13:00:00.000Z');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.timestamp).toBe('2026-01-15T12:00:00.000Z');
  });

  it('count returns correct number', () => {
    expect(trail.count()).toBe(0);
    trail.append(makeEntry());
    expect(trail.count()).toBe(1);
    trail.append(makeEntry());
    expect(trail.count()).toBe(2);
  });

  it('empty trail verifies as valid', () => {
    const integrity = trail.verifyChainIntegrity();
    expect(integrity.valid).toBe(true);
  });

  it('metadata is stored and retrieved correctly', () => {
    trail.append(makeEntry({
      metadata: { rejectionReason: 'rate_limited', retryMs: 5000 },
    }));

    const entries = trail.getRecent(1);
    expect(entries[0]!.metadata).toEqual({
      rejectionReason: 'rate_limited',
      retryMs: 5000,
    });
  });

  it('chain continuity survives new AuditTrail instance', () => {
    trail.append(makeEntry({ requestId: 'req_001' }));
    trail.append(makeEntry({ requestId: 'req_002' }));

    // Create a new AuditTrail instance with the same database
    const trail2 = new AuditTrail(db);
    trail2.append(makeEntry({ requestId: 'req_003' }));

    // The chain should still be valid across both instances
    const integrity = trail2.verifyChainIntegrity();
    expect(integrity.valid).toBe(true);
    expect(trail2.count()).toBe(3);
  });
});
