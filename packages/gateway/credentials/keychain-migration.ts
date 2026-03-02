// Keychain Migration — Silent one-way migration of encrypted credentials to OS keychain.
//
// On startup, checks for encrypted credentials in SQLite that haven't been migrated.
// For each: decrypt with existing AES key → write to keychain → mark SQLite row as migrated.
//
// The migration is idempotent and safe to run multiple times.
// On failure: logs error, keeps old store working, surfaces warning.

import type Database from 'better-sqlite3';
import type { KeychainStore } from '@semblance/core';
import { keychainServiceName, keychainOAuthServiceName, MIGRATED_SENTINEL } from '@semblance/core';
import { decryptPassword } from './encryption.js';

export interface MigrationResult {
  credentialsMigrated: number;
  oauthTokensMigrated: number;
  errors: string[];
}

/**
 * Migrate encrypted credentials from SQLite to OS keychain.
 * Runs on Gateway startup. Idempotent — safe to call every launch.
 */
export async function migrateCredentialsToKeychain(
  db: Database.Database,
  keychain: KeychainStore,
  encryptionKey: Buffer,
): Promise<MigrationResult> {
  const result: MigrationResult = {
    credentialsMigrated: 0,
    oauthTokensMigrated: 0,
    errors: [],
  };

  // ─── Migrate service_credentials (IMAP/SMTP/CalDAV passwords) ──────────

  try {
    const credentials = db.prepare(
      `SELECT id, username, encrypted_password FROM service_credentials
       WHERE encrypted_password != ?`
    ).all(MIGRATED_SENTINEL) as Array<{
      id: string;
      username: string;
      encrypted_password: string;
    }>;

    for (const cred of credentials) {
      try {
        const password = decryptPassword(encryptionKey, cred.encrypted_password);
        const service = keychainServiceName(cred.id);

        await keychain.set(service, 'password', password);

        // Mark as migrated in SQLite
        db.prepare(
          'UPDATE service_credentials SET encrypted_password = ? WHERE id = ?'
        ).run(MIGRATED_SENTINEL, cred.id);

        result.credentialsMigrated++;
      } catch (err) {
        const msg = `Failed to migrate credential ${cred.id}: ${err instanceof Error ? err.message : String(err)}`;
        result.errors.push(msg);
        console.error(`[KeychainMigration] ${msg}`);
      }
    }
  } catch (err) {
    // Table might not exist yet — that's fine
    if (!(err instanceof Error && err.message.includes('no such table'))) {
      result.errors.push(`Credential migration query failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ─── Migrate oauth_tokens (access + refresh tokens) ────────────────────

  try {
    const tokens = db.prepare(
      `SELECT provider, access_token_encrypted, refresh_token_encrypted
       FROM oauth_tokens
       WHERE access_token_encrypted != ?`
    ).all(MIGRATED_SENTINEL) as Array<{
      provider: string;
      access_token_encrypted: string;
      refresh_token_encrypted: string;
    }>;

    for (const token of tokens) {
      try {
        const accessToken = decryptPassword(encryptionKey, token.access_token_encrypted);
        const refreshToken = decryptPassword(encryptionKey, token.refresh_token_encrypted);
        const service = keychainOAuthServiceName(token.provider);

        await keychain.set(service, 'access_token', accessToken);
        await keychain.set(service, 'refresh_token', refreshToken);

        // Mark as migrated in SQLite — keep metadata (expires_at, scopes, user_email)
        db.prepare(
          `UPDATE oauth_tokens SET
             access_token_encrypted = ?,
             refresh_token_encrypted = ?
           WHERE provider = ?`
        ).run(MIGRATED_SENTINEL, MIGRATED_SENTINEL, token.provider);

        result.oauthTokensMigrated++;
      } catch (err) {
        const msg = `Failed to migrate OAuth tokens for ${token.provider}: ${err instanceof Error ? err.message : String(err)}`;
        result.errors.push(msg);
        console.error(`[KeychainMigration] ${msg}`);
      }
    }
  } catch (err) {
    if (!(err instanceof Error && err.message.includes('no such table'))) {
      result.errors.push(`OAuth migration query failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (result.credentialsMigrated > 0 || result.oauthTokensMigrated > 0) {
    console.log(
      `[KeychainMigration] Migrated ${result.credentialsMigrated} credentials and ${result.oauthTokensMigrated} OAuth tokens to OS keychain`
    );
  }

  return result;
}
