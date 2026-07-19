import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import type { CapabilityGrantV1 } from '@semblance/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import {
  computeAgencyGraphSnapshotHash,
  createEventLog,
  createPreMigrationBackup,
  createSourceRef,
  createVaultContentEraser,
  DomainKeyStore,
  EncryptedSqliteStore,
  listAgencyGraphEntitiesByType,
  projectAgencyGraphFromEvents,
  projectDocumentsFromEvents,
  projectVectorsFromEvents,
  rollbackFromBackup,
  searchDocumentsByQuery,
  createAgencyGraphStore,
  attemptDecryptRedactedPayload,
} from '../src/index.js';

const ROOT_KEY = randomBytes(32);
const NOW_MS = Date.parse('2026-07-18T14:00:00.000Z');
const DEVICE_ID = 'device-exit-gate-001';
const OFFLINE_DEVICE_ID = 'device-exit-gate-offline';

const CORPUS_QUERIES: Array<{ query: string; expectedDocumentId: string }> = [
  { query: 'alpha', expectedDocumentId: 'corpus-doc-01' },
  { query: 'bravo', expectedDocumentId: 'corpus-doc-02' },
  { query: 'charlie', expectedDocumentId: 'corpus-doc-03' },
  { query: 'delta', expectedDocumentId: 'corpus-doc-04' },
  { query: 'echo', expectedDocumentId: 'corpus-doc-05' },
  { query: 'foxtrot', expectedDocumentId: 'corpus-doc-06' },
  { query: 'golf', expectedDocumentId: 'corpus-doc-07' },
  { query: 'hotel', expectedDocumentId: 'corpus-doc-08' },
  { query: 'india', expectedDocumentId: 'corpus-doc-09' },
  { query: 'juliet', expectedDocumentId: 'corpus-doc-10' },
];

function createVaultGrant(): CapabilityGrantV1 {
  return {
    schemaVersion: 1,
    capabilityId: 'cap-vault-exit-gate',
    principalId: 'principal-exit-gate',
    deviceId: DEVICE_ID,
    processId: 'core-exit-gate',
    sessionId: 'session-exit-gate',
    processType: 'core',
    extensionInstanceId: null,
    workflowId: 'wf-exit-gate',
    consentReceiptId: 'receipt-exit-gate',
    executionDestination: 'local',
    resource: 'vault',
    operations: ['vault.read', 'vault.write'],
    purpose: 'Slice 3 exit gate corpus',
    dataScope: {
      domains: ['documents'],
      accounts: ['user@example.com'],
      sources: ['local'],
      recordClasses: ['event'],
    },
    constraints: {
      domains: ['documents'],
      resultLimit: 200,
      sensitivityCeiling: 'restricted',
    },
    issuedAt: '2026-07-18T13:00:00.000Z',
    expiresAt: '2026-07-18T15:00:00.000Z',
    policyEpoch: 3,
    revocationEpoch: 0,
    auditCorrelationId: 'audit-exit-gate',
    signature: 'ed25519:capability-signature-base64',
  };
}

function corpusTitle(index: number): string {
  const names = [
    'alpha report',
    'bravo summary',
    'charlie memo',
    'delta notes',
    'echo brief',
    'foxtrot plan',
    'golf outline',
    'hotel draft',
    'india review',
    'juliet ledger',
    'kilo archive',
    'lima record',
    'mike transcript',
    'november packet',
    'oscar log',
    'papa register',
    'quebec index',
    'romeo sheet',
    'sierra journal',
    'tango workbook',
  ];
  return names[index - 1] ?? `document-${index}`;
}

describe('Slice 3 exit gate corpus', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  function makeTempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  it('indexes 20 documents, answers 10 queries, rebuilds deterministically, rollbacks, and erases deletions', () => {
    const root = makeTempDir('semblance-slice3-exit-gate-');
    const vaultDbPath = join(root, 'vault-events.db');
    const legacyDocumentsPath = join(root, 'documents.db');
    const db = new Database(vaultDbPath);
    const log = createEventLog({
      db,
      rootKey: ROOT_KEY,
      writerId: randomBytes(8).toString('hex'),
    });
    const grant = createVaultGrant();

    for (let index = 1; index <= 20; index += 1) {
      const documentId = `corpus-doc-${String(index).padStart(2, '0')}`;
      const sourceRef = createSourceRef({
        sourceId: `corpus-source-${String(index).padStart(2, '0')}`,
        sourceType: 'file',
        uri: `file:///corpus/${documentId}.txt`,
        ingestedAt: '2026-07-18T13:30:00.000Z',
      });

      log.writer.append({
        eventId: `corpus-event-${String(index).padStart(2, '0')}`,
        dataDomain: 'documents',
        deviceId: DEVICE_ID,
        membershipEpoch: 2,
        eventType: 'source_ingested',
        sourceRefs: [sourceRef],
        sensitivity: 'personal',
        occurredAt: '2026-07-18T13:31:00.000Z',
        payloadPlaintext: JSON.stringify({
          schemaVersion: 1,
          documentId,
          title: corpusTitle(index),
          mimeType: 'text/plain',
          sourcePath: `/corpus/${documentId}.txt`,
        }),
      });
    }

    const sourceEventCount = db
      .prepare("SELECT COUNT(*) as count FROM vault_event_log WHERE event_type = 'source_ingested'")
      .get() as { count: number };
    expect(sourceEventCount.count).toBe(20);

    const readEvents = () =>
      log.reader
        .readAll({ grant, principalId: 'principal-exit-gate', nowMs: NOW_MS })
        .map((entry) => ({
          sequence: entry.sequence,
          eventId: entry.event.eventId,
          eventType: entry.event.eventType,
          occurredAt: entry.event.occurredAt,
          sourceRefs: entry.event.sourceRefs,
          sensitivity: entry.event.sensitivity,
          payload: JSON.parse(entry.payloadPlaintext) as unknown,
        }));

    let events = readEvents();
    expect(events.filter((event) => event.eventType === 'source_ingested')).toHaveLength(20);

    for (const { query, expectedDocumentId } of CORPUS_QUERIES) {
      const matches = searchDocumentsByQuery(events, query);
      expect(matches).toHaveLength(1);
      expect(matches[0]?.documentId).toBe(expectedDocumentId);
      expect(matches[0]?.sourceRefs[0]?.sourceId).toBe(
        `corpus-source-${expectedDocumentId.replace('corpus-doc-', '')}`,
      );
    }

    const storeA = createAgencyGraphStore();
    const storeB = createAgencyGraphStore();
    const snapshotA = storeA.rebuild(events);
    const snapshotB = storeB.rebuild([...events].reverse());
    expect(snapshotA.snapshotHash).toBe(snapshotB.snapshotHash);

    const directProjection = projectAgencyGraphFromEvents(events);
    const directHash = computeAgencyGraphSnapshotHash(
      directProjection.entities.filter((entity) => entity.active),
      directProjection.edges.filter((edge) => edge.active),
    );
    expect(snapshotA.snapshotHash).toBe(directHash);

    const documentsBefore = projectDocumentsFromEvents(events);
    const vectorsBefore = projectVectorsFromEvents(events);
    expect(documentsBefore.documentCount).toBe(20);
    expect(vectorsBefore.chunkCount).toBe(20);

    const legacyDocumentsDb = new Database(legacyDocumentsPath);
    legacyDocumentsDb.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL
      );
    `);
    for (let index = 1; index <= 20; index += 1) {
      const documentId = `corpus-doc-${String(index).padStart(2, '0')}`;
      legacyDocumentsDb.prepare('INSERT INTO documents (id, title) VALUES (?, ?)').run(
        documentId,
        corpusTitle(index),
      );
    }
    legacyDocumentsDb.close();

    log.close();
    db.close();

    const backupSnapshot = createPreMigrationBackup({
      sourcePaths: [vaultDbPath, legacyDocumentsPath],
      backupRootDir: join(root, 'backups'),
    });

    writeFileSync(vaultDbPath, '-- corrupted during failed cutover\n', 'utf-8');
    writeFileSync(legacyDocumentsPath, '-- corrupted legacy\n', 'utf-8');

    const rollback = rollbackFromBackup(backupSnapshot);
    expect(rollback.verified).toBe(true);

    const restoredVaultBytes = readFileSync(vaultDbPath);
    const backupVaultBytes = readFileSync(
      backupSnapshot.files.find((file) => file.sourcePath.endsWith('vault-events.db'))!.backupPath,
    );
    expect(restoredVaultBytes.equals(backupVaultBytes)).toBe(true);

    const restoredDb = new Database(vaultDbPath);
    const restoredLog = createEventLog({
      db: restoredDb,
      rootKey: ROOT_KEY,
      writerId: randomBytes(8).toString('hex'),
    });

    events = restoredLog.reader
      .readAll({ grant, principalId: 'principal-exit-gate', nowMs: NOW_MS })
      .map((entry) => ({
        sequence: entry.sequence,
        eventId: entry.event.eventId,
        eventType: entry.event.eventType,
        occurredAt: entry.event.occurredAt,
        sourceRefs: entry.event.sourceRefs,
        sensitivity: entry.event.sensitivity,
        payload: JSON.parse(entry.payloadPlaintext) as unknown,
      }));

    expect(projectDocumentsFromEvents(events).documentCount).toBe(20);

    const encryptedStore = new EncryptedSqliteStore(restoredDb, ROOT_KEY);
    const backupBlobKey = 'backup:corpus-doc-07';
    encryptedStore.put(backupBlobKey, Buffer.from('hotel draft backup plaintext', 'utf-8'));

    const deleteTargetId = 'corpus-doc-07';
    const deleteTargetEventId = 'corpus-event-07';
    const preDeleteCiphertext = restoredDb
      .prepare('SELECT payload_ciphertext, data_domain FROM vault_event_log WHERE event_id = ?')
      .get(deleteTargetEventId) as { payload_ciphertext: string; data_domain: string };

    const domainKeys = new DomainKeyStore(ROOT_KEY);
    const preDeletePlaintext = domainKeys.decryptPayload(
      preDeleteCiphertext.data_domain,
      preDeleteCiphertext.payload_ciphertext,
    );
    expect(preDeletePlaintext).toContain('golf outline');

    const eraser = createVaultContentEraser({
      db: restoredDb,
      rootKey: ROOT_KEY,
      writer: restoredLog.writer,
      reader: restoredLog.reader,
    });

    eraser.deleteContent(
      {
        entityId: deleteTargetId,
        entityType: 'document',
        dataDomain: 'documents',
        tombstoneEventId: 'corpus-tombstone-07',
        deviceId: DEVICE_ID,
        membershipEpoch: 2,
        policyEpoch: 3,
        sourceRefs: [
          createSourceRef({
            sourceId: 'corpus-source-07',
            sourceType: 'file',
            uri: 'file:///corpus/corpus-doc-07.txt',
            ingestedAt: '2026-07-18T13:30:00.000Z',
          }),
        ],
        sensitivity: 'personal',
        occurredAt: '2026-07-18T13:59:00.000Z',
        authorizedDevices: [DEVICE_ID, OFFLINE_DEVICE_ID],
        backupBlobKeys: [backupBlobKey],
      },
      { grant, principalId: 'principal-exit-gate', nowMs: NOW_MS },
    );

    events = restoredLog.reader
      .readAll({ grant, principalId: 'principal-exit-gate', nowMs: NOW_MS })
      .map((entry) => ({
        sequence: entry.sequence,
        eventId: entry.event.eventId,
        eventType: entry.event.eventType,
        occurredAt: entry.event.occurredAt,
        sourceRefs: entry.event.sourceRefs,
        sensitivity: entry.event.sensitivity,
        payload: JSON.parse(entry.payloadPlaintext) as unknown,
      }));

    const documentsAfter = projectDocumentsFromEvents(events);
    expect(documentsAfter.documentCount).toBe(19);
    expect(documentsAfter.documents.some((doc) => doc.documentId === deleteTargetId)).toBe(false);

    const vectorsAfter = projectVectorsFromEvents(events);
    expect(vectorsAfter.chunks.some((chunk) => chunk.documentId === deleteTargetId)).toBe(false);

    const graphStore = createAgencyGraphStore();
    graphStore.rebuild(events);
    const activeDocuments = listAgencyGraphEntitiesByType(graphStore, 'document', 25);
    expect(activeDocuments.some((entity) => entity.entityId === deleteTargetId)).toBe(false);

    const postDeleteRow = restoredDb
      .prepare('SELECT payload_ciphertext, data_domain FROM vault_event_log WHERE event_id = ?')
      .get(deleteTargetEventId) as { payload_ciphertext: string; data_domain: string };

    expect(
      attemptDecryptRedactedPayload(domainKeys, postDeleteRow.data_domain, postDeleteRow.payload_ciphertext),
    ).toBe(false);

    const backupPlaintext = encryptedStore.get(backupBlobKey);
    expect(backupPlaintext?.includes(Buffer.from('hotel draft backup plaintext'))).toBe(false);

    const proof = eraser.getMinimizedProof('corpus-tombstone-07');
    expect(proof?.tombstoneEventId).toBe('corpus-tombstone-07');
    expect(proof?.deletionReceiptHash).toMatch(/^[a-f0-9]{64}$/);

    const supervisorSnapshot = {
      documentCount: documentsAfter.documentCount,
      vectorChunkCount: vectorsAfter.chunkCount,
      graphSnapshotHash: graphStore.snapshot().snapshotHash,
      graphEntityCount: graphStore.snapshot().entityCount,
      sourceIngestedEvents: events.filter((event) => event.eventType === 'source_ingested').length,
      tombstoneEvents: events.filter((event) => event.eventType === 'deleted').length,
      corpusSha256: createHash('sha256')
        .update(JSON.stringify(documentsAfter.documents.map((doc) => doc.documentId).sort()))
        .digest('hex'),
    };

    expect(supervisorSnapshot.sourceIngestedEvents).toBe(20);
    expect(supervisorSnapshot.tombstoneEvents).toBe(1);
    expect(supervisorSnapshot.documentCount).toBe(19);

    restoredLog.close();
    restoredDb.close();
  });
});
