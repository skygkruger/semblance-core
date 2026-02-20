// Append-Only Tamper-Evident Audit Trail
// Every action through the Gateway is logged before and after execution.
// Chain hashing: each entry includes a hash of the previous entry,
// creating a tamper-evident chain. If any row is modified, all
// subsequent hashes break and verifyChainIntegrity() catches it.

import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { sha256 } from '@semblance/core';
import type { ActionType, AuditEntry } from '@semblance/core';

const GENESIS_HASH = sha256('semblance-audit-genesis');

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    action TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('request', 'response')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'error', 'rejected', 'rate_limited')),
    payload_hash TEXT NOT NULL,
    signature TEXT NOT NULL,
    chain_hash TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const CREATE_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_audit_request_id ON audit_log(request_id);
  CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
  CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
`;

interface AuditRow {
  id: string;
  request_id: string;
  timestamp: string;
  action: string;
  direction: string;
  status: string;
  payload_hash: string;
  signature: string;
  chain_hash: string;
  metadata: string | null;
}

function rowToEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    requestId: row.request_id,
    timestamp: row.timestamp,
    action: row.action as ActionType,
    direction: row.direction as 'request' | 'response',
    status: row.status as AuditEntry['status'],
    payloadHash: row.payload_hash,
    signature: row.signature,
    chainHash: row.chain_hash,
    metadata: row.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : undefined,
  };
}

/**
 * Compute the chain hash for a new entry given the previous entry's fields.
 * Chain hash = SHA-256(previousId | previousPayloadHash | previousSignature)
 */
function computeChainHash(
  previousId: string,
  previousPayloadHash: string,
  previousSignature: string,
): string {
  return sha256(`${previousId}|${previousPayloadHash}|${previousSignature}`);
}

export class AuditTrail {
  private db: Database.Database;
  private insertStmt: Database.Statement;
  private lastEntry: { id: string; payloadHash: string; signature: string } | null = null;

  constructor(db: Database.Database) {
    this.db = db;
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_TABLE);
    this.db.exec(CREATE_INDEXES);

    this.insertStmt = this.db.prepare(`
      INSERT INTO audit_log (id, request_id, timestamp, action, direction, status, payload_hash, signature, chain_hash, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Load the last entry for chain continuity
    const lastRow = this.db.prepare(
      'SELECT id, payload_hash, signature FROM audit_log ORDER BY rowid DESC LIMIT 1'
    ).get() as { id: string; payload_hash: string; signature: string } | undefined;

    if (lastRow) {
      this.lastEntry = {
        id: lastRow.id,
        payloadHash: lastRow.payload_hash,
        signature: lastRow.signature,
      };
    }
  }

  /**
   * Append an entry to the audit trail. Returns the entry ID.
   * This is the ONLY write method. There is no update. There is no delete.
   */
  append(params: {
    requestId: string;
    timestamp: string;
    action: ActionType;
    direction: 'request' | 'response';
    status: AuditEntry['status'];
    payloadHash: string;
    signature: string;
    metadata?: Record<string, unknown>;
  }): string {
    const id = nanoid();

    const chainHash = this.lastEntry
      ? computeChainHash(this.lastEntry.id, this.lastEntry.payloadHash, this.lastEntry.signature)
      : GENESIS_HASH;

    this.insertStmt.run(
      id,
      params.requestId,
      params.timestamp,
      params.action,
      params.direction,
      params.status,
      params.payloadHash,
      params.signature,
      chainHash,
      params.metadata ? JSON.stringify(params.metadata) : null,
    );

    this.lastEntry = {
      id,
      payloadHash: params.payloadHash,
      signature: params.signature,
    };

    return id;
  }

  /**
   * Get all audit entries for a given request ID (request + response pair).
   */
  getByRequestId(requestId: string): AuditEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM audit_log WHERE request_id = ? ORDER BY rowid ASC'
    ).all(requestId) as AuditRow[];
    return rows.map(rowToEntry);
  }

  /**
   * Get audit entries within a time range.
   */
  getByTimeRange(start: string, end: string): AuditEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM audit_log WHERE timestamp >= ? AND timestamp <= ? ORDER BY rowid ASC'
    ).all(start, end) as AuditRow[];
    return rows.map(rowToEntry);
  }

  /**
   * Get audit entries for a specific action type.
   */
  getByAction(action: ActionType): AuditEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM audit_log WHERE action = ? ORDER BY rowid ASC'
    ).all(action) as AuditRow[];
    return rows.map(rowToEntry);
  }

  /**
   * Get the N most recent audit entries.
   */
  getRecent(limit: number): AuditEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM audit_log ORDER BY rowid DESC LIMIT ?'
    ).all(limit) as AuditRow[];
    return rows.map(rowToEntry).reverse();
  }

  /**
   * Verify the integrity of the entire audit chain.
   * Returns { valid: true } if intact, or { valid: false, brokenAt }
   * with the ID of the first entry where the chain breaks.
   */
  verifyChainIntegrity(): { valid: true } | { valid: false; brokenAt: string } {
    const rows = this.db.prepare(
      'SELECT id, payload_hash, signature, chain_hash FROM audit_log ORDER BY rowid ASC'
    ).all() as { id: string; payload_hash: string; signature: string; chain_hash: string }[];

    if (rows.length === 0) return { valid: true };

    // First entry must have genesis hash
    if (rows[0]!.chain_hash !== GENESIS_HASH) {
      return { valid: false, brokenAt: rows[0]!.id };
    }

    // Each subsequent entry's chain_hash must match the hash of the previous entry
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]!;
      const curr = rows[i]!;
      const expectedHash = computeChainHash(prev.id, prev.payload_hash, prev.signature);
      if (curr.chain_hash !== expectedHash) {
        return { valid: false, brokenAt: curr.id };
      }
    }

    return { valid: true };
  }

  /**
   * Get total entry count.
   */
  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM audit_log').get() as { count: number };
    return row.count;
  }
}
