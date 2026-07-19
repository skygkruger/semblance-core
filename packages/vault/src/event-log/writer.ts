import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { DomainKeyStore, deriveVaultSigningKey } from '../crypto/domain-keys.js';
import { initializeVaultEventLogSchema } from '../crypto/encrypted-sqlite.js';
import { VaultEventLogError } from './errors.js';
import {
  computeVaultEventChainHash,
  signVaultEvent,
  VAULT_EVENT_GENESIS_HASH,
  type VaultEventAppendInput,
} from './types.js';

const activeWriters = new Set<string>();

export interface VaultEventLogWriterOptions {
  db: Database.Database;
  rootKey: Buffer;
  writerId?: string;
}

export interface VaultEventAppendResult {
  sequence: number;
  eventId: string;
  chainHash: string;
}

export class VaultEventLogWriter {
  private readonly db: Database.Database;
  private readonly domainKeys: DomainKeyStore;
  private readonly signingKey: Buffer;
  private readonly writerId: string;
  private readonly lockKey: string;
  private readonly insertStmt: Database.Statement;
  private readonly selectTipStmt: Database.Statement;
  private readonly upsertMetaStmt: Database.Statement;
  private released = false;
  private tipChainHash: string = VAULT_EVENT_GENESIS_HASH;

  constructor(options: VaultEventLogWriterOptions) {
    this.db = options.db;
    this.domainKeys = new DomainKeyStore(options.rootKey);
    this.signingKey = deriveVaultSigningKey(options.rootKey);
    this.writerId = options.writerId ?? randomUUID();
    this.lockKey = String(this.db.name ?? ':memory:');

    if (activeWriters.has(this.lockKey)) {
      throw new VaultEventLogError(
        'WRITER_ALREADY_ACTIVE',
        `Vault event log writer already active for "${this.lockKey}"`,
      );
    }

    initializeVaultEventLogSchema(this.db);
    this.acquireWriterLock();

    this.insertStmt = this.db.prepare(`
      INSERT INTO vault_event_log (
        event_id, data_domain, device_id, membership_epoch, event_type,
        source_refs_json, sensitivity, occurred_at, payload_ciphertext, signature, chain_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.selectTipStmt = this.db.prepare(
      'SELECT chain_hash FROM vault_event_log ORDER BY sequence DESC LIMIT 1',
    );
    this.upsertMetaStmt = this.db.prepare(`
      INSERT INTO vault_event_log_meta (id, event_count, tip_chain_hash, updated_at)
      VALUES (1, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        event_count = excluded.event_count,
        tip_chain_hash = excluded.tip_chain_hash,
        updated_at = excluded.updated_at
    `);

    const tip = this.selectTipStmt.get() as { chain_hash: string } | undefined;
    if (tip) {
      this.tipChainHash = tip.chain_hash;
    }
  }

  private acquireWriterLock(): void {
    activeWriters.add(this.lockKey);
    try {
      this.db.prepare(
        'INSERT INTO vault_writer_lock (id, holder_id, acquired_at) VALUES (1, ?, datetime(\'now\'))',
      ).run(this.writerId);
    } catch (error) {
      activeWriters.delete(this.lockKey);
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('UNIQUE') || message.includes('constraint')) {
        throw new VaultEventLogError(
          'WRITER_ALREADY_ACTIVE',
          `Vault event log writer lock already held for "${this.lockKey}"`,
        );
      }
      throw error;
    }
  }

  append(input: VaultEventAppendInput): VaultEventAppendResult {
    if (this.released) {
      throw new Error('Vault event log writer has been released');
    }

    const payloadCiphertext = this.domainKeys.encryptPayload(input.dataDomain, input.payloadPlaintext);

    const unsignedEvent = {
      schemaVersion: 1 as const,
      eventId: input.eventId,
      deviceId: input.deviceId,
      membershipEpoch: input.membershipEpoch,
      eventType: input.eventType,
      sourceRefs: input.sourceRefs,
      sensitivity: input.sensitivity,
      occurredAt: input.occurredAt,
      payloadCiphertext,
    };

    const signature = signVaultEvent(unsignedEvent, this.signingKey);
    const chainHash = computeVaultEventChainHash(this.tipChainHash, {
      eventId: input.eventId,
      signature,
      payloadCiphertext,
    });

    try {
      const result = this.insertStmt.run(
        input.eventId,
        input.dataDomain,
        input.deviceId,
        input.membershipEpoch,
        input.eventType,
        JSON.stringify(input.sourceRefs),
        input.sensitivity,
        input.occurredAt,
        payloadCiphertext,
        signature,
        chainHash,
      );

      this.tipChainHash = chainHash;
      this.upsertMetaStmt.run(Number(result.lastInsertRowid), chainHash);

      return {
        sequence: Number(result.lastInsertRowid),
        eventId: input.eventId,
        chainHash,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('UNIQUE') || message.includes('constraint')) {
        throw new VaultEventLogError(
          'DUPLICATE_EVENT_ID',
          `Event ID "${input.eventId}" already exists in the vault event log`,
        );
      }
      throw error;
    }
  }

  getTipChainHash(): string {
    return this.tipChainHash;
  }

  release(): void {
    if (this.released) {
      return;
    }

    this.db.prepare('DELETE FROM vault_writer_lock WHERE id = 1 AND holder_id = ?').run(this.writerId);
    activeWriters.delete(this.lockKey);
    this.released = true;
  }
}

export function createVaultEventLogWriter(options: VaultEventLogWriterOptions): VaultEventLogWriter {
  return new VaultEventLogWriter(options);
}
