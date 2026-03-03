// Merkle Chain — Tamper-evident integrity verification for the audit trail.
//
// Each day's audit entries are hashed into a Merkle tree. Each day's root
// chains the previous day's root, forming an append-only integrity chain.
// Signed daily receipts provide exportable cryptographic proof.
//
// CRITICAL: No networking imports. Pure computation only.

import type { DatabaseHandle } from '../platform/types.js';
import { sha256 } from '../types/signing.js';
import { sign, verify, generateKeyPair } from '../crypto/ed25519.js';
import type { AuditEntry } from '../types/audit.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DailyMerkleRoot {
  date: string;           // ISO date (YYYY-MM-DD)
  merkleRoot: string;     // SHA-256 hex
  previousRoot: string;   // Previous day's merkleRoot (empty string for genesis)
  entryCount: number;     // Number of audit entries for this day
  chainedHash: string;    // SHA-256(merkleRoot + previousRoot) — the chain link
}

export interface ChainVerificationResult {
  valid: boolean;
  firstBreak?: string;    // ISO date of first broken link, if any
  entryCount: number;     // Total entries verified
  daysVerified: number;
}

export interface SignedDailyReceipt {
  date: string;
  merkleRoot: string;
  chainedHash: string;
  entryCount: number;
  signature: string;      // Ed25519 signature over the receipt payload (hex)
  publicKeyFingerprint: string;
  timestamp: string;      // ISO timestamp of receipt generation
}

// ─── Canonical JSON ────────────────────────────────────────────────────────

/**
 * Canonical JSON serialization — sorted keys, no whitespace.
 * Ensures consistent hashing regardless of property insertion order.
 */
export function canonicalJSON(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalJSON(item)).join(',') + ']';
  }
  if (typeof obj === 'object') {
    const sorted = Object.keys(obj as Record<string, unknown>).sort();
    const entries = sorted.map(key =>
      JSON.stringify(key) + ':' + canonicalJSON((obj as Record<string, unknown>)[key])
    );
    return '{' + entries.join(',') + '}';
  }
  return String(obj);
}

// ─── Merkle Tree Construction ──────────────────────────────────────────────

/**
 * Compute the SHA-256 hash of a single audit entry using canonical JSON.
 */
function hashEntry(entry: AuditEntry): string {
  return sha256(canonicalJSON(entry));
}

/**
 * Build a Merkle tree from an array of leaf hashes.
 * Returns the root hash, or empty string if no leaves.
 * If odd number of leaves, duplicate the last leaf.
 */
export function buildMerkleRoot(leafHashes: string[]): string {
  if (leafHashes.length === 0) return '';

  let level = [...leafHashes];

  while (level.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = i + 1 < level.length ? level[i + 1]! : left; // Duplicate last if odd
      nextLevel.push(sha256(left + right));
    }
    level = nextLevel;
  }

  return level[0]!;
}

// ─── Database Schema ───────────────────────────────────────────────────────

const CREATE_MERKLE_TABLE = `
  CREATE TABLE IF NOT EXISTS merkle_chain (
    date TEXT PRIMARY KEY,
    merkle_root TEXT NOT NULL,
    previous_root TEXT NOT NULL,
    entry_count INTEGER NOT NULL,
    chained_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

interface MerkleRow {
  date: string;
  merkle_root: string;
  previous_root: string;
  entry_count: number;
  chained_hash: string;
}

// ─── MerkleChain Class ─────────────────────────────────────────────────────

export class MerkleChain {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.db.exec(CREATE_MERKLE_TABLE);
  }

  /**
   * Build the daily Merkle tree for a given date.
   * Reads all audit trail entries for that date, builds the tree,
   * and chains to the previous day's root.
   */
  buildDailyMerkleTree(date: string): DailyMerkleRoot {
    // Get all audit entries for this date (entries whose timestamp starts with the date)
    const entries = this.db.prepare(
      `SELECT * FROM audit_log WHERE timestamp LIKE ? ORDER BY rowid ASC`
    ).all(`${date}%`) as Array<{
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
      estimated_time_saved_seconds: number;
    }>;

    // Convert to AuditEntry for hashing
    const auditEntries: AuditEntry[] = entries.map(row => ({
      id: row.id,
      requestId: row.request_id,
      timestamp: row.timestamp,
      action: row.action as AuditEntry['action'],
      direction: row.direction as 'request' | 'response',
      status: row.status as AuditEntry['status'],
      payloadHash: row.payload_hash,
      signature: row.signature,
      chainHash: row.chain_hash,
      metadata: row.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : undefined,
      estimatedTimeSavedSeconds: row.estimated_time_saved_seconds,
    }));

    // Hash each entry
    const leafHashes = auditEntries.map(hashEntry);
    const merkleRoot = buildMerkleRoot(leafHashes);

    // Get previous day's root
    const prevRow = this.db.prepare(
      `SELECT merkle_root FROM merkle_chain WHERE date < ? ORDER BY date DESC LIMIT 1`
    ).get(date) as { merkle_root: string } | undefined;
    const previousRoot = prevRow?.merkle_root ?? '';

    // Compute chained hash
    const chainedHash = sha256(merkleRoot + previousRoot);

    // Upsert into merkle_chain
    this.db.prepare(`
      INSERT OR REPLACE INTO merkle_chain (date, merkle_root, previous_root, entry_count, chained_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(date, merkleRoot, previousRoot, auditEntries.length, chainedHash);

    return {
      date,
      merkleRoot,
      previousRoot,
      entryCount: auditEntries.length,
      chainedHash,
    };
  }

  /**
   * Verify the audit chain for a date range (or all dates if not specified).
   * Rebuilds Merkle trees from raw audit data and checks against stored roots.
   */
  verifyAuditChain(startDate?: string, endDate?: string): ChainVerificationResult {
    // Get all stored Merkle roots in date order
    let query = 'SELECT * FROM merkle_chain';
    const params: string[] = [];

    if (startDate && endDate) {
      query += ' WHERE date >= ? AND date <= ?';
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ' WHERE date >= ?';
      params.push(startDate);
    } else if (endDate) {
      query += ' WHERE date <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY date ASC';

    const rows = this.db.prepare(query).all(...params) as MerkleRow[];

    if (rows.length === 0) {
      return { valid: true, entryCount: 0, daysVerified: 0 };
    }

    let totalEntries = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      totalEntries += row.entry_count;

      // Rebuild the Merkle tree from raw audit entries to verify the stored root
      const entries = this.db.prepare(
        `SELECT * FROM audit_log WHERE timestamp LIKE ? ORDER BY rowid ASC`
      ).all(`${row.date}%`) as Array<{
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
        estimated_time_saved_seconds: number;
      }>;

      const auditEntries: AuditEntry[] = entries.map(r => ({
        id: r.id,
        requestId: r.request_id,
        timestamp: r.timestamp,
        action: r.action as AuditEntry['action'],
        direction: r.direction as 'request' | 'response',
        status: r.status as AuditEntry['status'],
        payloadHash: r.payload_hash,
        signature: r.signature,
        chainHash: r.chain_hash,
        metadata: r.metadata ? JSON.parse(r.metadata) as Record<string, unknown> : undefined,
        estimatedTimeSavedSeconds: r.estimated_time_saved_seconds,
      }));

      const leafHashes = auditEntries.map(hashEntry);
      const recomputedRoot = buildMerkleRoot(leafHashes);

      // Check if stored root matches recomputed root
      if (recomputedRoot !== row.merkle_root) {
        return { valid: false, firstBreak: row.date, entryCount: totalEntries, daysVerified: i };
      }

      // Verify chain link — first row in range uses stored previousRoot
      // (which may reference a day outside the query range), subsequent rows
      // verify against the actual previous row in the result set.
      const previousRoot = i === 0 ? row.previous_root : rows[i - 1]!.merkle_root;
      const expectedChainedHash = sha256(row.merkle_root + previousRoot);

      if (row.chained_hash !== expectedChainedHash) {
        return { valid: false, firstBreak: row.date, entryCount: totalEntries, daysVerified: i };
      }
    }

    return { valid: true, entryCount: totalEntries, daysVerified: rows.length };
  }

  /**
   * Generate a signed receipt for a single day.
   * Uses Ed25519 signing for exportable cryptographic proof.
   */
  generateSignedReceipt(
    date: string,
    privateKey: Buffer,
    publicKey: Buffer,
  ): SignedDailyReceipt {
    // Build/refresh the Merkle tree for this date
    const daily = this.buildDailyMerkleTree(date);

    const receiptPayload = canonicalJSON({
      date: daily.date,
      merkleRoot: daily.merkleRoot,
      chainedHash: daily.chainedHash,
      entryCount: daily.entryCount,
    });

    const signature = sign(Buffer.from(receiptPayload), privateKey);
    const publicKeyFingerprint = sha256(publicKey.toString('hex'));

    return {
      date: daily.date,
      merkleRoot: daily.merkleRoot,
      chainedHash: daily.chainedHash,
      entryCount: daily.entryCount,
      signature: signature.toString('hex'),
      publicKeyFingerprint,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Verify a signed receipt against a public key.
   */
  static verifyReceipt(receipt: SignedDailyReceipt, publicKey: Buffer): boolean {
    const receiptPayload = canonicalJSON({
      date: receipt.date,
      merkleRoot: receipt.merkleRoot,
      chainedHash: receipt.chainedHash,
      entryCount: receipt.entryCount,
    });

    return verify(
      Buffer.from(receiptPayload),
      Buffer.from(receipt.signature, 'hex'),
      publicKey,
    );
  }

  /**
   * Get the latest stored verification result (for IPC caching).
   */
  getLatestRoot(): DailyMerkleRoot | null {
    const row = this.db.prepare(
      'SELECT * FROM merkle_chain ORDER BY date DESC LIMIT 1'
    ).get() as MerkleRow | undefined;

    if (!row) return null;

    return {
      date: row.date,
      merkleRoot: row.merkle_root,
      previousRoot: row.previous_root,
      entryCount: row.entry_count,
      chainedHash: row.chained_hash,
    };
  }
}
