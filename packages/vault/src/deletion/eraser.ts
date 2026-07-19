import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { CapabilityGrantV1 } from '@semblance/protocol';
import { createAgencyGraphStore } from '../agency-graph/store.js';
import type { DecryptedVaultEvent } from '../agency-graph/types.js';
import { DomainKeyStore, deriveVaultSigningKey } from '../crypto/domain-keys.js';
import { EncryptedSqliteStore } from '../crypto/encrypted-sqlite.js';
import type { VaultEventLogWriter } from '../event-log/writer.js';
import type { VaultEventLogReader } from '../event-log/reader.js';
import type { VaultEventReadResult } from '../event-log/types.js';
import {
  computeVaultEventChainHash,
  mapRowRecord,
  rowToVaultEvent,
  signVaultEvent,
  VAULT_EVENT_GENESIS_HASH,
  type VaultEventLogRowRecord,
} from '../event-log/types.js';
import { projectDocumentsFromEvents } from '../projections/documents.js';
import { projectVectorsFromEvents } from '../projections/vector.js';
import { projectAgencyGraphFromEvents } from '../projections/agency-graph.js';
import {
  createDeletionCompletionTracker,
  initializeDeletionSchema,
  type DeletionCompletionTracker,
} from './completion.js';
import {
  createDeletionTombstoneInput,
  type CreateDeletionTombstoneOptions,
  type DeletionTombstoneAppendInput,
} from './tombstone.js';
import { REDACTED_PAYLOAD_CIPHERTEXT } from '../crypto/domain-keys.js';

export interface MinimizedDeletionProof {
  tombstoneEventId: string;
  deletionReceiptHash: string;
}

export interface VaultDeletionResult {
  tombstoneEventId: string;
  deletionReceiptHash: string;
  recordReference: string;
  redactedSourceEventIds: string[];
  destroyedContentKeys: Array<{ contentId: string; dataDomain: string }>;
  purgedBackupBlobKeys: string[];
  documentCount: number;
  vectorChunkCount: number;
  graphEntityCount: number;
  graphEdgeCount: number;
  graphSnapshotHash: string;
  proof: MinimizedDeletionProof;
}

export interface DeleteVaultContentOptions {
  entityId: string;
  entityType: CreateDeletionTombstoneOptions['entityType'];
  dataDomain: string;
  tombstoneEventId: string;
  deviceId: string;
  membershipEpoch: number;
  policyEpoch: number;
  sourceRefs: CreateDeletionTombstoneOptions['sourceRefs'];
  sensitivity: CreateDeletionTombstoneOptions['sensitivity'];
  occurredAt: string;
  sourceEventId?: string;
  authorizedDevices: string[];
  backupBlobKeys?: string[];
}

export interface VaultContentEraserOptions {
  db: Database.Database;
  rootKey: Buffer;
  writer: VaultEventLogWriter;
  reader: VaultEventLogReader;
  completionTracker?: DeletionCompletionTracker;
}

function parsePayload(payloadPlaintext: string): unknown {
  return JSON.parse(payloadPlaintext) as unknown;
}

export function decryptedEventsFromReadResults(
  results: VaultEventReadResult[],
): DecryptedVaultEvent[] {
  return results.map((entry) => ({
    sequence: entry.sequence,
    eventId: entry.event.eventId,
    eventType: entry.event.eventType,
    occurredAt: entry.event.occurredAt,
    sourceRefs: entry.event.sourceRefs,
    sensitivity: entry.event.sensitivity,
    payload: parsePayload(entry.payloadPlaintext),
  }));
}

export function readDecryptedEvents(params: {
  reader: VaultEventLogReader;
  grant: CapabilityGrantV1;
  principalId: string;
  nowMs: number;
}): DecryptedVaultEvent[] {
  const results = params.reader.readAll({
    grant: params.grant,
    principalId: params.principalId,
    nowMs: params.nowMs,
  });
  return decryptedEventsFromReadResults(results);
}

export class VaultContentEraser {
  private readonly db: Database.Database;
  private readonly domainKeys: DomainKeyStore;
  private readonly encryptedStore: EncryptedSqliteStore;
  private readonly writer: VaultEventLogWriter;
  private readonly reader: VaultEventLogReader;
  private readonly completionTracker: DeletionCompletionTracker;
  private readonly redactSourceEventStmt: Database.Statement;
  private readonly updateEventIntegrityStmt: Database.Statement;
  private readonly upsertMetaStmt: Database.Statement;
  private readonly insertReceiptStmt: Database.Statement;
  private readonly markContentKeyDestroyedStmt: Database.Statement;
  private readonly isContentKeyDestroyedStmt: Database.Statement;
  private readonly signingKey: Buffer;

  constructor(options: VaultContentEraserOptions) {
    this.db = options.db;
    this.domainKeys = new DomainKeyStore(options.rootKey);
    this.signingKey = deriveVaultSigningKey(options.rootKey);
    this.encryptedStore = new EncryptedSqliteStore(options.db, options.rootKey);
    this.writer = options.writer;
    this.reader = options.reader;
    this.completionTracker =
      options.completionTracker ?? createDeletionCompletionTracker(options.db);

    initializeDeletionSchema(this.db);

    this.redactSourceEventStmt = this.db.prepare(`
      UPDATE vault_event_log
      SET payload_ciphertext = ?, signature = ?, chain_hash = ?
      WHERE event_id = ?
    `);
    this.updateEventIntegrityStmt = this.db.prepare(`
      UPDATE vault_event_log
      SET signature = ?, chain_hash = ?
      WHERE sequence = ?
    `);
    this.upsertMetaStmt = this.db.prepare(`
      INSERT INTO vault_event_log_meta (id, event_count, tip_chain_hash, updated_at)
      VALUES (1, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        event_count = excluded.event_count,
        tip_chain_hash = excluded.tip_chain_hash,
        updated_at = excluded.updated_at
    `);
    this.insertReceiptStmt = this.db.prepare(`
      INSERT INTO vault_deletion_receipts (tombstone_event_id, deletion_receipt_hash, record_reference)
      VALUES (?, ?, ?)
      ON CONFLICT(tombstone_event_id) DO UPDATE SET
        deletion_receipt_hash = excluded.deletion_receipt_hash,
        record_reference = excluded.record_reference
    `);
    this.markContentKeyDestroyedStmt = this.db.prepare(`
      INSERT INTO vault_content_key_state (content_id, data_domain)
      VALUES (?, ?)
      ON CONFLICT(content_id, data_domain) DO UPDATE SET
        destroyed_at = datetime('now')
    `);
    this.isContentKeyDestroyedStmt = this.db.prepare(`
      SELECT 1 FROM vault_content_key_state
      WHERE content_id = ? AND data_domain = ?
    `);
  }

  isContentKeyDestroyed(contentId: string, dataDomain: string): boolean {
    return this.isContentKeyDestroyedStmt.get(contentId, dataDomain) !== undefined;
  }

  getMinimizedProof(tombstoneEventId: string): MinimizedDeletionProof | undefined {
    const row = this.db
      .prepare(
        `SELECT tombstone_event_id, deletion_receipt_hash
         FROM vault_deletion_receipts
         WHERE tombstone_event_id = ?`,
      )
      .get(tombstoneEventId) as
      | { tombstone_event_id: string; deletion_receipt_hash: string }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      tombstoneEventId: row.tombstone_event_id,
      deletionReceiptHash: row.deletion_receipt_hash,
    };
  }

  private findSourceEventsForEntity(
    events: DecryptedVaultEvent[],
    entityId: string,
    entityType: CreateDeletionTombstoneOptions['entityType'],
  ): DecryptedVaultEvent[] {
    if (entityType !== 'document') {
      return [];
    }

    return events.filter((event) => {
      if (event.eventType !== 'source_ingested') {
        return false;
      }
      const payload = event.payload as { documentId?: string } | null;
      return payload?.documentId === entityId;
    });
  }

  private redactSourceEvent(eventId: string): void {
    const rows = this.db
      .prepare(
        `SELECT sequence, event_id, data_domain, device_id, membership_epoch, event_type,
                source_refs_json, sensitivity, occurred_at, payload_ciphertext, signature, chain_hash
         FROM vault_event_log
         ORDER BY sequence ASC`,
      )
      .all() as VaultEventLogRowRecord[];

    let previousChainHash = VAULT_EVENT_GENESIS_HASH;
    let targetSequence: number | null = null;
    const updatedRows: Array<{ sequence: number; signature: string; chainHash: string }> = [];

    for (const rawRow of rows) {
      const row = mapRowRecord(rawRow);
      const payloadCiphertext =
        row.eventId === eventId ? REDACTED_PAYLOAD_CIPHERTEXT : row.payloadCiphertext;

      const unsignedEvent = {
        schemaVersion: 1 as const,
        eventId: row.eventId,
        deviceId: row.deviceId,
        membershipEpoch: row.membershipEpoch,
        eventType: row.eventType,
        sourceRefs: row.sourceRefs,
        sensitivity: row.sensitivity,
        occurredAt: row.occurredAt,
        payloadCiphertext,
      };

      const signature = signVaultEvent(unsignedEvent, this.signingKey);
      const chainHash = computeVaultEventChainHash(previousChainHash, {
        eventId: row.eventId,
        signature,
        payloadCiphertext,
      });

      updatedRows.push({ sequence: row.sequence, signature, chainHash });
      if (row.eventId === eventId) {
        targetSequence = row.sequence;
      }
      previousChainHash = chainHash;
    }

    if (targetSequence === null) {
      return;
    }

    const redactedRow = updatedRows.find((row) => row.sequence === targetSequence);
    if (!redactedRow) {
      return;
    }

    this.redactSourceEventStmt.run(
      REDACTED_PAYLOAD_CIPHERTEXT,
      redactedRow.signature,
      redactedRow.chainHash,
      eventId,
    );

    for (const row of updatedRows) {
      if (row.sequence <= targetSequence) {
        continue;
      }
      this.updateEventIntegrityStmt.run(row.signature, row.chainHash, row.sequence);
    }

    const tipChainHash = updatedRows.at(-1)?.chainHash;
    if (tipChainHash) {
      this.upsertMetaStmt.run(updatedRows.length, tipChainHash);
    }

    this.writer.resyncTipChainHash();
  }

  private destroyContentKey(contentId: string, dataDomain: string): void {
    this.markContentKeyDestroyedStmt.run(contentId, dataDomain);
    this.domainKeys.rotateDomainKey(`${dataDomain}:${contentId}`);
  }

  private purgeBackupBlobs(blobKeys: string[]): string[] {
    const purged: string[] = [];
    for (const blobKey of blobKeys) {
      const overwrite = createHash('sha256')
        .update(`purged:${blobKey}:${Date.now()}`)
        .digest();
      this.encryptedStore.put(blobKey, overwrite);
      purged.push(blobKey);
    }
    return purged;
  }

  deleteContent(
    options: DeleteVaultContentOptions,
    readParams: {
      grant: CapabilityGrantV1;
      principalId: string;
      nowMs: number;
    },
  ): VaultDeletionResult {
    const eventsBefore = readDecryptedEvents({
      reader: this.reader,
      grant: readParams.grant,
      principalId: readParams.principalId,
      nowMs: readParams.nowMs,
    });

    const sourceEvents = this.findSourceEventsForEntity(
      eventsBefore,
      options.entityId,
      options.entityType,
    );

    const tombstoneInput: DeletionTombstoneAppendInput = createDeletionTombstoneInput({
      eventId: options.tombstoneEventId,
      entityId: options.entityId,
      entityType: options.entityType,
      dataDomain: options.dataDomain,
      deviceId: options.deviceId,
      membershipEpoch: options.membershipEpoch,
      policyEpoch: options.policyEpoch,
      sourceRefs: options.sourceRefs,
      sensitivity: options.sensitivity,
      occurredAt: options.occurredAt,
      sourceEventId: options.sourceEventId ?? sourceEvents[0]?.eventId,
    });

    const redactedSourceEventIds: string[] = [];
    const destroyedContentKeys: Array<{ contentId: string; dataDomain: string }> = [];

    for (const sourceEvent of sourceEvents) {
      this.redactSourceEvent(sourceEvent.eventId);
      redactedSourceEventIds.push(sourceEvent.eventId);
      this.destroyContentKey(options.entityId, options.dataDomain);
      destroyedContentKeys.push({ contentId: options.entityId, dataDomain: options.dataDomain });
    }

    if (sourceEvents.length === 0) {
      this.destroyContentKey(options.entityId, options.dataDomain);
      destroyedContentKeys.push({ contentId: options.entityId, dataDomain: options.dataDomain });
    }

    const purgedBackupBlobKeys = this.purgeBackupBlobs(options.backupBlobKeys ?? []);

    this.writer.append({
      eventId: tombstoneInput.eventId,
      dataDomain: tombstoneInput.dataDomain,
      deviceId: tombstoneInput.deviceId,
      membershipEpoch: tombstoneInput.membershipEpoch,
      eventType: tombstoneInput.eventType,
      sourceRefs: tombstoneInput.sourceRefs,
      sensitivity: tombstoneInput.sensitivity,
      occurredAt: tombstoneInput.occurredAt,
      payloadPlaintext: tombstoneInput.payloadPlaintext,
    });

    this.insertReceiptStmt.run(
      tombstoneInput.eventId,
      tombstoneInput.deletionReceiptHash,
      tombstoneInput.recordReference,
    );

    this.completionTracker.registerAuthorizedDevices(
      tombstoneInput.eventId,
      options.authorizedDevices,
    );
    this.completionTracker.markDeviceComplete(tombstoneInput.eventId, options.deviceId);

    const eventsAfter = readDecryptedEvents({
      reader: this.reader,
      grant: readParams.grant,
      principalId: readParams.principalId,
      nowMs: readParams.nowMs,
    });

    const documents = projectDocumentsFromEvents(eventsAfter);
    const vectors = projectVectorsFromEvents(eventsAfter);
    const graphDelta = projectAgencyGraphFromEvents(eventsAfter);
    const graphStore = createAgencyGraphStore();
    const graphSnapshot = graphStore.rebuild(eventsAfter);

    return {
      tombstoneEventId: tombstoneInput.eventId,
      deletionReceiptHash: tombstoneInput.deletionReceiptHash,
      recordReference: tombstoneInput.recordReference,
      redactedSourceEventIds,
      destroyedContentKeys,
      purgedBackupBlobKeys,
      documentCount: documents.documentCount,
      vectorChunkCount: vectors.chunkCount,
      graphEntityCount: graphSnapshot.entityCount,
      graphEdgeCount: graphSnapshot.edgeCount,
      graphSnapshotHash: graphSnapshot.snapshotHash,
      proof: {
        tombstoneEventId: tombstoneInput.eventId,
        deletionReceiptHash: tombstoneInput.deletionReceiptHash,
      },
    };
  }
}

export function createVaultContentEraser(options: VaultContentEraserOptions): VaultContentEraser {
  return new VaultContentEraser(options);
}

export function attemptDecryptRedactedPayload(
  domainKeys: DomainKeyStore,
  dataDomain: string,
  payloadCiphertext: string,
): boolean {
  if (payloadCiphertext === REDACTED_PAYLOAD_CIPHERTEXT) {
    return false;
  }
  try {
    domainKeys.decryptPayload(dataDomain, payloadCiphertext);
    return true;
  } catch {
    return false;
  }
}
