// Merkle Chain Integrity Tests — Proves tamper-evident daily Merkle trees,
// chain linking, signed receipts, and verification.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  MerkleChain,
  buildMerkleRoot,
  canonicalJSON,
  sha256,
} from '@semblance/core';
import type { DailyMerkleRoot, SignedDailyReceipt, DatabaseHandle } from '@semblance/core';
import { generateKeyPair, sign, verify } from '../../../packages/core/crypto/ed25519.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

const CREATE_AUDIT_TABLE = `
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
    estimated_time_saved_seconds INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

let counter = 0;

function insertAuditEntry(
  db: Database.Database,
  overrides: Partial<{
    id: string;
    requestId: string;
    timestamp: string;
    action: string;
    direction: string;
    status: string;
    payloadHash: string;
    signature: string;
    chainHash: string;
    metadata: string | null;
    estimatedTimeSavedSeconds: number;
  }> = {},
) {
  counter++;
  const id = overrides.id ?? `entry_${counter}`;
  const requestId = overrides.requestId ?? `req_${counter}`;
  const timestamp = overrides.timestamp ?? '2026-01-15T10:30:00.000Z';
  const action = overrides.action ?? 'email.send';
  const direction = overrides.direction ?? 'request';
  const status = overrides.status ?? 'success';
  const payloadHash = overrides.payloadHash ?? sha256(`payload_${counter}`);
  const signature = overrides.signature ?? `sig_${counter}`;
  const chainHash = overrides.chainHash ?? sha256(`chain_${counter}`);
  const metadata = overrides.metadata ?? null;
  const estimatedTimeSavedSeconds = overrides.estimatedTimeSavedSeconds ?? 30;

  db.prepare(`
    INSERT INTO audit_log (id, request_id, timestamp, action, direction, status,
      payload_hash, signature, chain_hash, metadata, estimated_time_saved_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, requestId, timestamp, action, direction, status,
    payloadHash, signature, chainHash, metadata, estimatedTimeSavedSeconds);

  return id;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Merkle Chain Integrity', () => {
  let db: Database.Database;
  let chain: MerkleChain;

  beforeEach(() => {
    counter = 0;
    db = new Database(':memory:');
    db.exec(CREATE_AUDIT_TABLE);
    chain = new MerkleChain(db as unknown as DatabaseHandle);
  });

  afterEach(() => {
    db.close();
  });

  // ─── canonicalJSON ───

  describe('canonicalJSON', () => {
    it('produces deterministic output with sorted keys', () => {
      const a = canonicalJSON({ z: 1, a: 2, m: 3 });
      const b = canonicalJSON({ a: 2, m: 3, z: 1 });
      expect(a).toBe(b);
      expect(a).toBe('{"a":2,"m":3,"z":1}');
    });

    it('handles nested objects with sorted keys', () => {
      const result = canonicalJSON({ b: { d: 1, c: 2 }, a: 'hello' });
      expect(result).toBe('{"a":"hello","b":{"c":2,"d":1}}');
    });

    it('handles arrays preserving order', () => {
      const result = canonicalJSON([3, 1, 2]);
      expect(result).toBe('[3,1,2]');
    });

    it('handles null and undefined', () => {
      expect(canonicalJSON(null)).toBe('null');
      expect(canonicalJSON(undefined)).toBe('null');
    });
  });

  // ─── buildMerkleRoot ───

  describe('buildMerkleRoot', () => {
    it('returns empty string for no leaves', () => {
      expect(buildMerkleRoot([])).toBe('');
    });

    it('returns leaf hash for single leaf', () => {
      const leaf = sha256('test');
      // Single leaf: while loop skips (length == 1), returns leaf directly
      expect(buildMerkleRoot([leaf])).toBe(leaf);
    });

    it('combines two leaves correctly', () => {
      const a = sha256('a');
      const b = sha256('b');
      const root = buildMerkleRoot([a, b]);
      expect(root).toBe(sha256(a + b));
    });

    it('handles odd number of leaves by duplicating last', () => {
      const a = sha256('a');
      const b = sha256('b');
      const c = sha256('c');
      const root = buildMerkleRoot([a, b, c]);
      const left = sha256(a + b);
      const right = sha256(c + c);
      expect(root).toBe(sha256(left + right));
    });

    it('produces deterministic roots', () => {
      const leaves = ['x', 'y', 'z'].map(sha256);
      const root1 = buildMerkleRoot(leaves);
      const root2 = buildMerkleRoot(leaves);
      expect(root1).toBe(root2);
    });
  });

  // ─── buildDailyMerkleTree ───

  describe('buildDailyMerkleTree', () => {
    it('builds tree for a day with entries', () => {
      insertAuditEntry(db, { timestamp: '2026-01-15T08:00:00.000Z' });
      insertAuditEntry(db, { timestamp: '2026-01-15T09:00:00.000Z' });
      insertAuditEntry(db, { timestamp: '2026-01-15T10:00:00.000Z' });

      const result = chain.buildDailyMerkleTree('2026-01-15');
      expect(result.date).toBe('2026-01-15');
      expect(result.entryCount).toBe(3);
      expect(result.merkleRoot).toBeTruthy();
      expect(result.merkleRoot.length).toBe(64); // SHA-256 hex
      expect(result.chainedHash).toBeTruthy();
      expect(result.previousRoot).toBe(''); // First day, no previous
    });

    it('builds empty tree for day with no entries', () => {
      const result = chain.buildDailyMerkleTree('2026-01-15');
      expect(result.entryCount).toBe(0);
      expect(result.merkleRoot).toBe('');
    });

    it('chains to previous day root', () => {
      insertAuditEntry(db, { timestamp: '2026-01-14T10:00:00.000Z' });
      insertAuditEntry(db, { timestamp: '2026-01-15T10:00:00.000Z' });

      const day1 = chain.buildDailyMerkleTree('2026-01-14');
      const day2 = chain.buildDailyMerkleTree('2026-01-15');

      expect(day2.previousRoot).toBe(day1.merkleRoot);
      expect(day2.chainedHash).toBe(sha256(day2.merkleRoot + day1.merkleRoot));
    });

    it('produces consistent results on rebuild (idempotent)', () => {
      insertAuditEntry(db, { timestamp: '2026-01-15T10:00:00.000Z' });

      const first = chain.buildDailyMerkleTree('2026-01-15');
      const second = chain.buildDailyMerkleTree('2026-01-15');

      expect(first.merkleRoot).toBe(second.merkleRoot);
      expect(first.chainedHash).toBe(second.chainedHash);
    });
  });

  // ─── verifyAuditChain ───

  describe('verifyAuditChain', () => {
    it('verifies empty chain as valid', () => {
      const result = chain.verifyAuditChain();
      expect(result.valid).toBe(true);
      expect(result.entryCount).toBe(0);
      expect(result.daysVerified).toBe(0);
    });

    it('verifies single day chain', () => {
      insertAuditEntry(db, { timestamp: '2026-01-15T10:00:00.000Z' });
      chain.buildDailyMerkleTree('2026-01-15');

      const result = chain.verifyAuditChain();
      expect(result.valid).toBe(true);
      expect(result.entryCount).toBe(1);
      expect(result.daysVerified).toBe(1);
    });

    it('verifies multi-day chain', () => {
      for (let day = 14; day <= 17; day++) {
        insertAuditEntry(db, { timestamp: `2026-01-${day}T10:00:00.000Z` });
        insertAuditEntry(db, { timestamp: `2026-01-${day}T14:00:00.000Z` });
        chain.buildDailyMerkleTree(`2026-01-${day}`);
      }

      const result = chain.verifyAuditChain();
      expect(result.valid).toBe(true);
      expect(result.entryCount).toBe(8);
      expect(result.daysVerified).toBe(4);
    });

    it('detects tampered merkle root', () => {
      insertAuditEntry(db, { timestamp: '2026-01-15T10:00:00.000Z' });
      chain.buildDailyMerkleTree('2026-01-15');

      // Tamper with the stored merkle root
      db.prepare(
        `UPDATE merkle_chain SET merkle_root = ? WHERE date = ?`
      ).run('tampered_root_hash', '2026-01-15');

      const result = chain.verifyAuditChain();
      expect(result.valid).toBe(false);
      expect(result.firstBreak).toBe('2026-01-15');
    });

    it('detects tampered chained hash', () => {
      insertAuditEntry(db, { timestamp: '2026-01-15T10:00:00.000Z' });
      chain.buildDailyMerkleTree('2026-01-15');

      // Tamper with the chained hash
      db.prepare(
        `UPDATE merkle_chain SET chained_hash = ? WHERE date = ?`
      ).run('tampered_chain_hash', '2026-01-15');

      const result = chain.verifyAuditChain();
      expect(result.valid).toBe(false);
      expect(result.firstBreak).toBe('2026-01-15');
    });

    it('detects tampered audit entry in middle of chain', () => {
      insertAuditEntry(db, { id: 'day14_1', timestamp: '2026-01-14T10:00:00.000Z' });
      chain.buildDailyMerkleTree('2026-01-14');

      insertAuditEntry(db, { id: 'day15_1', timestamp: '2026-01-15T10:00:00.000Z' });
      chain.buildDailyMerkleTree('2026-01-15');

      insertAuditEntry(db, { id: 'day16_1', timestamp: '2026-01-16T10:00:00.000Z' });
      chain.buildDailyMerkleTree('2026-01-16');

      // Tamper with an audit entry on day 15
      db.prepare(
        `UPDATE audit_log SET action = ? WHERE id = ?`
      ).run('email.delete', 'day15_1');

      const result = chain.verifyAuditChain();
      expect(result.valid).toBe(false);
      expect(result.firstBreak).toBe('2026-01-15');
    });

    it('verifies date range filter', () => {
      for (let day = 10; day <= 20; day++) {
        insertAuditEntry(db, { timestamp: `2026-01-${day}T10:00:00.000Z` });
        chain.buildDailyMerkleTree(`2026-01-${day}`);
      }

      const result = chain.verifyAuditChain('2026-01-12', '2026-01-15');
      expect(result.valid).toBe(true);
      expect(result.daysVerified).toBe(4);
    });
  });

  // ─── Signed Receipts ───

  describe('Signed Receipts', () => {
    it('generates a signed receipt with valid signature', () => {
      insertAuditEntry(db, { timestamp: '2026-01-15T10:00:00.000Z' });

      const keys = generateKeyPair();
      const receipt = chain.generateSignedReceipt('2026-01-15', keys.privateKey, keys.publicKey);

      expect(receipt.date).toBe('2026-01-15');
      expect(receipt.merkleRoot).toBeTruthy();
      expect(receipt.chainedHash).toBeTruthy();
      expect(receipt.entryCount).toBe(1);
      expect(receipt.signature).toBeTruthy();
      expect(receipt.publicKeyFingerprint).toBeTruthy();
      expect(receipt.timestamp).toBeTruthy();
    });

    it('receipt signature verifies with correct public key', () => {
      insertAuditEntry(db, { timestamp: '2026-01-15T10:00:00.000Z' });

      const keys = generateKeyPair();
      const receipt = chain.generateSignedReceipt('2026-01-15', keys.privateKey, keys.publicKey);

      const isValid = MerkleChain.verifyReceipt(receipt, keys.publicKey);
      expect(isValid).toBe(true);
    });

    it('receipt signature fails with wrong public key', () => {
      insertAuditEntry(db, { timestamp: '2026-01-15T10:00:00.000Z' });

      const keys = generateKeyPair();
      const wrongKeys = generateKeyPair();
      const receipt = chain.generateSignedReceipt('2026-01-15', keys.privateKey, keys.publicKey);

      const isValid = MerkleChain.verifyReceipt(receipt, wrongKeys.publicKey);
      expect(isValid).toBe(false);
    });

    it('receipt signature fails if receipt is tampered', () => {
      insertAuditEntry(db, { timestamp: '2026-01-15T10:00:00.000Z' });

      const keys = generateKeyPair();
      const receipt = chain.generateSignedReceipt('2026-01-15', keys.privateKey, keys.publicKey);

      // Tamper with the receipt
      const tampered: SignedDailyReceipt = { ...receipt, entryCount: 999 };
      const isValid = MerkleChain.verifyReceipt(tampered, keys.publicKey);
      expect(isValid).toBe(false);
    });
  });

  // ─── getLatestRoot ───

  describe('getLatestRoot', () => {
    it('returns null when no roots exist', () => {
      expect(chain.getLatestRoot()).toBeNull();
    });

    it('returns the most recent root', () => {
      insertAuditEntry(db, { timestamp: '2026-01-14T10:00:00.000Z' });
      chain.buildDailyMerkleTree('2026-01-14');

      insertAuditEntry(db, { timestamp: '2026-01-15T10:00:00.000Z' });
      chain.buildDailyMerkleTree('2026-01-15');

      const latest = chain.getLatestRoot();
      expect(latest).not.toBeNull();
      expect(latest!.date).toBe('2026-01-15');
    });
  });

  // ─── IPC types match ───

  describe('IPC type alignment', () => {
    it('DailyMerkleRoot has required fields', () => {
      insertAuditEntry(db, { timestamp: '2026-01-15T10:00:00.000Z' });
      const root: DailyMerkleRoot = chain.buildDailyMerkleTree('2026-01-15');

      // Verify shape matches IPC expectations
      expect(typeof root.date).toBe('string');
      expect(typeof root.merkleRoot).toBe('string');
      expect(typeof root.previousRoot).toBe('string');
      expect(typeof root.entryCount).toBe('number');
      expect(typeof root.chainedHash).toBe('string');
    });
  });
});
