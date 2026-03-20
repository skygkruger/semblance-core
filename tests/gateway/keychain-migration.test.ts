// Keychain Migration Tests — Silent one-way credential migration to OS keychain.
//
// Covers:
// - Migrates service_credentials from encrypted SQLite to keychain
// - Migrates oauth_tokens from encrypted SQLite to keychain
// - Sets MIGRATED_SENTINEL in SQLite after migration
// - Idempotent — re-running skips already-migrated entries
// - Handles missing tables gracefully
// - Reports errors per-credential without stopping
// - Returns accurate MigrationResult counts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { migrateCredentialsToKeychain } from '@semblance/gateway/credentials/keychain-migration';
import { MIGRATED_SENTINEL } from '@semblance/core/credentials/keychain';
import type { KeychainStore } from '@semblance/core/credentials/keychain';

// Mock the decryptPassword function
vi.mock('@semblance/gateway/credentials/encryption', () => ({
  decryptPassword: vi.fn((_key: Buffer, encrypted: string) => {
    // Simple mock: return decrypted_<encrypted>
    return `decrypted_${encrypted}`;
  }),
}));

function createMockKeychain(): KeychainStore & { store: Map<string, string> } {
  const store = new Map<string, string>();

  return {
    store,
    set: vi.fn(async (service: string, account: string, value: string) => {
      store.set(`${service}::${account}`, value);
    }),
    get: vi.fn(async (service: string, account: string) => {
      return store.get(`${service}::${account}`) ?? null;
    }),
    delete: vi.fn(async (service: string, account: string) => {
      store.delete(`${service}::${account}`);
    }),
    clear: vi.fn(async () => {}),
  };
}

describe('migrateCredentialsToKeychain', () => {
  let db: InstanceType<typeof Database>;
  let keychain: ReturnType<typeof createMockKeychain>;
  let encryptionKey: Buffer;

  beforeEach(() => {
    db = new Database(':memory:');
    keychain = createMockKeychain();
    encryptionKey = Buffer.alloc(32, 0xAA);
  });

  afterEach(() => {
    db.close();
  });

  // ─── Service Credentials ──────────────────────────────────────────────

  it('migrates service credentials to keychain', async () => {
    db.exec(`
      CREATE TABLE service_credentials (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        encrypted_password TEXT NOT NULL
      )
    `);
    db.prepare('INSERT INTO service_credentials VALUES (?, ?, ?)').run('imap-1', 'user@example.com', 'enc_pass_123');

    const result = await migrateCredentialsToKeychain(db, keychain, encryptionKey);

    expect(result.credentialsMigrated).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(keychain.set).toHaveBeenCalledWith(
      'semblance.credential.imap-1',
      'password',
      'decrypted_enc_pass_123',
    );
  });

  it('sets MIGRATED_SENTINEL in SQLite after migration', async () => {
    db.exec(`
      CREATE TABLE service_credentials (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        encrypted_password TEXT NOT NULL
      )
    `);
    db.prepare('INSERT INTO service_credentials VALUES (?, ?, ?)').run('imap-1', 'user@example.com', 'enc_pass');

    await migrateCredentialsToKeychain(db, keychain, encryptionKey);

    const row = db.prepare('SELECT encrypted_password FROM service_credentials WHERE id = ?').get('imap-1') as { encrypted_password: string };
    expect(row.encrypted_password).toBe(MIGRATED_SENTINEL);
  });

  it('skips already-migrated credentials', async () => {
    db.exec(`
      CREATE TABLE service_credentials (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        encrypted_password TEXT NOT NULL
      )
    `);
    db.prepare('INSERT INTO service_credentials VALUES (?, ?, ?)').run('imap-1', 'user@example.com', MIGRATED_SENTINEL);

    const result = await migrateCredentialsToKeychain(db, keychain, encryptionKey);

    expect(result.credentialsMigrated).toBe(0);
    expect(keychain.set).not.toHaveBeenCalled();
  });

  it('migrates multiple credentials', async () => {
    db.exec(`
      CREATE TABLE service_credentials (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        encrypted_password TEXT NOT NULL
      )
    `);
    db.prepare('INSERT INTO service_credentials VALUES (?, ?, ?)').run('imap-1', 'user1@example.com', 'enc1');
    db.prepare('INSERT INTO service_credentials VALUES (?, ?, ?)').run('smtp-1', 'user2@example.com', 'enc2');
    db.prepare('INSERT INTO service_credentials VALUES (?, ?, ?)').run('caldav-1', 'user3@example.com', 'enc3');

    const result = await migrateCredentialsToKeychain(db, keychain, encryptionKey);

    expect(result.credentialsMigrated).toBe(3);
    expect(keychain.set).toHaveBeenCalledTimes(3);
  });

  // ─── OAuth Tokens ─────────────────────────────────────────────────────

  it('migrates OAuth tokens to keychain', async () => {
    db.exec(`
      CREATE TABLE oauth_tokens (
        provider TEXT PRIMARY KEY,
        access_token_encrypted TEXT NOT NULL,
        refresh_token_encrypted TEXT NOT NULL
      )
    `);
    db.prepare('INSERT INTO oauth_tokens VALUES (?, ?, ?)').run('google', 'enc_at', 'enc_rt');

    const result = await migrateCredentialsToKeychain(db, keychain, encryptionKey);

    expect(result.oauthTokensMigrated).toBe(1);
    expect(keychain.set).toHaveBeenCalledWith('semblance.oauth.google', 'access_token', 'decrypted_enc_at');
    expect(keychain.set).toHaveBeenCalledWith('semblance.oauth.google', 'refresh_token', 'decrypted_enc_rt');
  });

  it('sets MIGRATED_SENTINEL for OAuth tokens after migration', async () => {
    db.exec(`
      CREATE TABLE oauth_tokens (
        provider TEXT PRIMARY KEY,
        access_token_encrypted TEXT NOT NULL,
        refresh_token_encrypted TEXT NOT NULL
      )
    `);
    db.prepare('INSERT INTO oauth_tokens VALUES (?, ?, ?)').run('google', 'enc_at', 'enc_rt');

    await migrateCredentialsToKeychain(db, keychain, encryptionKey);

    const row = db.prepare('SELECT * FROM oauth_tokens WHERE provider = ?').get('google') as {
      access_token_encrypted: string;
      refresh_token_encrypted: string;
    };
    expect(row.access_token_encrypted).toBe(MIGRATED_SENTINEL);
    expect(row.refresh_token_encrypted).toBe(MIGRATED_SENTINEL);
  });

  // ─── Missing Tables ───────────────────────────────────────────────────

  it('handles missing service_credentials table gracefully', async () => {
    // No tables created — should not throw
    const result = await migrateCredentialsToKeychain(db, keychain, encryptionKey);
    expect(result.credentialsMigrated).toBe(0);
    expect(result.oauthTokensMigrated).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('handles missing oauth_tokens table gracefully', async () => {
    db.exec(`
      CREATE TABLE service_credentials (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        encrypted_password TEXT NOT NULL
      )
    `);
    // No oauth_tokens table — should not throw
    const result = await migrateCredentialsToKeychain(db, keychain, encryptionKey);
    expect(result.errors).toHaveLength(0);
  });

  // ─── Error Handling ───────────────────────────────────────────────────

  it('reports per-credential errors without stopping', async () => {
    db.exec(`
      CREATE TABLE service_credentials (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        encrypted_password TEXT NOT NULL
      )
    `);
    db.prepare('INSERT INTO service_credentials VALUES (?, ?, ?)').run('imap-1', 'user1', 'enc1');
    db.prepare('INSERT INTO service_credentials VALUES (?, ?, ?)').run('imap-2', 'user2', 'enc2');

    // Make keychain.set fail for the first credential
    let callCount = 0;
    (keychain.set as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('Keychain write failed');
    });

    const result = await migrateCredentialsToKeychain(db, keychain, encryptionKey);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('imap-1');
    // The second credential should still have been attempted
    expect(keychain.set).toHaveBeenCalledTimes(2);
  });

  // ─── Idempotency ─────────────────────────────────────────────────────

  it('is idempotent — second run finds nothing to migrate', async () => {
    db.exec(`
      CREATE TABLE service_credentials (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        encrypted_password TEXT NOT NULL
      )
    `);
    db.prepare('INSERT INTO service_credentials VALUES (?, ?, ?)').run('imap-1', 'user', 'enc');

    const first = await migrateCredentialsToKeychain(db, keychain, encryptionKey);
    expect(first.credentialsMigrated).toBe(1);

    (keychain.set as ReturnType<typeof vi.fn>).mockClear();
    const second = await migrateCredentialsToKeychain(db, keychain, encryptionKey);
    expect(second.credentialsMigrated).toBe(0);
    expect(keychain.set).not.toHaveBeenCalled();
  });
});
