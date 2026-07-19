import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { EncryptedEventEnvelopeV1, SyncEnvelopeV1 } from '@semblance/protocol';
import { EncryptedEventEnvelopeV1 as EncryptedEventEnvelopeSchema } from '@semblance/protocol';
import type { SyncAuditEntry, SyncCheckpoint } from './types.js';
import type { MergeableEvent } from './merge.js';

const EVENT_STORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS sync_vault_events (
  event_id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  membership_epoch INTEGER NOT NULL,
  lamport_clock INTEGER NOT NULL,
  vector_clock_json TEXT NOT NULL,
  causal_parent_ids_json TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  plaintext_json TEXT,
  conflict_group_id TEXT,
  is_conflict_duplicate INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_audit_entries (
  sequence INTEGER PRIMARY KEY,
  operation TEXT NOT NULL,
  event_ids_json TEXT NOT NULL,
  prior_chain_hash TEXT NOT NULL,
  chain_hash TEXT NOT NULL,
  device_signature TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_checkpoints (
  checkpoint_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  audit_chain_hash TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  membership_epoch INTEGER NOT NULL,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_vault_events_domain ON sync_vault_events(domain_id);
CREATE INDEX IF NOT EXISTS idx_sync_vault_events_lamport ON sync_vault_events(lamport_clock);
`;

export class SyncEventStore {
  private readonly db: Database.Database;

  constructor(private readonly dbPath: string) {
    const dir = join(dbPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(EVENT_STORE_SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  saveEnvelope(envelope: EncryptedEventEnvelopeV1, plaintextJson?: string): void {
    const parsed = EncryptedEventEnvelopeSchema.parse(envelope);
    this.db
      .prepare(
        `INSERT INTO sync_vault_events (
          event_id, domain_id, device_id, membership_epoch, lamport_clock,
          vector_clock_json, causal_parent_ids_json, envelope_json, plaintext_json,
          conflict_group_id, is_conflict_duplicate, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET
          envelope_json = excluded.envelope_json,
          plaintext_json = COALESCE(excluded.plaintext_json, sync_vault_events.plaintext_json),
          conflict_group_id = excluded.conflict_group_id,
          is_conflict_duplicate = excluded.is_conflict_duplicate`,
      )
      .run(
        parsed.eventId,
        parsed.domainId,
        parsed.deviceId,
        parsed.membershipEpoch,
        parsed.lamportClock,
        JSON.stringify(parsed.vectorClock),
        JSON.stringify(parsed.causalParentIds),
        JSON.stringify(parsed),
        plaintextJson ?? null,
        null,
        0,
        new Date().toISOString(),
      );
  }

  saveMergedEvent(event: MergeableEvent & { conflictGroupId?: string | null; isConflictDuplicate?: boolean }): void {
    this.db
      .prepare(
        `INSERT INTO sync_vault_events (
          event_id, domain_id, device_id, membership_epoch, lamport_clock,
          vector_clock_json, causal_parent_ids_json, envelope_json, plaintext_json,
          conflict_group_id, is_conflict_duplicate, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET
          plaintext_json = excluded.plaintext_json,
          conflict_group_id = excluded.conflict_group_id,
          is_conflict_duplicate = excluded.is_conflict_duplicate`,
      )
      .run(
        event.eventId,
        event.domainId,
        event.deviceId,
        event.membershipEpoch,
        event.lamportClock,
        JSON.stringify(event.vectorClock),
        JSON.stringify(event.causalParentIds),
        JSON.stringify({ eventId: event.eventId }),
        JSON.stringify(event.plaintext),
        event.conflictGroupId ?? null,
        event.isConflictDuplicate ? 1 : 0,
        new Date().toISOString(),
      );
  }

  listMergeableEvents(): MergeableEvent[] {
    const rows = this.db
      .prepare(
        `SELECT event_id, domain_id, device_id, membership_epoch, lamport_clock,
                vector_clock_json, causal_parent_ids_json, plaintext_json
         FROM sync_vault_events
         ORDER BY lamport_clock ASC, event_id ASC`,
      )
      .all() as Array<{
        event_id: string;
        domain_id: string;
        device_id: string;
        membership_epoch: number;
        lamport_clock: number;
        vector_clock_json: string;
        causal_parent_ids_json: string;
        plaintext_json: string | null;
      }>;

    return rows
      .filter((row) => row.plaintext_json !== null)
      .map((row) => ({
        eventId: row.event_id,
        domainId: row.domain_id,
        deviceId: row.device_id,
        membershipEpoch: row.membership_epoch,
        lamportClock: row.lamport_clock,
        vectorClock: JSON.parse(row.vector_clock_json) as Record<string, number>,
        causalParentIds: JSON.parse(row.causal_parent_ids_json) as string[],
        plaintext: JSON.parse(row.plaintext_json!) as MergeableEvent['plaintext'],
      }));
  }

  listEnvelopes(): EncryptedEventEnvelopeV1[] {
    const rows = this.db
      .prepare(`SELECT envelope_json FROM sync_vault_events ORDER BY lamport_clock ASC`)
      .all() as Array<{ envelope_json: string }>;

    return rows.map((row) => EncryptedEventEnvelopeSchema.parse(JSON.parse(row.envelope_json)));
  }

  listEnvelopesSince(lamportClock: number): EncryptedEventEnvelopeV1[] {
    const rows = this.db
      .prepare(
        `SELECT envelope_json FROM sync_vault_events
         WHERE lamport_clock > ?
         ORDER BY lamport_clock ASC`,
      )
      .all(lamportClock) as Array<{ envelope_json: string }>;

    return rows.map((row) => EncryptedEventEnvelopeSchema.parse(JSON.parse(row.envelope_json)));
  }

  getMaxLamportClock(): number {
    const row = this.db
      .prepare(`SELECT MAX(lamport_clock) AS max_lamport FROM sync_vault_events`)
      .get() as { max_lamport: number | null } | undefined;
    return row?.max_lamport ?? 0;
  }

  countEvents(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM sync_vault_events`).get() as { count: number };
    return row.count;
  }

  appendAuditEntry(entry: SyncAuditEntry): void {
    this.db
      .prepare(
        `INSERT INTO sync_audit_entries (
          sequence, operation, event_ids_json, prior_chain_hash,
          chain_hash, device_signature, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.sequence,
        entry.operation,
        JSON.stringify([...entry.eventIds]),
        entry.priorChainHash,
        entry.chainHash,
        entry.deviceSignature,
        entry.occurredAt,
      );
  }

  listAuditEntries(): SyncAuditEntry[] {
    const rows = this.db
      .prepare(
        `SELECT sequence, operation, event_ids_json, prior_chain_hash,
                chain_hash, device_signature, occurred_at
         FROM sync_audit_entries ORDER BY sequence ASC`,
      )
      .all() as Array<{
        sequence: number;
        operation: SyncAuditEntry['operation'];
        event_ids_json: string;
        prior_chain_hash: string;
        chain_hash: string;
        device_signature: string;
        occurred_at: string;
      }>;

    return rows.map((row) => ({
      sequence: row.sequence,
      operation: row.operation,
      eventIds: JSON.parse(row.event_ids_json) as string[],
      priorChainHash: row.prior_chain_hash,
      chainHash: row.chain_hash,
      deviceSignature: row.device_signature,
      occurredAt: row.occurred_at,
    }));
  }

  saveCheckpoint(checkpoint: SyncCheckpoint): void {
    this.db
      .prepare(
        `INSERT INTO sync_checkpoints (
          checkpoint_id, device_id, audit_chain_hash, event_count,
          membership_epoch, signature, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        checkpoint.checkpointId,
        checkpoint.deviceId,
        checkpoint.auditChainHash,
        checkpoint.eventCount,
        checkpoint.membershipEpoch,
        checkpoint.signature,
        checkpoint.createdAt,
      );
  }

  getLatestCheckpoint(): SyncCheckpoint | null {
    const row = this.db
      .prepare(
        `SELECT checkpoint_id, device_id, audit_chain_hash, event_count,
                membership_epoch, signature, created_at
         FROM sync_checkpoints ORDER BY created_at DESC LIMIT 1`,
      )
      .get() as
      | {
          checkpoint_id: string;
          device_id: string;
          audit_chain_hash: string;
          event_count: number;
          membership_epoch: number;
          signature: string;
          created_at: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      checkpointId: row.checkpoint_id,
      deviceId: row.device_id,
      auditChainHash: row.audit_chain_hash,
      eventCount: row.event_count,
      membershipEpoch: row.membership_epoch,
      signature: row.signature,
      createdAt: row.created_at,
    };
  }

  wrapOutgoing(envelope: EncryptedEventEnvelopeV1): SyncEnvelopeV1 {
    return {
      schemaVersion: 1,
      envelopeKind: 'encrypted_event',
      payload: EncryptedEventEnvelopeSchema.parse(envelope),
    };
  }
}

export function openSyncEventStore(dataDir: string): SyncEventStore {
  const syncDir = join(dataDir, 'sync');
  if (!existsSync(syncDir)) {
    mkdirSync(syncDir, { recursive: true });
  }
  return new SyncEventStore(join(syncDir, 'events.db'));
}
