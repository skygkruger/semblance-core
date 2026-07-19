import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import type { CapabilityGrantV1 } from '@semblance/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import {
  appendFileDeletedToVault,
  buildFileIngestPayload,
  buildFileSourceId,
  createEventLog,
  createVaultFileIngestHooks,
  hashAbsolutePath,
  ingestScannedFilesToVault,
  scannedFileToIngestInput,
} from '../src/index.js';

const ROOT_KEY = randomBytes(32);
const NOW_MS = Date.parse('2026-07-18T14:00:00.000Z');
const DEVICE_ID = 'device-file-ingest-001';

function createVaultGrant(): CapabilityGrantV1 {
  return {
    schemaVersion: 1,
    capabilityId: 'cap-vault-file-ingest',
    principalId: 'principal-file-ingest',
    deviceId: DEVICE_ID,
    processId: 'core-file-ingest',
    sessionId: 'session-file-ingest',
    processType: 'core',
    extensionInstanceId: null,
    workflowId: 'wf-file-ingest',
    consentReceiptId: 'receipt-file-ingest',
    executionDestination: 'local',
    resource: 'vault',
    operations: ['vault.read', 'vault.write'],
    purpose: 'Vault file ingest tests',
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
    issuedAt: '2026-07-18T13:00:00.000Z',
    expiresAt: '2026-07-18T15:00:00.000Z',
    policyEpoch: 3,
    revocationEpoch: 0,
    auditCorrelationId: 'audit-file-ingest',
    signature: 'ed25519:capability-signature-base64',
  };
}

describe('vault file ingest', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  function makeFixtureDir(): { root: string; files: Array<{ path: string; name: string }> } {
    const root = mkdtempSync(join(tmpdir(), 'semblance-file-ingest-'));
    tempDirs.push(root);

    const names = ['alpha.txt', 'bravo.md', 'charlie.json'];
    const files = names.map((name) => {
      const path = join(root, name);
      writeFileSync(path, `fixture content for ${name}`, 'utf-8');
      return { path, name };
    });

    return { root, files };
  }

  function openVault() {
    const dir = mkdtempSync(join(tmpdir(), 'semblance-file-ingest-vault-'));
    tempDirs.push(dir);
    const db = new Database(join(dir, 'vault-events.db'));
    const log = createEventLog({
      db,
      rootKey: ROOT_KEY,
      writerId: randomBytes(8).toString('hex'),
    });
    return { db, log };
  }

  it('ingests 3 scanned files with privacy-preserving payloads and stable source IDs', () => {
    const { files } = makeFixtureDir();
    const { db, log } = openVault();
    const grant = createVaultGrant();

    const ingestFiles = files.map((file, index) =>
      scannedFileToIngestInput({
        absolutePath: file.path,
        documentId: `doc-${index + 1}`,
        mimeType: 'text/plain',
        contentHash: `hash-${index + 1}`,
        byteLength: 24,
      }),
    );

    const firstPass = ingestScannedFilesToVault({
      files: ingestFiles,
      eventLog: log,
      deviceId: DEVICE_ID,
      membershipEpoch: 2,
    });

    expect(firstPass.ingested).toBe(3);
    expect(firstPass.skipped).toBe(0);

    const sourceIngestedCount = db
      .prepare("SELECT COUNT(*) as count FROM vault_event_log WHERE event_type = 'source_ingested'")
      .get() as { count: number };
    expect(sourceIngestedCount.count).toBe(3);

    const events = log.reader
      .readAll({ grant, principalId: 'principal-file-ingest', nowMs: NOW_MS })
      .map((entry) => ({
        eventId: entry.event.eventId,
        eventType: entry.event.eventType,
        sourceRefs: entry.event.sourceRefs,
        payloadPlaintext: entry.payloadPlaintext,
        payload: JSON.parse(entry.payloadPlaintext) as Record<string, unknown>,
      }));

    expect(events).toHaveLength(3);
    expect(events.every((event) => event.eventType === 'source_ingested')).toBe(true);

    for (const [index, file] of files.entries()) {
      const event = events[index];
      expect(event).toBeDefined();
      expect(event!.sourceRefs[0]?.sourceId).toBe(buildFileSourceId(file.path));
      expect(event!.sourceRefs[0]?.uri).toBe(`file://hash/${hashAbsolutePath(file.path)}`);
      expect(event!.payload.title).toBe(file.name);
      expect(event!.payload.pathHash).toBe(hashAbsolutePath(file.path));
      expect(event!.payload.documentId).toBe(`doc-${index + 1}`);

      const serialized = JSON.stringify(event!.payload);
      expect(serialized).not.toContain('/Users/');
      expect(serialized).not.toContain(file.path);

      const plaintextPayload = buildFileIngestPayload(
        scannedFileToIngestInput({
          absolutePath: file.path,
          documentId: `doc-${index + 1}`,
          mimeType: 'text/plain',
        }),
      );
      expect(JSON.stringify(plaintextPayload)).not.toContain('/Users/');
      expect(JSON.stringify(plaintextPayload)).not.toContain(file.path);
    }

    const secondPass = ingestScannedFilesToVault({
      files: ingestFiles,
      eventLog: log,
      deviceId: DEVICE_ID,
      membershipEpoch: 2,
      existingEventIds: new Set(firstPass.results.map((result) => result.eventId)),
    });

    expect(secondPass.skipped).toBe(3);
    expect(secondPass.ingested).toBe(0);

    const stableSourceIds = ingestFiles.map((file) => buildFileSourceId(file.absolutePath));
    expect(new Set(stableSourceIds).size).toBe(3);
    expect(events.map((event) => event.sourceRefs[0]?.sourceId)).toEqual(stableSourceIds);
  });

  it('createVaultFileIngestHooks appends deleted tombstones for removed files', () => {
    const { files } = makeFixtureDir();
    const { db, log } = openVault();
    const grant = createVaultGrant();
    const hooks = createVaultFileIngestHooks({
      eventLog: log,
      deviceId: DEVICE_ID,
      membershipEpoch: 2,
      policyEpoch: 3,
    });

    const target = files[0]!;
    hooks.onFileIndexed({
      file: {
        absolutePath: target.path,
        basename: target.name,
        mimeType: 'text/plain',
      },
      documentId: 'doc-delete-me',
      deduplicated: false,
      occurredAt: '2026-07-18T13:31:00.000Z',
    });

    hooks.onFileDeleted({
      absolutePath: target.path,
      documentId: 'doc-delete-me',
      occurredAt: '2026-07-18T13:32:00.000Z',
    });

    const deletedCount = db
      .prepare("SELECT COUNT(*) as count FROM vault_event_log WHERE event_type = 'deleted'")
      .get() as { count: number };
    expect(deletedCount.count).toBe(1);

    const events = log.reader.readAll({
      grant,
      principalId: 'principal-file-ingest',
      nowMs: NOW_MS,
    });

    const tombstone = events.find((entry) => entry.event.eventType === 'deleted');
    expect(tombstone).toBeDefined();
    const payload = JSON.parse(tombstone!.payloadPlaintext) as {
      entityId: string;
      entityType: string;
      sourceEventId?: string;
    };
    expect(payload.entityId).toBe('doc-delete-me');
    expect(payload.entityType).toBe('document');
    expect(payload.sourceEventId).toBeDefined();
  });

  it('appendFileDeletedToVault is idempotent for the same path', () => {
    const { files } = makeFixtureDir();
    const { log } = openVault();
    const absolutePath = files[0]!.path;
    const existingEventIds = new Set<string>();

    const first = appendFileDeletedToVault({
      absolutePath,
      documentId: 'doc-once',
      writer: log.writer,
      deviceId: DEVICE_ID,
      membershipEpoch: 2,
      existingEventIds,
    });
    const second = appendFileDeletedToVault({
      absolutePath,
      documentId: 'doc-once',
      writer: log.writer,
      deviceId: DEVICE_ID,
      membershipEpoch: 2,
      existingEventIds,
    });

    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);
  });
});
