// Database Encryption Tests — Key management, PRAGMA application, migration, detection.

import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  getOrCreateDatabaseKey,
  openEncryptedDatabase,
  migrateToEncrypted,
  isDatabaseEncrypted,
} from '@semblance/core/crypto/database-encryption.js';
import type { SecureStorageAdapter, DatabaseHandle } from '@semblance/core/platform/types.js';
import { setPlatform, getPlatform } from '@semblance/core/platform/index.js';
import { createDesktopAdapter } from '@semblance/core/platform/desktop-adapter.js';

beforeAll(() => {
  setPlatform(createDesktopAdapter());
});

function createMockStorage(): SecureStorageAdapter {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
  };
}

function createMockDb(): DatabaseHandle & { pragmaCalls: string[]; execCalls: string[] } {
  const pragmaCalls: string[] = [];
  const execCalls: string[] = [];
  return {
    pragmaCalls,
    execCalls,
    pragma: (stmt: string) => { pragmaCalls.push(stmt); return undefined; },
    prepare: () => ({ get: () => undefined, all: () => [], run: () => ({ changes: 0, lastInsertRowid: 0 }) }),
    exec: (sql: string) => { execCalls.push(sql); },
    transaction: (fn: (...args: unknown[]) => unknown) => fn as ReturnType<DatabaseHandle['transaction']>,
    close: () => {},
  };
}

describe('Database Encryption — Key Management', () => {
  it('generates a 64-char hex key and stores it in secure storage', async () => {
    const storage = createMockStorage();
    const key = await getOrCreateDatabaseKey(storage);
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the same key on subsequent calls', async () => {
    const storage = createMockStorage();
    const key1 = await getOrCreateDatabaseKey(storage);
    const key2 = await getOrCreateDatabaseKey(storage);
    expect(key1).toBe(key2);
  });
});

describe('Database Encryption — PRAGMA Application', () => {
  it('applies SQLCipher PRAGMAs in correct order', () => {
    const db = createMockDb();
    const keyHex = 'a'.repeat(64);
    openEncryptedDatabase(db, keyHex);
    expect(db.pragmaCalls[0]).toContain("key = \"x'");
    expect(db.pragmaCalls[0]).toContain(keyHex);
    expect(db.pragmaCalls[1]).toBe('cipher_page_size = 4096');
    expect(db.pragmaCalls[2]).toBe('kdf_iter = 256000');
    expect(db.pragmaCalls[3]).toBe('cipher_hmac_algorithm = HMAC_SHA512');
    expect(db.pragmaCalls[4]).toBe('cipher_kdf_algorithm = PBKDF2_HMAC_SHA512');
  });

  it('rejects invalid key length', () => {
    const db = createMockDb();
    expect(() => openEncryptedDatabase(db, 'short')).toThrow('64-character hex string');
  });
});

describe('Database Encryption — Migration', () => {
  it('executes ATTACH, export, and DETACH for migration', () => {
    const db = createMockDb();
    const keyHex = 'b'.repeat(64);
    migrateToEncrypted({ sourceDb: db, destPath: '/tmp/encrypted.db', keyHex });
    expect(db.execCalls[0]).toContain('ATTACH DATABASE');
    expect(db.execCalls[0]).toContain('/tmp/encrypted.db');
    expect(db.execCalls[0]).toContain(keyHex);
    expect(db.execCalls[1]).toContain('sqlcipher_export');
    expect(db.execCalls[2]).toContain('DETACH DATABASE encrypted');
  });
});

describe('Database Encryption — Detection', () => {
  it('detects unencrypted SQLite file by header', () => {
    const p = getPlatform();
    const header = Buffer.from('SQLite format 3\0' + '\0'.repeat(84));
    vi.spyOn(p.fs, 'readFileSyncBuffer').mockReturnValueOnce(header);
    expect(isDatabaseEncrypted('/test/plain.db')).toBe(false);
  });

  it('detects encrypted file by non-SQLite header', () => {
    const p = getPlatform();
    const encryptedHeader = Buffer.alloc(100, 0xff);
    vi.spyOn(p.fs, 'readFileSyncBuffer').mockReturnValueOnce(encryptedHeader);
    expect(isDatabaseEncrypted('/test/encrypted.db')).toBe(true);
  });
});
