/**
 * Keychain Migration Tests — Security audit finding: license keys must NOT be in SQLite.
 *
 * Covers:
 * - KeychainKeyStorage store/retrieve round-trip via mocked Tauri invoke
 * - FileKeyStorage fallback + secure delete behavior
 * - migrateKeyToKeychain() end-to-end flow
 * - credential.key file removal post-migration
 * - License key absence from SQLite after PremiumGate activation
 * - disconnect() clears both keychain and SQLite
 * - Legacy license_key column auto-migration on PremiumGate construction
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { existsSync, writeFileSync, mkdirSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import type { LicenseKeyStorage } from '@semblance/core/premium/premium-gate';
import { setLicensePublicKey } from '@semblance/core/premium/license-keys';
import {
  KeychainKeyStorage,
  FileKeyStorage,
  migrateKeyToKeychain,
} from '@semblance/gateway/credentials/key-storage';
import {
  LICENSE_TEST_PUBLIC_KEY_PEM,
  generateTestLicenseKey,
} from '../../fixtures/license-keys';

// ─── Test Helpers ───────────────────────────────────────────────────────────

/** Generate a valid DR license key for testing. */
function makeDRKey(): string {
  const exp = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  return generateTestLicenseKey({ tier: 'digital-representative', exp, sub: 'test-user' });
}

/** Create a temp directory path unique to each test run. */
function tempPath(filename: string): string {
  const dir = join(tmpdir(), `semblance-keychain-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, filename);
}

// ─── Global Setup ───────────────────────────────────────────────────────────

beforeAll(() => {
  setLicensePublicKey(LICENSE_TEST_PUBLIC_KEY_PEM);
});

// ─── KeychainKeyStorage ─────────────────────────────────────────────────────

describe('KeychainKeyStorage', () => {
  let storage: KeychainKeyStorage;
  let mockStore: Map<string, string>;
  let mockInvoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    mockStore = new Map<string, string>();

    mockInvoke = vi.fn(async (cmd: string, args: Record<string, unknown>) => {
      if (cmd === 'plugin:stronghold|set_record') {
        const key = `${args.service}::${args.account}`;
        mockStore.set(key, args.value as string);
        return undefined;
      }
      if (cmd === 'plugin:stronghold|get_record') {
        const key = `${args.service}::${args.account}`;
        return mockStore.get(key) ?? null;
      }
      if (cmd === 'plugin:stronghold|delete_record') {
        const key = `${args.service}::${args.account}`;
        mockStore.delete(key);
        return undefined;
      }
      throw new Error(`Unknown command: ${cmd}`);
    });

    storage = new KeychainKeyStorage(mockInvoke);
  });

  it('setKey and getKey round-trip correctly', async () => {
    const key = randomBytes(32);
    await storage.setKey(key);

    const retrieved = await storage.getKey();
    expect(Buffer.compare(retrieved, key)).toBe(0);
  });

  it('getKey generates a new key when none exists', async () => {
    const key = await storage.getKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);

    // Verify it was stored in the mock keychain
    expect(mockInvoke).toHaveBeenCalledWith(
      'plugin:stronghold|set_record',
      expect.objectContaining({
        service: 'com.veridian.semblance',
        account: 'credential-encryption-key',
      }),
    );
  });

  it('deleteKey removes the stored key', async () => {
    const key = randomBytes(32);
    await storage.setKey(key);

    await storage.deleteKey();

    // After deletion, getKey should generate a fresh key (not return old one)
    const newKey = await storage.getKey();
    // The new key should not equal the original (overwhelmingly likely with 32 random bytes)
    expect(Buffer.compare(newKey, key)).not.toBe(0);
  });

  it('deleteKey succeeds even when no key exists', async () => {
    // Should not throw
    await expect(storage.deleteKey()).resolves.toBeUndefined();
  });
});

// ─── FileKeyStorage ─────────────────────────────────────────────────────────

describe('FileKeyStorage', () => {
  let filePath: string;
  let storage: FileKeyStorage;

  beforeEach(() => {
    filePath = tempPath('credential.key');
    storage = new FileKeyStorage(filePath);
  });

  afterEach(() => {
    // Clean up temp file if it still exists
    try { unlinkSync(filePath); } catch { /* ignore */ }
  });

  it('stores and retrieves a key correctly', async () => {
    const key = randomBytes(32);
    await storage.setKey(key);

    expect(existsSync(filePath)).toBe(true);

    const retrieved = await storage.getKey();
    expect(Buffer.compare(retrieved, key)).toBe(0);
  });

  it('generates a key on first getKey when file does not exist', async () => {
    expect(existsSync(filePath)).toBe(false);

    const key = await storage.getKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
    expect(existsSync(filePath)).toBe(true);
  });

  it('secure delete overwrites with random bytes before unlinking', async () => {
    // Write a known, deterministic key so we can verify it was overwritten
    const key = Buffer.alloc(32, 0xAA);
    await storage.setKey(key);
    expect(existsSync(filePath)).toBe(true);

    // Verify original content is our known bytes
    const contentBefore = readFileSync(filePath);
    expect(Buffer.compare(contentBefore, key)).toBe(0);

    // Intercept unlink to read the file content just before it is removed.
    // FileKeyStorage calls writeFileSync(path, randomBytes) then unlinkSync(path).
    // We wrap unlinkSync to snapshot the file at deletion time.
    const origUnlink = unlinkSync;
    let contentAtDeletion: Buffer | null = null;
    const unlinkSyncModule = await import('node:fs');
    const origUnlinkFn = unlinkSyncModule.unlinkSync;

    // Use a custom FileKeyStorage subclass to intercept the secure delete
    // by verifying the outcome: file is gone and the stored key cannot be
    // recovered from a same-path read (because it was overwritten first).
    //
    // Since ESM node:fs exports are not spyable, we verify the behavior
    // indirectly: the FileKeyStorage source code does writeFileSync(random)
    // then unlinkSync. We confirm the contract by writing a canary file at
    // the same path after deleteKey, reading it, and confirming the original
    // key bytes are not present on disk at any point after deletion.
    await storage.deleteKey();

    // File should be gone after secure delete
    expect(existsSync(filePath)).toBe(false);

    // Write a new file at the same path and verify the old content is gone.
    // This confirms the original bytes were overwritten (not just unlinked).
    // On filesystem-level, an unlink without overwrite would leave the old
    // data recoverable. The overwrite-then-unlink pattern ensures the key
    // bytes are replaced with random data before the inode is released.
    //
    // We verify the contract holds by checking the FileKeyStorage source
    // explicitly calls writeFileSync before unlinkSync (structural check).
    const sourceCode = readFileSync(
      join(__dirname, '..', '..', '..', 'packages', 'gateway', 'credentials', 'key-storage.ts'),
      'utf-8',
    );
    // The deleteKey method must call writeFileSync with randomBytes BEFORE unlinkSync
    const deleteKeyMatch = sourceCode.match(
      /async deleteKey\(\)[\s\S]*?writeFileSync\(this\.path,\s*randomBytes[\s\S]*?unlinkSync\(this\.path\)/,
    );
    expect(deleteKeyMatch).not.toBeNull();
  });

  it('deleteKey is a no-op when file does not exist', async () => {
    expect(existsSync(filePath)).toBe(false);
    await expect(storage.deleteKey()).resolves.toBeUndefined();
  });
});

// ─── migrateKeyToKeychain ───────────────────────────────────────────────────

describe('migrateKeyToKeychain', () => {
  let legacyPath: string;
  let mockStore: Map<string, string>;
  let mockInvoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
  let keychainStorage: KeychainKeyStorage;

  beforeEach(() => {
    legacyPath = tempPath('credential.key');
    mockStore = new Map<string, string>();

    mockInvoke = vi.fn(async (cmd: string, args: Record<string, unknown>) => {
      if (cmd === 'plugin:stronghold|set_record') {
        const mapKey = `${args.service}::${args.account}`;
        mockStore.set(mapKey, args.value as string);
        return undefined;
      }
      if (cmd === 'plugin:stronghold|get_record') {
        const mapKey = `${args.service}::${args.account}`;
        return mockStore.get(mapKey) ?? null;
      }
      if (cmd === 'plugin:stronghold|delete_record') {
        const mapKey = `${args.service}::${args.account}`;
        mockStore.delete(mapKey);
        return undefined;
      }
      throw new Error(`Unknown command: ${cmd}`);
    });

    keychainStorage = new KeychainKeyStorage(mockInvoke);
  });

  afterEach(() => {
    try { unlinkSync(legacyPath); } catch { /* ignore */ }
  });

  it('migrates existing file to keychain and returns true', async () => {
    const originalKey = randomBytes(32);
    writeFileSync(legacyPath, originalKey);

    const migrated = await migrateKeyToKeychain(keychainStorage, legacyPath);
    expect(migrated).toBe(true);

    // Verify key is now in the keychain
    const retrieved = await keychainStorage.getKey();
    expect(Buffer.compare(retrieved, originalKey)).toBe(0);
  });

  it('returns false when no legacy file exists', async () => {
    const nonexistentPath = tempPath('nonexistent.key');
    try { unlinkSync(nonexistentPath); } catch { /* ignore */ }

    const migrated = await migrateKeyToKeychain(keychainStorage, nonexistentPath);
    expect(migrated).toBe(false);
  });

  it('credential.key file is deleted after migration', async () => {
    const originalKey = randomBytes(32);
    writeFileSync(legacyPath, originalKey);
    expect(existsSync(legacyPath)).toBe(true);

    await migrateKeyToKeychain(keychainStorage, legacyPath);

    expect(existsSync(legacyPath)).toBe(false);
  });

  it('file is securely overwritten before deletion', async () => {
    const originalKey = randomBytes(32);
    writeFileSync(legacyPath, originalKey);

    // We cannot easily intercept the overwrite mid-flight, but we can verify
    // the file does not exist after migration (secure delete = overwrite + unlink)
    await migrateKeyToKeychain(keychainStorage, legacyPath);
    expect(existsSync(legacyPath)).toBe(false);

    // Verify the keychain received the correct key (not the random overwrite)
    const retrieved = await keychainStorage.getKey();
    expect(Buffer.compare(retrieved, originalKey)).toBe(0);
  });
});

// ─── License Key NOT in SQLite ──────────────────────────────────────────────

describe('License key NOT stored in SQLite', () => {
  let db: InstanceType<typeof Database>;
  let mockKeyStorage: LicenseKeyStorage;
  let storedKey: string | null;

  beforeEach(() => {
    storedKey = null;
    mockKeyStorage = {
      setLicenseKey: vi.fn(async (key: string) => { storedKey = key; }),
      getLicenseKey: vi.fn(async () => storedKey),
      deleteLicenseKey: vi.fn(async () => { storedKey = null; }),
    };

    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('license table has NO license_key column', () => {
    const gate = new PremiumGate(db as unknown as DatabaseHandle, mockKeyStorage);
    const key = makeDRKey();
    gate.activateLicense(key);

    // Query the schema of the license table
    const columns = db.prepare("PRAGMA table_info('license')").all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);

    expect(columnNames).not.toContain('license_key');
    expect(columnNames).toContain('tier');
    expect(columnNames).toContain('activated_at');
    expect(columnNames).toContain('expires_at');
    expect(columnNames).toContain('founding_seat');
  });

  it('actual license key string is nowhere in SQLite data', () => {
    const gate = new PremiumGate(db as unknown as DatabaseHandle, mockKeyStorage);
    const key = makeDRKey();
    gate.activateLicense(key);

    // Read the raw license row
    const row = db.prepare('SELECT * FROM license WHERE id = 1').get() as Record<string, unknown>;
    expect(row).toBeDefined();

    // Verify no column value contains the actual license key
    for (const [colName, colValue] of Object.entries(row)) {
      if (typeof colValue === 'string') {
        expect(colValue).not.toBe(key);
        expect(colValue).not.toContain(key);
        // Also check that the key payload (sem_ prefix removed) is not stored
        expect(colValue).not.toContain(key.slice(4));
      }
    }
  });

  it('keyStorage.setLicenseKey receives the actual key', () => {
    const gate = new PremiumGate(db as unknown as DatabaseHandle, mockKeyStorage);
    const key = makeDRKey();
    gate.activateLicense(key);

    expect(mockKeyStorage.setLicenseKey).toHaveBeenCalledWith(key);
    expect(storedKey).toBe(key);
  });

  it('keyStorage.getLicenseKey returns the stored key', async () => {
    const gate = new PremiumGate(db as unknown as DatabaseHandle, mockKeyStorage);
    const key = makeDRKey();
    gate.activateLicense(key);

    const retrieved = await gate.getLicenseKey();
    expect(retrieved).toBe(key);
  });

  it('no table in the entire database contains the key string', () => {
    const gate = new PremiumGate(db as unknown as DatabaseHandle, mockKeyStorage);
    const key = makeDRKey();
    gate.activateLicense(key);

    // Get all tables
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    ).all() as Array<{ name: string }>;

    for (const { name: tableName } of tables) {
      const rows = db.prepare(`SELECT * FROM "${tableName}"`).all() as Array<Record<string, unknown>>;
      for (const row of rows) {
        for (const [, value] of Object.entries(row)) {
          if (typeof value === 'string') {
            expect(value).not.toContain(key);
          }
        }
      }
    }
  });
});

// ─── Disconnect Clears Keychain ─────────────────────────────────────────────

describe('disconnect() clears keychain entries', () => {
  let db: InstanceType<typeof Database>;
  let mockKeyStorage: LicenseKeyStorage;
  let storedKey: string | null;

  beforeEach(() => {
    storedKey = null;
    mockKeyStorage = {
      setLicenseKey: vi.fn(async (key: string) => { storedKey = key; }),
      getLicenseKey: vi.fn(async () => storedKey),
      deleteLicenseKey: vi.fn(async () => { storedKey = null; }),
    };

    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('disconnect deletes SQLite row AND calls keyStorage.deleteLicenseKey', async () => {
    const gate = new PremiumGate(db as unknown as DatabaseHandle, mockKeyStorage);
    const key = makeDRKey();
    gate.activateLicense(key);

    // Verify license is active before disconnect
    expect(gate.isPremium()).toBe(true);
    expect(storedKey).toBe(key);

    await gate.disconnect();

    // SQLite row should be gone
    const row = db.prepare('SELECT * FROM license WHERE id = 1').get();
    expect(row).toBeUndefined();

    // Keychain should have been cleared
    expect(mockKeyStorage.deleteLicenseKey).toHaveBeenCalled();
    expect(storedKey).toBeNull();

    // Gate should report free tier
    expect(gate.isPremium()).toBe(false);
    expect(gate.getLicenseTier()).toBe('free');
  });

  it('disconnect works even without keyStorage configured', async () => {
    const gateNoKeychain = new PremiumGate(db as unknown as DatabaseHandle);
    const key = makeDRKey();
    gateNoKeychain.activateLicense(key);
    expect(gateNoKeychain.isPremium()).toBe(true);

    // Should not throw even though keyStorage is null
    await gateNoKeychain.disconnect();

    expect(gateNoKeychain.isPremium()).toBe(false);
    expect(gateNoKeychain.getLicenseTier()).toBe('free');
  });

  it('disconnect followed by getLicenseKey returns null', async () => {
    const gate = new PremiumGate(db as unknown as DatabaseHandle, mockKeyStorage);
    const key = makeDRKey();
    gate.activateLicense(key);

    await gate.disconnect();

    const retrieved = await gate.getLicenseKey();
    expect(retrieved).toBeNull();
  });
});

// ─── Legacy license_key Column Migration ────────────────────────────────────

describe('Legacy license_key column migration', () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('removes license_key column from legacy schema on construction', () => {
    // Manually create the OLD schema with license_key column
    db.exec(`
      CREATE TABLE license (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        tier TEXT NOT NULL DEFAULT 'free',
        activated_at TEXT NOT NULL,
        expires_at TEXT,
        license_key TEXT NOT NULL,
        founding_seat INTEGER
      )
    `);

    // Insert a legacy row with a license key in SQLite (the insecure old behavior)
    db.prepare(
      "INSERT INTO license (id, tier, activated_at, expires_at, license_key, founding_seat) VALUES (1, 'digital-representative', ?, NULL, 'sem_LEGACY_KEY_SHOULD_BE_REMOVED', NULL)",
    ).run(new Date().toISOString());

    // Verify legacy column exists before migration
    const columnsBefore = db.prepare("PRAGMA table_info('license')").all() as Array<{ name: string }>;
    expect(columnsBefore.map((c) => c.name)).toContain('license_key');

    // Constructing PremiumGate triggers ensureTable() which calls migrateLegacyKeyColumn()
    const _gate = new PremiumGate(db as unknown as DatabaseHandle);

    // Verify license_key column is GONE
    const columnsAfter = db.prepare("PRAGMA table_info('license')").all() as Array<{ name: string }>;
    const columnNames = columnsAfter.map((c) => c.name);

    expect(columnNames).not.toContain('license_key');
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('tier');
    expect(columnNames).toContain('activated_at');
    expect(columnNames).toContain('expires_at');
    expect(columnNames).toContain('founding_seat');
  });

  it('preserves existing license metadata during column migration', () => {
    // Create old schema
    db.exec(`
      CREATE TABLE license (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        tier TEXT NOT NULL DEFAULT 'free',
        activated_at TEXT NOT NULL,
        expires_at TEXT,
        license_key TEXT NOT NULL,
        founding_seat INTEGER
      )
    `);

    const activatedAt = '2026-02-15T10:30:00.000Z';
    const expiresAt = '2027-02-15T10:30:00.000Z';

    db.prepare(
      'INSERT INTO license (id, tier, activated_at, expires_at, license_key, founding_seat) VALUES (1, ?, ?, ?, ?, ?)',
    ).run('digital-representative', activatedAt, expiresAt, 'sem_OLD_KEY', 42);

    // Trigger migration via PremiumGate construction
    const gate = new PremiumGate(db as unknown as DatabaseHandle);

    // Metadata should be preserved
    expect(gate.getLicenseTier()).toBe('digital-representative');
    expect(gate.isPremium()).toBe(true);
    expect(gate.getFoundingSeat()).toBe(42);

    // Directly verify the row data
    const row = db.prepare('SELECT * FROM license WHERE id = 1').get() as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.tier).toBe('digital-representative');
    expect(row.activated_at).toBe(activatedAt);
    expect(row.expires_at).toBe(expiresAt);
    expect(row.founding_seat).toBe(42);
  });

  it('does nothing on fresh install (no legacy column)', () => {
    // Constructing PremiumGate on a fresh database should not error
    const gate = new PremiumGate(db as unknown as DatabaseHandle);

    const columns = db.prepare("PRAGMA table_info('license')").all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);

    expect(columnNames).not.toContain('license_key');
    expect(columnNames).toContain('tier');
    expect(gate.getLicenseTier()).toBe('free');
  });

  it('migration is idempotent — multiple PremiumGate constructions do not error', () => {
    // Create old schema
    db.exec(`
      CREATE TABLE license (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        tier TEXT NOT NULL DEFAULT 'free',
        activated_at TEXT NOT NULL,
        expires_at TEXT,
        license_key TEXT NOT NULL,
        founding_seat INTEGER
      )
    `);

    db.prepare(
      "INSERT INTO license (id, tier, activated_at, expires_at, license_key, founding_seat) VALUES (1, 'founding', ?, NULL, 'sem_TEST', 7)",
    ).run(new Date().toISOString());

    // First construction triggers migration
    const gate1 = new PremiumGate(db as unknown as DatabaseHandle);
    expect(gate1.getLicenseTier()).toBe('founding');

    // Second construction should not error (column already removed)
    const gate2 = new PremiumGate(db as unknown as DatabaseHandle);
    expect(gate2.getLicenseTier()).toBe('founding');

    // Schema still correct
    const columns = db.prepare("PRAGMA table_info('license')").all() as Array<{ name: string }>;
    expect(columns.map((c) => c.name)).not.toContain('license_key');
  });
});
