import { createDecipheriv } from 'node:crypto';
import type { KeyStore } from './key-store.js';
import {
  ENTITLEMENT_BEARER_KEY,
  LICENSE_KEY,
  kernelCloudApiKey,
  kernelCloudMetadataKey,
  kernelOAuthAccessKey,
  kernelOAuthRefreshKey,
} from './key-store.js';

const MIGRATED_SENTINEL = 'MIGRATED_TO_KEYCHAIN';
const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export const SECURE_STORAGE_MIGRATION_ID = 'slice-2-secure-storage';

export interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown | undefined;
  run(...params: unknown[]): { changes?: number };
}

export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
}

export interface SecureStorageMigrationOptions {
  keyStore: KeyStore;
  db: SqliteDatabase;
  encryptionKey: Buffer;
  migratedSentinel?: string;
}

export interface SecureStorageMigrationResult {
  entitlementBearerMigrated: boolean;
  licenseKeyMigrated: boolean;
  oauthProvidersMigrated: number;
  cloudCredentialsMigrated: number;
  errors: string[];
}

function decryptLegacySecret(key: Buffer, encrypted: string): string {
  const packed = Buffer.from(encrypted, 'base64');
  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Invalid encrypted data: too short');
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
}

function tableExists(db: SqliteDatabase, table: string): boolean {
  try {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(table) as { name?: string } | undefined;
    return row?.name === table;
  } catch {
    return false;
  }
}

function columnExists(db: SqliteDatabase, table: string, column: string): boolean {
  try {
    const columns = db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>;
    return columns.some((entry) => entry.name === column);
  } catch {
    return false;
  }
}

/**
 * Migrate legacy SQLite/prefs plaintext secrets into the kernel KeyStore,
 * then remove or sentinel-mark the legacy copies.
 */
export async function migrateLegacySecretsToKeyStore(
  options: SecureStorageMigrationOptions,
): Promise<SecureStorageMigrationResult> {
  const { keyStore, db, encryptionKey } = options;
  const sentinel = options.migratedSentinel ?? MIGRATED_SENTINEL;
  const result: SecureStorageMigrationResult = {
    entitlementBearerMigrated: false,
    licenseKeyMigrated: false,
    oauthProvidersMigrated: 0,
    cloudCredentialsMigrated: 0,
    errors: [],
  };

  // ─── preferences.active_license_key ───────────────────────────────────────

  if (tableExists(db, 'preferences')) {
    try {
      const row = db.prepare(
        "SELECT value FROM preferences WHERE key = 'active_license_key'",
      ).get() as { value?: unknown } | undefined;

      const value = typeof row?.value === 'string' ? row.value.trim() : '';
      if (value.length > 0) {
        if (value.startsWith('sem_')) {
          await keyStore.set(LICENSE_KEY, value);
          result.licenseKeyMigrated = true;
        } else {
          await keyStore.set(ENTITLEMENT_BEARER_KEY, value);
          result.entitlementBearerMigrated = true;
        }
        db.prepare("DELETE FROM preferences WHERE key = 'active_license_key'").run();
      }
    } catch (err) {
      result.errors.push(
        `preferences migration failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── license.license_key column (legacy schema) ───────────────────────────

  if (tableExists(db, 'license') && columnExists(db, 'license', 'license_key')) {
    try {
      const row = db.prepare('SELECT license_key FROM license WHERE id = 1').get() as {
        license_key?: unknown;
      } | undefined;
      const legacyKey = typeof row?.license_key === 'string' ? row.license_key.trim() : '';
      if (legacyKey.length > 0 && legacyKey !== sentinel) {
        await keyStore.set(LICENSE_KEY, legacyKey);
        result.licenseKeyMigrated = true;
      }
    } catch (err) {
      result.errors.push(
        `license column migration failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── oauth_tokens ─────────────────────────────────────────────────────────

  if (tableExists(db, 'oauth_tokens')) {
    try {
      const tokens = db.prepare(
        `SELECT provider, access_token_encrypted, refresh_token_encrypted
         FROM oauth_tokens
         WHERE access_token_encrypted != ? OR refresh_token_encrypted != ?`,
      ).all(sentinel, sentinel) as Array<{
        provider: string;
        access_token_encrypted: string;
        refresh_token_encrypted: string;
      }>;

      for (const token of tokens) {
        try {
          if (token.access_token_encrypted !== sentinel) {
            const accessToken = decryptLegacySecret(encryptionKey, token.access_token_encrypted);
            await keyStore.set(kernelOAuthAccessKey(token.provider), accessToken);
          }
          if (token.refresh_token_encrypted !== sentinel) {
            const refreshToken = decryptLegacySecret(encryptionKey, token.refresh_token_encrypted);
            await keyStore.set(kernelOAuthRefreshKey(token.provider), refreshToken);
          }

          db.prepare(
            `UPDATE oauth_tokens SET
               access_token_encrypted = ?,
               refresh_token_encrypted = ?
             WHERE provider = ?`,
          ).run(sentinel, sentinel, token.provider);

          result.oauthProvidersMigrated += 1;
        } catch (err) {
          result.errors.push(
            `OAuth migration failed for ${token.provider}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      if (!(err instanceof Error && err.message.includes('no such table'))) {
        result.errors.push(
          `oauth_tokens query failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // ─── cloud_bridge_credentials (legacy prefs SQLite) ─────────────────────

  if (tableExists(db, 'cloud_bridge_credentials')) {
    try {
      const rows = db.prepare(
        'SELECT service, account, value FROM cloud_bridge_credentials',
      ).all() as Array<{ service: string; account: string; value: string }>;

      const providers = new Map<string, { apiKey?: string; metadata?: string }>();
      for (const row of rows) {
        const prefix = 'semblance.cloud-bridge.';
        if (!row.service.startsWith(prefix)) {
          continue;
        }
        const providerId = row.service.slice(prefix.length);
        const entry = providers.get(providerId) ?? {};
        if (row.account === 'api_key') {
          entry.apiKey = row.value;
        } else if (row.account === 'metadata') {
          entry.metadata = row.value;
        }
        providers.set(providerId, entry);
      }

      for (const [providerId, creds] of providers) {
        try {
          if (creds.apiKey) {
            await keyStore.set(kernelCloudApiKey(providerId), creds.apiKey);
          }
          if (creds.metadata) {
            await keyStore.set(kernelCloudMetadataKey(providerId), creds.metadata);
          }
          db.prepare(
            'DELETE FROM cloud_bridge_credentials WHERE service = ?',
          ).run(`semblance.cloud-bridge.${providerId}`);
          result.cloudCredentialsMigrated += 1;
        } catch (err) {
          result.errors.push(
            `Cloud credential migration failed for ${providerId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      result.errors.push(
        `cloud_bridge_credentials query failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}

/** Returns true when any legacy plaintext secret remains in SQLite/prefs. */
export function hasLegacyPlaintextSecrets(db: SqliteDatabase, migratedSentinel = MIGRATED_SENTINEL): boolean {
  if (tableExists(db, 'preferences')) {
    const pref = db.prepare(
      "SELECT value FROM preferences WHERE key = 'active_license_key'",
    ).get() as { value?: unknown } | undefined;
    if (typeof pref?.value === 'string' && pref.value.trim().length > 0) {
      return true;
    }
  }

  if (tableExists(db, 'license') && columnExists(db, 'license', 'license_key')) {
    const row = db.prepare('SELECT license_key FROM license WHERE id = 1').get() as {
      license_key?: unknown;
    } | undefined;
    const legacyKey = typeof row?.license_key === 'string' ? row.license_key.trim() : '';
    if (legacyKey.length > 0 && legacyKey !== migratedSentinel) {
      return true;
    }
  }

  if (tableExists(db, 'oauth_tokens')) {
    const oauth = db.prepare(
      `SELECT COUNT(*) AS count FROM oauth_tokens
       WHERE access_token_encrypted != ? OR refresh_token_encrypted != ?`,
    ).get(migratedSentinel, migratedSentinel) as { count?: number } | undefined;
    if ((oauth?.count ?? 0) > 0) {
      return true;
    }
  }

  if (tableExists(db, 'cloud_bridge_credentials')) {
    const cloud = db.prepare(
      'SELECT COUNT(*) AS count FROM cloud_bridge_credentials',
    ).get() as { count?: number } | undefined;
    if ((cloud?.count ?? 0) > 0) {
      return true;
    }
  }

  return false;
}
