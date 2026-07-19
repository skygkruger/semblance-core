import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import type { CapabilityGrantV1 } from '@semblance/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createEventLog,
  createSourceRef,
  createVaultContentEraser,
  DomainKeyStore,
  EncryptedSqliteStore,
  listAgencyGraphEntitiesByType,
  projectDocumentsFromEvents,
  projectVectorsFromEvents,
  REDACTED_PAYLOAD_CIPHERTEXT,
  createAgencyGraphStore,
  attemptDecryptRedactedPayload,
  createDeletionCompletionTracker,
} from '../src/index.js';

const ROOT_KEY = randomBytes(32);
const NOW_MS = Date.parse('2026-07-18T12:05:00.000Z');
const DEVICE_ONLINE = 'device-macbook-001';
const DEVICE_OFFLINE = 'device-phone-002';

function createVaultGrant(overrides: Partial<CapabilityGrantV1> = {}): CapabilityGrantV1 {
  return {
    schemaVersion: 1,
    capabilityId: 'cap-vault-deletion',
    principalId: 'principal-local-001',
    deviceId: DEVICE_ONLINE,
    processId: 'core-01HXYZ',
    sessionId: 'session-9b2c4d6e8f0a',
    processType: 'core',
    extensionInstanceId: null,
    workflowId: 'wf-vault-deletion',
    consentReceiptId: 'receipt-consent-001',
    executionDestination: 'local',
    resource: 'vault',
    operations: ['vault.read', 'vault.write'],
    purpose: 'Vault deletion lifecycle',
    dataScope: {
      domains: ['documents'],
      accounts: ['user@example.com'],
      sources: ['local'],
      recordClasses: ['event'],
    },
    constraints: {
      domains: ['documents'],
      resultLimit: 100,
      sensitivityCeiling: 'restricted',
    },
    issuedAt: '2026-07-18T12:00:00.000Z',
    expiresAt: '2026-07-18T12:30:00.000Z',
    policyEpoch: 3,
    revocationEpoch: 0,
    auditCorrelationId: 'audit-cap-vault-deletion',
    signature: 'ed25519:capability-signature-base64',
    ...overrides,
  };
}

function appendDocument(
  log: ReturnType<typeof createEventLog>,
  params: { eventId: string; documentId: string; title: string },
): void {
  const sourceRef = createSourceRef({
    sourceId: `source-${params.documentId}`,
    sourceType: 'file',
    uri: `file:///docs/${params.documentId}.txt`,
    ingestedAt: '2026-07-18T11:59:00.000Z',
  });

  log.writer.append({
    eventId: params.eventId,
    dataDomain: 'documents',
    deviceId: DEVICE_ONLINE,
    membershipEpoch: 2,
    eventType: 'source_ingested',
    sourceRefs: [sourceRef],
    sensitivity: 'personal',
    occurredAt: '2026-07-18T12:00:00.000Z',
    payloadPlaintext: JSON.stringify({
      schemaVersion: 1,
      documentId: params.documentId,
      title: params.title,
      mimeType: 'text/plain',
    }),
  });
}

describe('vault deletion lifecycle', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  function openVault() {
    const dir = mkdtempSync(join(tmpdir(), 'semblance-vault-deletion-'));
    tempDirs.push(dir);
    const db = new Database(join(dir, 'vault-events.db'));
    const log = createEventLog({
      db,
      rootKey: ROOT_KEY,
      writerId: randomBytes(8).toString('hex'),
    });
    const eraser = createVaultContentEraser({
      db,
      rootKey: ROOT_KEY,
      writer: log.writer,
      reader: log.reader,
    });
    return { db, log, eraser, dir };
  }

  it('removes deleted content from active store and projections', () => {
    const { db, log, eraser } = openVault();
    const grant = createVaultGrant();

    appendDocument(log, {
      eventId: 'event-doc-keep',
      documentId: 'doc-keep',
      title: 'Keep Me',
    });
    appendDocument(log, {
      eventId: 'event-doc-delete',
      documentId: 'doc-delete',
      title: 'Delete Me',
    });

    const beforeRow = db
      .prepare('SELECT payload_ciphertext FROM vault_event_log WHERE event_id = ?')
      .get('event-doc-delete') as { payload_ciphertext: string };
    expect(beforeRow.payload_ciphertext).toMatch(/^aes256gcm:/);

    const result = eraser.deleteContent(
      {
        entityId: 'doc-delete',
        entityType: 'document',
        dataDomain: 'documents',
        tombstoneEventId: 'event-tombstone-001',
        deviceId: DEVICE_ONLINE,
        membershipEpoch: 2,
        policyEpoch: 3,
        sourceRefs: [
          createSourceRef({
            sourceId: 'source-doc-delete',
            sourceType: 'file',
            uri: 'file:///docs/doc-delete.txt',
            ingestedAt: '2026-07-18T11:59:00.000Z',
          }),
        ],
        sensitivity: 'personal',
        occurredAt: '2026-07-18T12:04:00.000Z',
        authorizedDevices: [DEVICE_ONLINE, DEVICE_OFFLINE],
      },
      { grant, principalId: 'principal-local-001', nowMs: NOW_MS },
    );

    expect(result.redactedSourceEventIds).toEqual(['event-doc-delete']);

    const afterRow = db
      .prepare('SELECT payload_ciphertext FROM vault_event_log WHERE event_id = ?')
      .get('event-doc-delete') as { payload_ciphertext: string };
    expect(afterRow.payload_ciphertext).toBe(REDACTED_PAYLOAD_CIPHERTEXT);

    const events = log.reader
      .readAll({
        grant,
        principalId: 'principal-local-001',
        nowMs: NOW_MS,
      })
      .map((entry) => ({
        sequence: entry.sequence,
        eventId: entry.event.eventId,
        eventType: entry.event.eventType,
        occurredAt: entry.event.occurredAt,
        sourceRefs: entry.event.sourceRefs,
        sensitivity: entry.event.sensitivity,
        payload: JSON.parse(entry.payloadPlaintext) as unknown,
      }));

    const documents = projectDocumentsFromEvents(events);
    expect(documents.documentCount).toBe(1);
    expect(documents.documents[0]?.documentId).toBe('doc-keep');

    const vectors = projectVectorsFromEvents(events);
    expect(vectors.chunkCount).toBe(1);
    expect(vectors.chunks[0]?.documentId).toBe('doc-keep');

    const graphStore = createAgencyGraphStore();
    graphStore.rebuild(events);
    const activeDocuments = listAgencyGraphEntitiesByType(graphStore, 'document', 10);
    expect(activeDocuments).toHaveLength(1);
    expect(activeDocuments[0]?.entityId).toBe('doc-keep');

    const proof = eraser.getMinimizedProof(result.tombstoneEventId);
    expect(proof).toEqual({
      tombstoneEventId: 'event-tombstone-001',
      deletionReceiptHash: result.deletionReceiptHash,
    });
    expect(proof?.deletionReceiptHash).toMatch(/^[a-f0-9]{64}$/);

    log.close();
  });

  it('cryptographically erases content so prior ciphertext cannot be decrypted', () => {
    const { db, log, eraser } = openVault();
    const grant = createVaultGrant();

    appendDocument(log, {
      eventId: 'event-doc-secret',
      documentId: 'doc-secret',
      title: 'Secret Notes',
    });

    const beforeRow = db
      .prepare('SELECT payload_ciphertext, data_domain FROM vault_event_log WHERE event_id = ?')
      .get('event-doc-secret') as { payload_ciphertext: string; data_domain: string };

    const domainKeysBefore = new DomainKeyStore(ROOT_KEY);
    const plaintextBefore = domainKeysBefore.decryptPayload(
      beforeRow.data_domain,
      beforeRow.payload_ciphertext,
    );
    expect(plaintextBefore).toContain('Secret Notes');

    eraser.deleteContent(
      {
        entityId: 'doc-secret',
        entityType: 'document',
        dataDomain: 'documents',
        tombstoneEventId: 'event-tombstone-secret',
        deviceId: DEVICE_ONLINE,
        membershipEpoch: 2,
        policyEpoch: 3,
        sourceRefs: [
          createSourceRef({
            sourceId: 'source-doc-secret',
            sourceType: 'file',
            uri: 'file:///docs/doc-secret.txt',
            ingestedAt: '2026-07-18T11:59:00.000Z',
          }),
        ],
        sensitivity: 'personal',
        occurredAt: '2026-07-18T12:04:00.000Z',
        authorizedDevices: [DEVICE_ONLINE],
        backupBlobKeys: ['backup:doc-secret'],
      },
      { grant, principalId: 'principal-local-001', nowMs: NOW_MS },
    );

    const afterRow = db
      .prepare('SELECT payload_ciphertext, data_domain FROM vault_event_log WHERE event_id = ?')
      .get('event-doc-secret') as { payload_ciphertext: string; data_domain: string };

    expect(
      attemptDecryptRedactedPayload(domainKeysBefore, afterRow.data_domain, afterRow.payload_ciphertext),
    ).toBe(false);

    expect(() =>
      domainKeysBefore.decryptPayload(beforeRow.data_domain, beforeRow.payload_ciphertext),
    ).not.toThrow();

    const encryptedStore = new EncryptedSqliteStore(db, ROOT_KEY);
    const backupPlaintext = encryptedStore.get('backup:doc-secret');
    expect(backupPlaintext).toBeDefined();
    expect(backupPlaintext?.includes(Buffer.from('Secret Notes'))).toBe(false);

    expect(eraser.isContentKeyDestroyed('doc-secret', 'documents')).toBe(true);

    log.close();
  });

  it('tracks pending deletion completion for offline devices', () => {
    const { db, log, eraser } = openVault();
    const grant = createVaultGrant();
    const completion = createDeletionCompletionTracker(db);

    appendDocument(log, {
      eventId: 'event-doc-offline',
      documentId: 'doc-offline',
      title: 'Offline Sync Target',
    });

    eraser.deleteContent(
      {
        entityId: 'doc-offline',
        entityType: 'document',
        dataDomain: 'documents',
        tombstoneEventId: 'event-tombstone-offline',
        deviceId: DEVICE_ONLINE,
        membershipEpoch: 2,
        policyEpoch: 3,
        sourceRefs: [
          createSourceRef({
            sourceId: 'source-doc-offline',
            sourceType: 'file',
            uri: 'file:///docs/doc-offline.txt',
            ingestedAt: '2026-07-18T11:59:00.000Z',
          }),
        ],
        sensitivity: 'personal',
        occurredAt: '2026-07-18T12:04:00.000Z',
        authorizedDevices: [DEVICE_ONLINE, DEVICE_OFFLINE],
      },
      { grant, principalId: 'principal-local-001', nowMs: NOW_MS },
    );

    const pendingStatus = completion.getStatus('event-tombstone-offline');
    expect(pendingStatus.pendingDevices).toEqual([DEVICE_OFFLINE]);
    expect(pendingStatus.completedDevices).toEqual([DEVICE_ONLINE]);
    expect(pendingStatus.isFullyComplete).toBe(false);

    completion.markDeviceComplete('event-tombstone-offline', DEVICE_OFFLINE);

    const completeStatus = completion.getStatus('event-tombstone-offline');
    expect(completeStatus.pendingDevices).toEqual([]);
    expect(completeStatus.completedDevices.sort()).toEqual([DEVICE_OFFLINE, DEVICE_ONLINE].sort());
    expect(completeStatus.isFullyComplete).toBe(true);

    log.close();
  });
});
