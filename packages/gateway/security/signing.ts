// Gateway Key Management — Generates, stores, and retrieves HMAC signing keys
// The pure signing functions live in @semblance/core/types/signing.ts.
// This module handles key lifecycle only.

import { randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';

const KEY_NAME = 'hmac_signing_key';
const KEY_TABLE = `
  CREATE TABLE IF NOT EXISTS signing_keys (
    name TEXT PRIMARY KEY,
    key_hex TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

export class KeyManager {
  private db: Database.Database;
  private cachedKey: Buffer | null = null;

  constructor(db: Database.Database) {
    this.db = db;
    this.db.exec(KEY_TABLE);
  }

  /**
   * Get the HMAC signing key. Generates one on first access.
   */
  getKey(): Buffer {
    if (this.cachedKey) return this.cachedKey;

    const row = this.db.prepare(
      'SELECT key_hex FROM signing_keys WHERE name = ?'
    ).get(KEY_NAME) as { key_hex: string } | undefined;

    if (row) {
      this.cachedKey = Buffer.from(row.key_hex, 'hex');
      return this.cachedKey;
    }

    return this.generateKey();
  }

  /**
   * Generate a new 256-bit HMAC key and store it in the database.
   * WARNING: This replaces the existing key. All previously signed
   * requests will fail verification.
   */
  private generateKey(): Buffer {
    const key = randomBytes(32);
    const keyHex = key.toString('hex');

    this.db.prepare(
      'INSERT OR REPLACE INTO signing_keys (name, key_hex) VALUES (?, ?)'
    ).run(KEY_NAME, keyHex);

    this.cachedKey = key;
    return key;
  }
}
