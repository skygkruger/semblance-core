import { randomBytes, createCipheriv } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createOsKeyStore,
  createMemorySecureStorageBackend,
  isFileKeyStoreFallbackAllowed,
} from '../src/keys/os-key-store.js';
import { createFileKeyStore, deleteFileKeyStore } from '../src/keys/file-key-store.js';
import {
  migrateLegacySecretsToKeyStore,
  hasLegacyPlaintextSecrets,
  type SqliteDatabase,
  type SqliteStatement,
} from '../src/keys/secure-storage-migration.js';
import {
  ENTITLEMENT_BEARER_KEY,
  LICENSE_KEY,
  kernelCloudApiKey,
  kernelCloudMetadataKey,
  kernelOAuthAccessKey,
  kernelOAuthRefreshKey,
} from '../src/keys/key-store.js';

const MIGRATED_SENTINEL = 'MIGRATED_TO_KEYCHAIN';
const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function encryptLegacySecret(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

interface LegacyState {
  preferences: Map<string, string>;
  license: {
    id: number;
    tier: string;
    activated_at: string;
    expires_at: string | null;
    license_key: string | null;
    founding_seat: number | null;
  } | null;
  oauthTokens: Map<string, { access_token_encrypted: string; refresh_token_encrypted: string }>;
  cloudCredentials: Map<string, Map<string, string>>;
  tables: Set<string>;
  columns: Map<string, Set<string>>;
}

class MockStatement implements SqliteStatement {
  constructor(
    private readonly sql: string,
    private readonly state: LegacyState,
  ) {}

  all(...params: unknown[]): unknown[] {
    if (this.sql.includes('sqlite_master')) {
      const table = String(params[0]);
      return this.state.tables.has(table) ? [{ name: table }] : [];
    }

    if (this.sql.startsWith('PRAGMA table_info')) {
      const match = this.sql.match(/'([^']+)'/);
      const table = match?.[1] ?? '';
      const columns = this.state.columns.get(table) ?? new Set<string>();
      return [...columns].map((name) => ({ name }));
    }

    if (this.sql.includes('FROM preferences')) {
      const key = this.sql.includes("'active_license_key'")
        ? 'active_license_key'
        : String(params[0] ?? 'active_license_key');
      const value = this.state.preferences.get(key);
      return value === undefined ? [] : [{ value }];
    }

    if (this.sql.includes('FROM oauth_tokens')) {
      const sentinel = String(params[0] ?? MIGRATED_SENTINEL);
      return [...this.state.oauthTokens.entries()]
        .filter(([, token]) => token.access_token_encrypted !== sentinel || token.refresh_token_encrypted !== sentinel)
        .map(([provider, token]) => ({ provider, ...token }));
    }

    if (this.sql.includes('FROM cloud_bridge_credentials')) {
      const rows: Array<{ service: string; account: string; value: string }> = [];
      for (const [service, accounts] of this.state.cloudCredentials) {
        for (const [account, value] of accounts) {
          rows.push({ service, account, value });
        }
      }
      return rows;
    }

    if (this.sql.includes('COUNT(*) AS count FROM oauth_tokens')) {
      const sentinel = String(params[0] ?? MIGRATED_SENTINEL);
      const count = [...this.state.oauthTokens.values()].filter(
        (token) => token.access_token_encrypted !== sentinel || token.refresh_token_encrypted !== sentinel,
      ).length;
      return [{ count }];
    }

    if (this.sql.includes('COUNT(*) AS count FROM cloud_bridge_credentials')) {
      let count = 0;
      for (const accounts of this.state.cloudCredentials.values()) {
        count += accounts.size > 0 ? 1 : 0;
      }
      return [{ count: this.state.cloudCredentials.size }];
    }

    return [];
  }

  get(...params: unknown[]): unknown | undefined {
    const rows = this.all(...params);
    return rows[0];
  }

  run(...params: unknown[]): { changes?: number } {
    if (this.sql.startsWith('INSERT INTO preferences')) {
      this.state.preferences.set(String(params[0]), String(params[1]));
      return { changes: 1 };
    }

    if (this.sql.startsWith('DELETE FROM preferences')) {
      const key = this.sql.includes("'active_license_key'")
        ? 'active_license_key'
        : String(params[0]);
      this.state.preferences.delete(key);
      return { changes: 1 };
    }

    if (this.sql.startsWith('INSERT INTO oauth_tokens')) {
      this.state.oauthTokens.set(String(params[0]), {
        access_token_encrypted: String(params[1]),
        refresh_token_encrypted: String(params[2]),
      });
      return { changes: 1 };
    }

    if (this.sql.startsWith('UPDATE oauth_tokens')) {
      const provider = String(params[2]);
      const existing = this.state.oauthTokens.get(provider);
      if (existing) {
        this.state.oauthTokens.set(provider, {
          access_token_encrypted: String(params[0]),
          refresh_token_encrypted: String(params[1]),
        });
      }
      return { changes: 1 };
    }

    if (this.sql.startsWith('INSERT INTO cloud_bridge_credentials')) {
      const service = String(params[0]);
      const account = String(params[1]);
      const value = String(params[2]);
      const accounts = this.state.cloudCredentials.get(service) ?? new Map<string, string>();
      accounts.set(account, value);
      this.state.cloudCredentials.set(service, accounts);
      return { changes: 1 };
    }

    if (this.sql.startsWith('DELETE FROM cloud_bridge_credentials')) {
      this.state.cloudCredentials.delete(String(params[0]));
      return { changes: 1 };
    }

    return { changes: 0 };
  }
}

class MockLegacyDatabase implements SqliteDatabase {
  readonly state: LegacyState = {
    preferences: new Map(),
    license: null,
    oauthTokens: new Map(),
    cloudCredentials: new Map(),
    tables: new Set(['preferences', 'license', 'oauth_tokens', 'cloud_bridge_credentials']),
    columns: new Map([
      ['license', new Set(['id', 'tier', 'activated_at', 'expires_at', 'license_key', 'founding_seat'])],
      ['oauth_tokens', new Set(['provider', 'access_token_encrypted', 'refresh_token_encrypted'])],
      ['cloud_bridge_credentials', new Set(['service', 'account', 'value'])],
      ['preferences', new Set(['key', 'value'])],
    ]),
  };

  prepare(sql: string): SqliteStatement {
    return new MockStatement(sql, this.state);
  }

  exec(_sql: string): void {
    // Schema creation is represented by the default table set.
  }
}

describe('createOsKeyStore', () => {
  it('refuses file fallback unless explicitly allowlisted', () => {
    const previous = process.env.SEMBLANCE_ALLOW_FILE_KEYSTORE;
    delete process.env.SEMBLANCE_ALLOW_FILE_KEYSTORE;

    expect(() => createOsKeyStore()).toThrow(/SecureStorageBackend/);
    expect(isFileKeyStoreFallbackAllowed()).toBe(false);

    if (previous !== undefined) {
      process.env.SEMBLANCE_ALLOW_FILE_KEYSTORE = previous;
    }
  });

  it('allows file fallback when SEMBLANCE_ALLOW_FILE_KEYSTORE=1', () => {
    const previous = process.env.SEMBLANCE_ALLOW_FILE_KEYSTORE;
    process.env.SEMBLANCE_ALLOW_FILE_KEYSTORE = '1';

    const dir = mkdtempSync(join(tmpdir(), 'semblance-kernel-keystore-'));
    const path = join(dir, 'keystore.json');
    const store = createOsKeyStore({ fileStorePath: path });

    expect(isFileKeyStoreFallbackAllowed()).toBe(true);

    rmSync(dir, { recursive: true, force: true });
    if (previous === undefined) {
      delete process.env.SEMBLANCE_ALLOW_FILE_KEYSTORE;
    } else {
      process.env.SEMBLANCE_ALLOW_FILE_KEYSTORE = previous;
    }

    expect(store).toBeDefined();
  });

  it('uses injected SecureStorageBackend in production-style setup', async () => {
    const backend = createMemorySecureStorageBackend();
    const store = createOsKeyStore({ backend });

    await store.set(LICENSE_KEY, 'sem_test_key');
    expect(await store.get(LICENSE_KEY)).toBe('sem_test_key');
  });
});

describe('migrateLegacySecretsToKeyStore', () => {
  let db: MockLegacyDatabase;
  let keyStoreDir: string;
  let fileStorePath: string;
  let encryptionKey: Buffer;

  beforeEach(() => {
    db = new MockLegacyDatabase();
    encryptionKey = randomBytes(32);
    keyStoreDir = mkdtempSync(join(tmpdir(), 'semblance-kernel-migration-'));
    fileStorePath = join(keyStoreDir, 'keystore.json');
  });

  afterEach(() => {
    rmSync(keyStoreDir, { recursive: true, force: true });
  });

  it('moves entitlement bearer and license keys into KeyStore and clears legacy prefs', async () => {
    db.prepare("INSERT INTO preferences (key, value) VALUES ('active_license_key', ?)").run(
      'active_license_key',
      'sem_LEGACY_LICENSE_KEY',
    );

    const keyStore = createFileKeyStore(fileStorePath);
    const result = await migrateLegacySecretsToKeyStore({
      keyStore,
      db,
      encryptionKey,
    });

    expect(result.licenseKeyMigrated).toBe(true);
    expect(await keyStore.get(LICENSE_KEY)).toBe('sem_LEGACY_LICENSE_KEY');
    expect(db.state.preferences.has('active_license_key')).toBe(false);
    expect(hasLegacyPlaintextSecrets(db)).toBe(false);
  });

  it('routes non-sem reservation bearer to entitlement key', async () => {
    const reservationJwt = 'eyJhbGciOiJIUzI1NiJ9.reservation';
    db.prepare("INSERT INTO preferences (key, value) VALUES ('active_license_key', ?)").run(
      'active_license_key',
      reservationJwt,
    );

    const keyStore = createFileKeyStore(fileStorePath);
    await migrateLegacySecretsToKeyStore({ keyStore, db, encryptionKey });

    expect(await keyStore.get(ENTITLEMENT_BEARER_KEY)).toBe(reservationJwt);
    expect(await keyStore.get(LICENSE_KEY)).toBeNull();
  });

  it('migrates OAuth tokens and marks SQLite rows as migrated', async () => {
    const accessEncrypted = encryptLegacySecret(encryptionKey, 'access-secret');
    const refreshEncrypted = encryptLegacySecret(encryptionKey, 'refresh-secret');

    db.prepare(
      `INSERT INTO oauth_tokens (provider, access_token_encrypted, refresh_token_encrypted)
       VALUES ('google', ?, ?)`,
    ).run('google', accessEncrypted, refreshEncrypted);

    const keyStore = createFileKeyStore(fileStorePath);
    const result = await migrateLegacySecretsToKeyStore({ keyStore, db, encryptionKey });

    expect(result.oauthProvidersMigrated).toBe(1);
    expect(await keyStore.get(kernelOAuthAccessKey('google'))).toBe('access-secret');
    expect(await keyStore.get(kernelOAuthRefreshKey('google'))).toBe('refresh-secret');

    const token = db.state.oauthTokens.get('google');
    expect(token?.access_token_encrypted).toBe(MIGRATED_SENTINEL);
    expect(token?.refresh_token_encrypted).toBe(MIGRATED_SENTINEL);
  });

  it('migrates cloud bridge credentials and deletes legacy rows', async () => {
    db.prepare(
      `INSERT INTO cloud_bridge_credentials (service, account, value)
       VALUES ('semblance.cloud-bridge.anthropic', 'api_key', 'sk-ant-test')`,
    ).run('semblance.cloud-bridge.anthropic', 'api_key', 'sk-ant-test');
    db.prepare(
      `INSERT INTO cloud_bridge_credentials (service, account, value)
       VALUES ('semblance.cloud-bridge.anthropic', 'metadata', '{"storedAt":"2026-01-01T00:00:00.000Z"}')`,
    ).run('semblance.cloud-bridge.anthropic', 'metadata', '{"storedAt":"2026-01-01T00:00:00.000Z"}');

    const keyStore = createFileKeyStore(fileStorePath);
    const result = await migrateLegacySecretsToKeyStore({ keyStore, db, encryptionKey });

    expect(result.cloudCredentialsMigrated).toBe(1);
    expect(await keyStore.get(kernelCloudApiKey('anthropic'))).toBe('sk-ant-test');
    expect(await keyStore.get(kernelCloudMetadataKey('anthropic'))).toContain('storedAt');
    expect(db.state.cloudCredentials.size).toBe(0);
  });

  it('detects legacy plaintext before migration and clears it after', async () => {
    db.prepare("INSERT INTO preferences (key, value) VALUES ('active_license_key', ?)").run(
      'active_license_key',
      'sem_x',
    );
    expect(hasLegacyPlaintextSecrets(db)).toBe(true);

    const keyStore = createFileKeyStore(fileStorePath);
    await migrateLegacySecretsToKeyStore({ keyStore, db, encryptionKey });

    expect(hasLegacyPlaintextSecrets(db)).toBe(false);
    expect(existsSync(fileStorePath)).toBe(true);
    deleteFileKeyStore(fileStorePath);
  });
});
