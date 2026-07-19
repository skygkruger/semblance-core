import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { describe, expect, it, afterEach } from 'vitest';
import type { CapabilityGrantV1 } from '@semblance/protocol';
import {
  createEventLog,
  createVaultEventLogWriter,
  VaultEventLogError,
  verifyVaultEventLogIntegrity,
  detectTruncatedVaultEventLog,
} from '../src/index.js';

const NOW_MS = Date.parse('2026-07-18T12:02:00.000Z');
const ROOT_KEY = randomBytes(32);

function createVaultGrant(overrides: Partial<CapabilityGrantV1> = {}): CapabilityGrantV1 {
  return {
    schemaVersion: 1,
    capabilityId: 'cap-vault-event-log',
    principalId: 'principal-local-001',
    deviceId: 'device-macbook-001',
    processId: 'core-01HXYZ',
    sessionId: 'session-9b2c4d6e8f0a',
    processType: 'core',
    extensionInstanceId: null,
    workflowId: 'wf-vault-event-log',
    consentReceiptId: 'receipt-consent-001',
    executionDestination: 'local',
    resource: 'vault',
    operations: ['vault.read', 'vault.write'],
    purpose: 'Read and write vault events',
    dataScope: {
      domains: ['documents', 'agency', 'preferences'],
      accounts: ['user@example.com'],
      sources: ['local'],
      recordClasses: ['event'],
    },
    constraints: {
      domains: ['documents', 'agency', 'preferences'],
      resultLimit: 100,
      sensitivityCeiling: 'restricted',
    },
    issuedAt: '2026-07-18T12:00:00.000Z',
    expiresAt: '2026-07-18T12:05:00.000Z',
    policyEpoch: 3,
    revocationEpoch: 0,
    auditCorrelationId: 'audit-cap-vault-event-log',
    signature: 'ed25519:capability-signature-base64',
    ...overrides,
  };
}

function createAppendInput(overrides: Partial<Parameters<ReturnType<typeof createEventLog>['writer']['append']>[0]> = {}) {
  return {
    eventId: `vault-event-${randomBytes(4).toString('hex')}`,
    dataDomain: 'documents',
    deviceId: 'device-macbook-001',
    membershipEpoch: 2,
    eventType: 'source_ingested' as const,
    sourceRefs: [
      {
        schemaVersion: 1 as const,
        sourceId: 'email-msg-001',
        sourceType: 'email',
        uri: 'email://gmail/INBOX/abc123',
        ingestedAt: '2026-07-18T11:59:00.000Z',
      },
    ],
    sensitivity: 'personal' as const,
    occurredAt: '2026-07-18T12:00:00.000Z',
    payloadPlaintext: JSON.stringify({ title: 'Quarterly report', bytes: 4096 }),
    ...overrides,
  };
}

describe('vault event log', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  function openMemoryLog() {
    const db = new Database(':memory:');
    const log = createEventLog({ db, rootKey: ROOT_KEY, writerId: randomBytes(8).toString('hex') });
    return { db, log };
  }

  function openFileLog() {
    const dir = mkdtempSync(join(tmpdir(), 'semblance-vault-event-log-'));
    tempDirs.push(dir);
    const db = new Database(join(dir, 'vault-events.db'));
    const log = createEventLog({ db, rootKey: ROOT_KEY, writerId: randomBytes(8).toString('hex') });
    return { db, log, dir };
  }

  it('appends and reads events with encrypted payload roundtrip', () => {
    const { log } = openMemoryLog();
    const grant = createVaultGrant();
    const input = createAppendInput({
      eventId: 'vault-event-roundtrip-001',
      payloadPlaintext: '{"note":"hello vault"}',
    });

    const appended = log.writer.append(input);
    expect(appended.sequence).toBe(1);
    expect(appended.eventId).toBe('vault-event-roundtrip-001');
    expect(appended.chainHash).toMatch(/^[a-f0-9]{64}$/);

    const events = log.reader.readAll({
      grant,
      principalId: 'principal-local-001',
      nowMs: NOW_MS,
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.payloadPlaintext).toBe('{"note":"hello vault"}');
    expect(events[0]!.event.eventId).toBe('vault-event-roundtrip-001');
    expect(events[0]!.event.payloadCiphertext).toMatch(/^aes256gcm:/);
    expect(events[0]!.event.signature).toMatch(/^hmac-sha256:/);

    log.close();
  });

  it('rejects duplicate event IDs', () => {
    const { log } = openMemoryLog();
    const input = createAppendInput({ eventId: 'vault-event-dup-001' });

    log.writer.append(input);

    expect(() => log.writer.append(input)).toThrowError(
      expect.objectContaining({
        code: 'DUPLICATE_EVENT_ID',
      } satisfies Partial<VaultEventLogError>),
    );

    log.close();
  });

  it('detects tampering when ciphertext is modified', () => {
    const { db, log } = openMemoryLog();
    log.writer.append(createAppendInput({ eventId: 'vault-event-tamper-001' }));
    log.writer.append(createAppendInput({ eventId: 'vault-event-tamper-002' }));
    log.close();

    db.prepare(
      `UPDATE vault_event_log
       SET payload_ciphertext = ?
       WHERE event_id = ?`,
    ).run('aes256gcm:dGVzdC10YW1wZXJlZA==', 'vault-event-tamper-001');

    const report = verifyVaultEventLogIntegrity(db, ROOT_KEY);
    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.issue === 'signature_invalid')).toBe(true);
    expect(report.issues.some((issue) => issue.issue === 'chain_hash_invalid')).toBe(true);

    db.close();
  });

  it('detects truncation when events are deleted', () => {
    const { db, log } = openMemoryLog();
    log.writer.append(createAppendInput({ eventId: 'vault-event-trunc-001' }));
    log.writer.append(createAppendInput({ eventId: 'vault-event-trunc-002' }));
    log.writer.append(createAppendInput({ eventId: 'vault-event-trunc-003' }));
    log.close();

    expect(detectTruncatedVaultEventLog(db, 3)).toBe(false);

    db.prepare('DELETE FROM vault_event_log WHERE event_id = ?').run('vault-event-trunc-003');

    expect(detectTruncatedVaultEventLog(db, 3)).toBe(true);

    const report = verifyVaultEventLogIntegrity(db, ROOT_KEY);
    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.issue === 'truncated')).toBe(true);

    db.close();
  });

  it('detects reordering when sequence values are swapped', () => {
    const { db, log } = openMemoryLog();
    log.writer.append(createAppendInput({ eventId: 'vault-event-reorder-001' }));
    log.writer.append(createAppendInput({ eventId: 'vault-event-reorder-002' }));
    log.close();

    db.prepare('UPDATE vault_event_log SET sequence = 99 WHERE event_id = ?').run('vault-event-reorder-001');

    const report = verifyVaultEventLogIntegrity(db, ROOT_KEY);
    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.issue === 'sequence_reordered' || issue.issue === 'sequence_gap')).toBe(
      true,
    );

    db.close();
  });

  it('refuses a second concurrent writer for the same database', () => {
    const { db, log } = openFileLog();

    expect(() =>
      createVaultEventLogWriter({
        db,
        rootKey: ROOT_KEY,
        writerId: 'second-writer',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'WRITER_ALREADY_ACTIVE',
      } satisfies Partial<VaultEventLogError>),
    );

    log.close();

    expect(() =>
      createVaultEventLogWriter({
        db,
        rootKey: ROOT_KEY,
        writerId: 'writer-after-release',
      }),
    ).not.toThrow();

    db.close();
  });

  it('derives distinct domain keys for documents, agency, and preferences', () => {
    const { log } = openMemoryLog();
    const grant = createVaultGrant();

    log.writer.append(
      createAppendInput({
        eventId: 'vault-event-domain-docs',
        dataDomain: 'documents',
        payloadPlaintext: '{"domain":"documents"}',
      }),
    );
    log.writer.append(
      createAppendInput({
        eventId: 'vault-event-domain-agency',
        dataDomain: 'agency',
        payloadPlaintext: '{"domain":"agency"}',
      }),
    );
    log.writer.append(
      createAppendInput({
        eventId: 'vault-event-domain-prefs',
        dataDomain: 'preferences',
        payloadPlaintext: '{"domain":"preferences"}',
      }),
    );

    const events = log.reader.readAll({
      grant,
      principalId: 'principal-local-001',
      nowMs: NOW_MS,
    });

    expect(events.map((entry) => entry.payloadPlaintext)).toEqual([
      '{"domain":"documents"}',
      '{"domain":"agency"}',
      '{"domain":"preferences"}',
    ]);

    const ciphertexts = events.map((entry) => entry.event.payloadCiphertext);
    expect(new Set(ciphertexts).size).toBe(3);

    log.close();
  });
});
