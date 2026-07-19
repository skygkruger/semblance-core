import { createDecipheriv } from 'node:crypto';
import type { KeyStore } from '../keys/key-store.js';
import {
  kernelCloudApiKey,
  kernelOAuthAccessKey,
  kernelOAuthRefreshKey,
} from '../keys/key-store.js';
import type { SqliteDatabase } from '../keys/secure-storage-migration.js';

export type ConnectorSecretKind = 'access_token' | 'refresh_token' | 'api_key';

const MIGRATED_SENTINEL = 'MIGRATED_TO_KEYCHAIN';
const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function connectorSecretKey(
  provider: string,
  kind: ConnectorSecretKind,
  accountId?: string,
): string {
  const subject = accountId ?? provider;
  switch (kind) {
    case 'access_token':
      return kernelOAuthAccessKey(subject);
    case 'refresh_token':
      return kernelOAuthRefreshKey(subject);
    case 'api_key':
      return kernelCloudApiKey(subject);
  }
}

export class ConnectorSecretStore {
  constructor(private readonly keyStore: KeyStore) {}

  async getSecret(
    provider: string,
    kind: ConnectorSecretKind,
    accountId?: string,
  ): Promise<string | null> {
    return this.keyStore.get(connectorSecretKey(provider, kind, accountId));
  }

  async setSecret(
    provider: string,
    kind: ConnectorSecretKind,
    value: string,
    accountId?: string,
  ): Promise<void> {
    await this.keyStore.set(connectorSecretKey(provider, kind, accountId), value);
  }

  async deleteSecret(
    provider: string,
    kind: ConnectorSecretKind,
    accountId?: string,
  ): Promise<void> {
    await this.keyStore.delete(connectorSecretKey(provider, kind, accountId));
  }

  async deleteAllSecrets(provider: string, accountId?: string): Promise<void> {
    await Promise.all([
      this.deleteSecret(provider, 'access_token', accountId),
      this.deleteSecret(provider, 'refresh_token', accountId),
    ]);
  }
}

export function createConnectorSecretStore(keyStore: KeyStore): ConnectorSecretStore {
  return new ConnectorSecretStore(keyStore);
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

function tableHasColumn(db: SqliteDatabase, table: string, column: string): boolean {
  try {
    const columns = db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>;
    return columns.some((entry) => entry.name === column);
  } catch {
    return false;
  }
}

export interface LegacyOAuthMigrationResult {
  rowsMigrated: number;
  errors: string[];
}

/**
 * Move legacy OAuth token ciphertext from SQLite into the kernel KeyStore,
 * then replace SQLite token columns with the migrated sentinel.
 */
export async function migrateLegacyOAuthTokensToKernel(
  db: SqliteDatabase,
  secretStore: ConnectorSecretStore,
  encryptionKey: Buffer,
  migratedSentinel: string = MIGRATED_SENTINEL,
): Promise<LegacyOAuthMigrationResult> {
  const result: LegacyOAuthMigrationResult = { rowsMigrated: 0, errors: [] };

  let rows: Array<{
    provider: string;
    account_id?: string;
    access_token_encrypted: string;
    refresh_token_encrypted: string;
  }> = [];

  try {
    if (tableHasColumn(db, 'oauth_tokens', 'account_id')) {
      rows = db.prepare(
        `SELECT provider, account_id, access_token_encrypted, refresh_token_encrypted
         FROM oauth_tokens
         WHERE access_token_encrypted != ? OR refresh_token_encrypted != ?`,
      ).all(migratedSentinel, migratedSentinel) as typeof rows;
    } else {
      rows = db.prepare(
        `SELECT provider, access_token_encrypted, refresh_token_encrypted
         FROM oauth_tokens
         WHERE access_token_encrypted != ? OR refresh_token_encrypted != ?`,
      ).all(migratedSentinel, migratedSentinel) as typeof rows;
    }
  } catch (err) {
    result.errors.push(
      `oauth_tokens query failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return result;
  }

  for (const row of rows) {
    const accountId = row.account_id;
    const storageProvider = row.provider;
    try {
      if (row.access_token_encrypted !== migratedSentinel) {
        const accessToken = decryptLegacySecret(encryptionKey, row.access_token_encrypted);
        await secretStore.setSecret(storageProvider, 'access_token', accessToken, accountId);
      }
      if (row.refresh_token_encrypted !== migratedSentinel) {
        const refreshToken = decryptLegacySecret(encryptionKey, row.refresh_token_encrypted);
        await secretStore.setSecret(storageProvider, 'refresh_token', refreshToken, accountId);
      }

      if (accountId) {
        db.prepare(
          `UPDATE oauth_tokens SET
             access_token_encrypted = ?,
             refresh_token_encrypted = ?
           WHERE account_id = ?`,
        ).run(migratedSentinel, migratedSentinel, accountId);
      } else {
        db.prepare(
          `UPDATE oauth_tokens SET
             access_token_encrypted = ?,
             refresh_token_encrypted = ?
           WHERE provider = ?`,
        ).run(migratedSentinel, migratedSentinel, storageProvider);
      }

      result.rowsMigrated += 1;
    } catch (err) {
      result.errors.push(
        `OAuth migration failed for ${accountId ?? storageProvider}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return result;
}
