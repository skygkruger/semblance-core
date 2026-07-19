import type Database from 'better-sqlite3';
import { deriveVaultSigningKey } from '../crypto/domain-keys.js';
import { VaultEventLogError } from './errors.js';
import {
  computeVaultEventChainHash,
  mapRowRecord,
  rowToVaultEvent,
  VAULT_EVENT_GENESIS_HASH,
  verifyVaultEventSignature,
  type VaultEventLogRowRecord,
} from './types.js';

export type VaultEventIntegrityIssue =
  | 'duplicate_event_id'
  | 'sequence_gap'
  | 'sequence_reordered'
  | 'chain_hash_invalid'
  | 'signature_invalid'
  | 'truncated';

export interface VaultEventIntegrityReport {
  valid: boolean;
  issues: Array<{
    issue: VaultEventIntegrityIssue;
    sequence?: number;
    eventId?: string;
    message: string;
  }>;
  eventCount: number;
  tipChainHash: string | null;
}

export function verifyVaultEventLogIntegrity(
  db: Database.Database,
  rootKey: Buffer,
): VaultEventIntegrityReport {
  const signingKey = deriveVaultSigningKey(rootKey);
  const rows = db
    .prepare(
      `SELECT sequence, event_id, data_domain, device_id, membership_epoch, event_type,
              source_refs_json, sensitivity, occurred_at, payload_ciphertext, signature, chain_hash
       FROM vault_event_log
       ORDER BY sequence ASC`,
    )
    .all() as VaultEventLogRowRecord[];

  const issues: VaultEventIntegrityReport['issues'] = [];

  if (rows.length === 0) {
    return {
      valid: true,
      issues,
      eventCount: 0,
      tipChainHash: null,
    };
  }

  const seenEventIds = new Set<string>();
  let expectedSequence = 1;
  let previousChainHash = VAULT_EVENT_GENESIS_HASH;

  for (const rawRow of rows) {
    const row = mapRowRecord(rawRow);

    if (seenEventIds.has(row.eventId)) {
      issues.push({
        issue: 'duplicate_event_id',
        sequence: row.sequence,
        eventId: row.eventId,
        message: `Duplicate event ID "${row.eventId}"`,
      });
    }
    seenEventIds.add(row.eventId);

    if (row.sequence !== expectedSequence) {
      issues.push({
        issue: row.sequence < expectedSequence ? 'sequence_reordered' : 'sequence_gap',
        sequence: row.sequence,
        eventId: row.eventId,
        message: `Expected sequence ${expectedSequence}, found ${row.sequence}`,
      });
    }
    expectedSequence = row.sequence + 1;

    const event = rowToVaultEvent(row);
    if (!verifyVaultEventSignature(event, signingKey)) {
      issues.push({
        issue: 'signature_invalid',
        sequence: row.sequence,
        eventId: row.eventId,
        message: `Signature invalid for event "${row.eventId}"`,
      });
    }

    const expectedChainHash = computeVaultEventChainHash(previousChainHash, event);
    if (row.chainHash !== expectedChainHash) {
      issues.push({
        issue: 'chain_hash_invalid',
        sequence: row.sequence,
        eventId: row.eventId,
        message: `Chain hash mismatch for event "${row.eventId}"`,
      });
    }

    previousChainHash = row.chainHash;
  }

  const maxRow = db
    .prepare('SELECT MAX(sequence) AS max_sequence, COUNT(*) AS total FROM vault_event_log')
    .get() as { max_sequence: number | null; total: number };

  if (maxRow.max_sequence !== null && maxRow.max_sequence !== maxRow.total) {
    issues.push({
      issue: 'sequence_gap',
      message: `Sequence max ${maxRow.max_sequence} does not match row count ${maxRow.total}`,
    });
  }

  const meta = db
    .prepare('SELECT event_count, tip_chain_hash FROM vault_event_log_meta WHERE id = 1')
    .get() as { event_count: number; tip_chain_hash: string } | undefined;

  if (meta) {
    if (meta.event_count !== maxRow.total) {
      issues.push({
        issue: 'truncated',
        message: `Stored event count ${meta.event_count} does not match current row count ${maxRow.total}`,
      });
    }

    const tipChainHash = rows.at(-1)?.chain_hash ?? null;
    if (tipChainHash !== null && meta.tip_chain_hash !== tipChainHash) {
      issues.push({
        issue: 'truncated',
        message: 'Stored tip chain hash does not match the current log tip',
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    eventCount: rows.length,
    tipChainHash: rows.at(-1)?.chain_hash ?? null,
  };
}

export function assertVaultEventLogIntegrity(
  db: Database.Database,
  rootKey: Buffer,
): VaultEventIntegrityReport {
  const report = verifyVaultEventLogIntegrity(db, rootKey);
  if (!report.valid) {
    const firstIssue = report.issues[0];
    throw new VaultEventLogError(
      'INTEGRITY_FAILURE',
      firstIssue
        ? `${firstIssue.issue}: ${firstIssue.message}`
        : 'Vault event log integrity verification failed',
    );
  }
  return report;
}

export function detectTruncatedVaultEventLog(
  db: Database.Database,
  expectedEventCount: number,
): boolean {
  const row = db.prepare('SELECT COUNT(*) AS total FROM vault_event_log').get() as { total: number };
  return row.total < expectedEventCount;
}
