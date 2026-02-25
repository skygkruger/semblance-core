// Database Encryption — SQLCipher key management, PRAGMA application, migration.
// Application-layer logic only. Actual SQLCipher binding (better-sqlite3-multiple-ciphers)
// is a build config change — same pattern as mobile adapter stubs.
// CRITICAL: No networking imports.

import type { SecureStorageAdapter } from '../platform/types.js';
import type { DatabaseHandle } from '../platform/types.js';
import { getPlatform } from '../platform/index.js';

const DB_KEY_STORAGE_KEY = 'semblance.database.encryption.key';
const SQLITE_HEADER_STRING = 'SQLite format 3\0';

/**
 * Get or create the database encryption key.
 * Stored in platform-specific secure storage (Keychain, Keystore, etc.).
 * Returns a 32-byte key as 64-char hex string.
 */
export async function getOrCreateDatabaseKey(
  storage: SecureStorageAdapter,
): Promise<string> {
  const existing = await storage.get(DB_KEY_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const p = getPlatform();
  const keyHex = p.crypto.randomBytes(32).toString('hex');
  await storage.set(DB_KEY_STORAGE_KEY, keyHex);
  return keyHex;
}

/**
 * Apply SQLCipher encryption PRAGMAs to an opened database.
 * Must be called immediately after opening the database, before any other operations.
 *
 * Applies:
 * - PRAGMA key = '<hex key>'
 * - PRAGMA cipher_page_size = 4096
 * - PRAGMA kdf_iter = 256000
 * - PRAGMA cipher_hmac_algorithm = HMAC_SHA512
 * - PRAGMA cipher_kdf_algorithm = PBKDF2_HMAC_SHA512
 */
export function openEncryptedDatabase(db: DatabaseHandle, keyHex: string): void {
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('Database encryption key must be a 64-character hex string (32 bytes)');
  }
  db.pragma(`key = "x'${keyHex}'"`);
  db.pragma('cipher_page_size = 4096');
  db.pragma('kdf_iter = 256000');
  db.pragma('cipher_hmac_algorithm = HMAC_SHA512');
  db.pragma('cipher_kdf_algorithm = PBKDF2_HMAC_SHA512');
}

/**
 * Migrate an unencrypted database to encrypted format.
 * Uses SQLCipher's ATTACH + sqlcipher_export pattern.
 *
 * Process:
 * 1. Open unencrypted source database
 * 2. Attach encrypted destination with key
 * 3. Export all data to encrypted database
 * 4. Detach and close
 */
export function migrateToEncrypted(opts: {
  sourceDb: DatabaseHandle;
  destPath: string;
  keyHex: string;
}): void {
  const { sourceDb, destPath, keyHex } = opts;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('Database encryption key must be a 64-character hex string (32 bytes)');
  }
  sourceDb.exec(`ATTACH DATABASE '${destPath}' AS encrypted KEY "x'${keyHex}'"`);
  sourceDb.exec("SELECT sqlcipher_export('encrypted')");
  sourceDb.exec('DETACH DATABASE encrypted');
}

/**
 * Check whether a database file is encrypted by reading its header.
 * Unencrypted SQLite files start with "SQLite format 3\0" (16 bytes).
 * Encrypted files have different first bytes.
 */
export function isDatabaseEncrypted(filePath: string): boolean {
  const p = getPlatform();
  try {
    const header = p.fs.readFileSyncBuffer(filePath);
    if (header.length < 16) return true; // Too short for SQLite header = encrypted or empty
    const headerStr = header.subarray(0, 16).toString('ascii');
    return headerStr !== SQLITE_HEADER_STRING;
  } catch {
    // File doesn't exist or can't be read — treat as needing encryption setup
    return false;
  }
}
