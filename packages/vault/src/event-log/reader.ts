import type Database from 'better-sqlite3';
import type { CapabilityGrantV1 } from '@semblance/protocol';
import { assertVaultCapability, type VaultCapabilityGuardContext } from '../capabilities/guard.js';
import { DomainKeyStore, REDACTED_PAYLOAD_CIPHERTEXT } from '../crypto/domain-keys.js';
import { initializeVaultEventLogSchema } from '../crypto/encrypted-sqlite.js';
import { VaultEventLogError } from './errors.js';
import { assertVaultEventLogIntegrity } from './integrity.js';
import {
  mapRowRecord,
  rowToVaultEvent,
  type VaultEventLogRowRecord,
  type VaultEventReadResult,
} from './types.js';

export type VaultEventReadGuard = (
  grant: CapabilityGrantV1,
  operation: string,
  context: VaultCapabilityGuardContext,
) => void;

export interface VaultEventLogReaderOptions {
  db: Database.Database;
  rootKey: Buffer;
  guard?: VaultEventReadGuard;
}

export class VaultEventLogReader {
  private readonly db: Database.Database;
  private readonly rootKey: Buffer;
  private readonly domainKeys: DomainKeyStore;
  private readonly guard: VaultEventReadGuard;

  constructor(options: VaultEventLogReaderOptions) {
    this.db = options.db;
    this.rootKey = options.rootKey;
    this.domainKeys = new DomainKeyStore(options.rootKey);
    this.guard = options.guard ?? assertVaultCapability;
    initializeVaultEventLogSchema(this.db);
  }

  readAll(params: {
    grant: CapabilityGrantV1;
    principalId: string;
    nowMs: number;
    verifyIntegrity?: boolean;
  }): VaultEventReadResult[] {
    if (params.verifyIntegrity !== false) {
      assertVaultEventLogIntegrity(this.db, this.rootKey);
    }

    const rows = this.db
      .prepare(
        `SELECT sequence, event_id, data_domain, device_id, membership_epoch, event_type,
                source_refs_json, sensitivity, occurred_at, payload_ciphertext, signature, chain_hash
         FROM vault_event_log
         ORDER BY sequence ASC`,
      )
      .all() as VaultEventLogRowRecord[];

    return rows.map((row) => this.readRow(row, params.grant, params.principalId, params.nowMs));
  }

  readFromSequence(params: {
    grant: CapabilityGrantV1;
    principalId: string;
    nowMs: number;
    fromSequence: number;
    limit?: number;
  }): VaultEventReadResult[] {
    const limit = params.limit ?? 100;
    const rows = this.db
      .prepare(
        `SELECT sequence, event_id, data_domain, device_id, membership_epoch, event_type,
                source_refs_json, sensitivity, occurred_at, payload_ciphertext, signature, chain_hash
         FROM vault_event_log
         WHERE sequence >= ?
         ORDER BY sequence ASC
         LIMIT ?`,
      )
      .all(params.fromSequence, limit) as VaultEventLogRowRecord[];

    return rows.map((row) => this.readRow(row, params.grant, params.principalId, params.nowMs));
  }

  private readRow(
    rawRow: VaultEventLogRowRecord,
    grant: CapabilityGrantV1,
    principalId: string,
    nowMs: number,
  ): VaultEventReadResult {
    const row = mapRowRecord(rawRow);

    try {
      this.guard(grant, 'vault.read', {
        principalId,
        dataDomain: row.dataDomain,
        sensitivity: row.sensitivity,
        resultLimit: 1,
        nowMs,
      });
    } catch (error) {
      throw new VaultEventLogError(
        'CAPABILITY_DENIED',
        error instanceof Error ? error.message : 'Vault read capability denied',
      );
    }

    const event = rowToVaultEvent(row);
    const payloadPlaintext =
      row.payloadCiphertext === REDACTED_PAYLOAD_CIPHERTEXT
        ? JSON.stringify({ schemaVersion: 1, redacted: true })
        : this.domainKeys.decryptPayload(row.dataDomain, row.payloadCiphertext);

    return {
      sequence: row.sequence,
      event,
      payloadPlaintext,
      dataDomain: row.dataDomain,
      chainHash: row.chainHash,
    };
  }
}

export function createVaultEventLogReader(options: VaultEventLogReaderOptions): VaultEventLogReader {
  return new VaultEventLogReader(options);
}
