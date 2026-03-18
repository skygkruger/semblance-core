// OAuthTokenManager — Stores and manages OAuth tokens for cloud services.
// Own SQLite table 'oauth_tokens'. Reuses encryption from credentials/encryption.ts.
// Post-migration: tokens stored in OS keychain, SQLite has sentinel + metadata.
// Separate from CredentialStore because OAuth tokens have different schema
// (access_token, refresh_token, expires_at, scopes) vs IMAP/SMTP credentials.

import type Database from 'better-sqlite3';
import { encryptPassword, decryptPassword, getEncryptionKey } from '../credentials/encryption.js';
import type { KeychainStore } from '@semblance/core';
import { keychainOAuthServiceName, MIGRATED_SENTINEL } from '@semblance/core';

export interface OAuthTokens {
  provider: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;        // Unix timestamp (ms)
  scopes: string;
  userEmail?: string;
}

export interface OAuthAccount {
  accountId: string;        // '{provider}:{userEmail}'
  provider: string;
  userEmail: string;
  displayName: string | null;
  scopes: string;
  isPrimary: boolean;
  expiresAt: number;
  createdAt: string;
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS oauth_tokens (
    provider TEXT PRIMARY KEY,
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    scopes TEXT NOT NULL,
    user_email TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

export class OAuthTokenManager {
  private db: Database.Database;
  private encryptionKey: Buffer;
  private keychain: KeychainStore | null;

  constructor(db: Database.Database, encryptionKeyPath?: string, keychain?: KeychainStore) {
    this.db = db;
    this.db.exec(CREATE_TABLE);
    this.encryptionKey = getEncryptionKey(encryptionKeyPath);
    this.keychain = keychain ?? null;
  }

  /** Store (or update) OAuth tokens for a provider. */
  storeTokens(tokens: OAuthTokens): void {
    let encryptedAccess: string;
    let encryptedRefresh: string;

    if (this.keychain) {
      // Store tokens in keychain, use sentinel in SQLite
      const service = keychainOAuthServiceName(tokens.provider);
      this.keychain.set(service, 'access_token', tokens.accessToken).catch((err) => {
        console.error(`[OAuthTokenManager] Failed to store access token in keychain for ${tokens.provider}:`, err);
      });
      this.keychain.set(service, 'refresh_token', tokens.refreshToken).catch((err) => {
        console.error(`[OAuthTokenManager] Failed to store refresh token in keychain for ${tokens.provider}:`, err);
      });
      encryptedAccess = MIGRATED_SENTINEL;
      encryptedRefresh = MIGRATED_SENTINEL;
    } else {
      encryptedAccess = encryptPassword(this.encryptionKey, tokens.accessToken);
      encryptedRefresh = encryptPassword(this.encryptionKey, tokens.refreshToken);
    }

    this.db.prepare(`
      INSERT INTO oauth_tokens (provider, access_token_encrypted, refresh_token_encrypted, expires_at, scopes, user_email, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(provider) DO UPDATE SET
        access_token_encrypted = excluded.access_token_encrypted,
        refresh_token_encrypted = excluded.refresh_token_encrypted,
        expires_at = excluded.expires_at,
        scopes = excluded.scopes,
        user_email = excluded.user_email,
        updated_at = datetime('now')
    `).run(
      tokens.provider,
      encryptedAccess,
      encryptedRefresh,
      tokens.expiresAt,
      tokens.scopes,
      tokens.userEmail ?? null,
    );
  }

  /** Get the decrypted access token for a provider. Returns null if not stored. */
  getAccessToken(provider: string): string | null {
    // Check keychain first (synchronous fallback for backward compat)
    // For async keychain access, use getAccessTokenAsync()
    const row = this.db.prepare(
      'SELECT access_token_encrypted FROM oauth_tokens WHERE provider = ?'
    ).get(provider) as { access_token_encrypted: string } | undefined;

    if (!row) return null;
    if (row.access_token_encrypted === MIGRATED_SENTINEL) {
      // Token is in keychain — caller must use getAccessTokenAsync()
      return null;
    }
    return decryptPassword(this.encryptionKey, row.access_token_encrypted);
  }

  /** Get access token with keychain support (async). */
  async getAccessTokenAsync(provider: string): Promise<string | null> {
    if (this.keychain) {
      const service = keychainOAuthServiceName(provider);
      const fromKeychain = await this.keychain.get(service, 'access_token');
      if (fromKeychain) return fromKeychain;
    }
    return this.getAccessToken(provider);
  }

  /** Get the decrypted refresh token for a provider. Returns null if not stored. */
  getRefreshToken(provider: string): string | null {
    const row = this.db.prepare(
      'SELECT refresh_token_encrypted FROM oauth_tokens WHERE provider = ?'
    ).get(provider) as { refresh_token_encrypted: string } | undefined;

    if (!row) return null;
    if (row.refresh_token_encrypted === MIGRATED_SENTINEL) {
      return null;
    }
    return decryptPassword(this.encryptionKey, row.refresh_token_encrypted);
  }

  /** Get refresh token with keychain support (async). */
  async getRefreshTokenAsync(provider: string): Promise<string | null> {
    if (this.keychain) {
      const service = keychainOAuthServiceName(provider);
      const fromKeychain = await this.keychain.get(service, 'refresh_token');
      if (fromKeychain) return fromKeychain;
    }
    return this.getRefreshToken(provider);
  }

  /** Check if the stored access token is expired (or will expire within bufferMs). */
  isTokenExpired(provider: string, bufferMs: number = 60000): boolean {
    const row = this.db.prepare(
      'SELECT expires_at FROM oauth_tokens WHERE provider = ?'
    ).get(provider) as { expires_at: number } | undefined;

    if (!row) return true;
    return Date.now() + bufferMs >= row.expires_at;
  }

  /**
   * Refresh the access token using the stored refresh token.
   * Caller provides the actual HTTP call result — this method just stores the new tokens.
   */
  refreshAccessToken(provider: string, newAccessToken: string, newExpiresAt: number, newRefreshToken?: string): void {
    if (this.keychain) {
      // Store in keychain, sentinel in SQLite
      const service = keychainOAuthServiceName(provider);
      this.keychain.set(service, 'access_token', newAccessToken).catch((err) => {
        console.error(`[OAuthTokenManager] Failed to refresh access token in keychain for ${provider}:`, err);
      });

      if (newRefreshToken) {
        this.keychain.set(service, 'refresh_token', newRefreshToken).catch((err) => {
          console.error(`[OAuthTokenManager] Failed to refresh refresh token in keychain for ${provider}:`, err);
        });
        this.db.prepare(`
          UPDATE oauth_tokens SET
            access_token_encrypted = ?,
            refresh_token_encrypted = ?,
            expires_at = ?,
            updated_at = datetime('now')
          WHERE provider = ?
        `).run(MIGRATED_SENTINEL, MIGRATED_SENTINEL, newExpiresAt, provider);
      } else {
        this.db.prepare(`
          UPDATE oauth_tokens SET
            access_token_encrypted = ?,
            expires_at = ?,
            updated_at = datetime('now')
          WHERE provider = ?
        `).run(MIGRATED_SENTINEL, newExpiresAt, provider);
      }
    } else {
      const encryptedAccess = encryptPassword(this.encryptionKey, newAccessToken);
      if (newRefreshToken) {
        const encryptedRefresh = encryptPassword(this.encryptionKey, newRefreshToken);
        this.db.prepare(`
          UPDATE oauth_tokens SET
            access_token_encrypted = ?,
            refresh_token_encrypted = ?,
            expires_at = ?,
            updated_at = datetime('now')
          WHERE provider = ?
        `).run(encryptedAccess, encryptedRefresh, newExpiresAt, provider);
      } else {
        this.db.prepare(`
          UPDATE oauth_tokens SET
            access_token_encrypted = ?,
            expires_at = ?,
            updated_at = datetime('now')
          WHERE provider = ?
        `).run(encryptedAccess, newExpiresAt, provider);
      }
    }
  }

  /** Revoke all tokens for a provider (delete from storage + keychain). */
  revokeTokens(provider: string): void {
    this.db.prepare('DELETE FROM oauth_tokens WHERE provider = ?').run(provider);

    // Clean up keychain entries
    if (this.keychain) {
      const service = keychainOAuthServiceName(provider);
      this.keychain.delete(service, 'access_token').catch(() => {});
      this.keychain.delete(service, 'refresh_token').catch(() => {});
    }
  }

  /** Check if valid (non-expired) tokens exist for a provider. */
  hasValidTokens(provider: string): boolean {
    const row = this.db.prepare(
      'SELECT expires_at FROM oauth_tokens WHERE provider = ?'
    ).get(provider) as { expires_at: number } | undefined;

    if (!row) return false;
    return Date.now() < row.expires_at;
  }

  /** Get the stored user email for a provider. */
  getUserEmail(provider: string): string | null {
    const row = this.db.prepare(
      'SELECT user_email FROM oauth_tokens WHERE provider = ?'
    ).get(provider) as { user_email: string | null } | undefined;

    return row?.user_email ?? null;
  }

  // ─── Multi-Account Methods (Sprint G) ────────────────────────────────────

  /**
   * Run the multi-account schema migration (idempotent).
   * Adds account_id, display_name, is_primary columns if missing.
   */
  migrateToMultiAccount(): void {
    // Check if already migrated by looking for account_id column
    const tableInfo = this.db.prepare("PRAGMA table_info('oauth_tokens')").all() as Array<{ name: string }>;
    const hasAccountId = tableInfo.some(col => col.name === 'account_id');

    if (hasAccountId) return; // Already migrated

    console.error('[OAuthTokenManager] Migrating to multi-account schema...');

    // Count existing rows for logging
    const beforeCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM oauth_tokens').get() as { cnt: number }).cnt;

    // Create v2 table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS oauth_tokens_v2 (
        account_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        user_email TEXT NOT NULL,
        display_name TEXT,
        access_token_encrypted TEXT NOT NULL,
        refresh_token_encrypted TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        scopes TEXT NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_v2_provider ON oauth_tokens_v2(provider);
      CREATE INDEX IF NOT EXISTS idx_v2_email ON oauth_tokens_v2(user_email);
      CREATE INDEX IF NOT EXISTS idx_v2_primary ON oauth_tokens_v2(provider, is_primary);
    `);

    // Migrate existing rows
    const existingRows = this.db.prepare('SELECT * FROM oauth_tokens').all() as Array<{
      provider: string;
      access_token_encrypted: string;
      refresh_token_encrypted: string;
      expires_at: number;
      scopes: string;
      user_email: string | null;
      created_at: string;
      updated_at: string;
    }>;

    const insertV2 = this.db.prepare(`
      INSERT OR IGNORE INTO oauth_tokens_v2 (account_id, provider, user_email, display_name, access_token_encrypted, refresh_token_encrypted, expires_at, scopes, is_primary, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 1, ?, ?)
    `);

    for (const row of existingRows) {
      const email = row.user_email ?? row.provider;
      const accountId = `${row.provider}:${email}`;
      insertV2.run(
        accountId, row.provider, email,
        row.access_token_encrypted, row.refresh_token_encrypted,
        row.expires_at, row.scopes,
        row.created_at ?? new Date().toISOString(),
        row.updated_at ?? new Date().toISOString(),
      );
    }

    // Replace old table with v2
    this.db.exec('DROP TABLE oauth_tokens');
    this.db.exec('ALTER TABLE oauth_tokens_v2 RENAME TO oauth_tokens');

    const afterCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM oauth_tokens').get() as { cnt: number }).cnt;
    console.error(`[OAuthTokenManager] Migration complete: ${beforeCount} → ${afterCount} rows`);
  }

  /** Store tokens for a specific account (creates or updates). */
  storeAccountTokens(tokens: OAuthTokens & { accountId: string; isPrimary?: boolean }): void {
    let encryptedAccess: string;
    let encryptedRefresh: string;

    if (this.keychain) {
      const service = keychainOAuthServiceName(tokens.accountId);
      this.keychain.set(service, 'access_token', tokens.accessToken).catch(() => {});
      this.keychain.set(service, 'refresh_token', tokens.refreshToken).catch(() => {});
      encryptedAccess = MIGRATED_SENTINEL;
      encryptedRefresh = MIGRATED_SENTINEL;
    } else {
      encryptedAccess = encryptPassword(this.encryptionKey, tokens.accessToken);
      encryptedRefresh = encryptPassword(this.encryptionKey, tokens.refreshToken);
    }

    // Check if account_id column exists (migration may not have run)
    const tableInfo = this.db.prepare("PRAGMA table_info('oauth_tokens')").all() as Array<{ name: string }>;
    if (!tableInfo.some(col => col.name === 'account_id')) {
      // Fallback to legacy storeTokens
      this.storeTokens(tokens);
      return;
    }

    this.db.prepare(`
      INSERT INTO oauth_tokens (account_id, provider, user_email, access_token_encrypted, refresh_token_encrypted, expires_at, scopes, is_primary, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(account_id) DO UPDATE SET
        access_token_encrypted = excluded.access_token_encrypted,
        refresh_token_encrypted = excluded.refresh_token_encrypted,
        expires_at = excluded.expires_at,
        scopes = excluded.scopes,
        is_primary = excluded.is_primary,
        updated_at = datetime('now')
    `).run(
      tokens.accountId,
      tokens.provider,
      tokens.userEmail ?? tokens.provider,
      encryptedAccess,
      encryptedRefresh,
      tokens.expiresAt,
      tokens.scopes,
      (tokens.isPrimary ?? false) ? 1 : 0,
    );
  }

  /** Get tokens for a specific account ID. */
  getAccountTokens(accountId: string): OAuthTokens | null {
    const row = this.db.prepare(
      'SELECT * FROM oauth_tokens WHERE account_id = ?'
    ).get(accountId) as {
      account_id: string;
      provider: string;
      user_email: string;
      access_token_encrypted: string;
      refresh_token_encrypted: string;
      expires_at: number;
      scopes: string;
    } | undefined;

    if (!row) return null;

    const accessToken = row.access_token_encrypted === MIGRATED_SENTINEL
      ? '' // Caller must use async keychain path
      : decryptPassword(this.encryptionKey, row.access_token_encrypted);

    const refreshToken = row.refresh_token_encrypted === MIGRATED_SENTINEL
      ? ''
      : decryptPassword(this.encryptionKey, row.refresh_token_encrypted);

    return {
      provider: row.provider,
      accessToken,
      refreshToken,
      expiresAt: row.expires_at,
      scopes: row.scopes,
      userEmail: row.user_email,
    };
  }

  /** List all accounts for a provider. */
  listAccounts(provider: string): OAuthAccount[] {
    const rows = this.db.prepare(
      'SELECT account_id, provider, user_email, display_name, scopes, is_primary, expires_at, created_at FROM oauth_tokens WHERE provider = ? ORDER BY is_primary DESC, created_at ASC'
    ).all(provider) as Array<{
      account_id: string; provider: string; user_email: string;
      display_name: string | null; scopes: string; is_primary: number;
      expires_at: number; created_at: string;
    }>;

    return rows.map(r => ({
      accountId: r.account_id,
      provider: r.provider,
      userEmail: r.user_email,
      displayName: r.display_name,
      scopes: r.scopes,
      isPrimary: r.is_primary === 1,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
    }));
  }

  /** List all accounts across all providers. */
  listAllAccounts(): OAuthAccount[] {
    const rows = this.db.prepare(
      'SELECT account_id, provider, user_email, display_name, scopes, is_primary, expires_at, created_at FROM oauth_tokens ORDER BY provider, is_primary DESC, created_at ASC'
    ).all() as Array<{
      account_id: string; provider: string; user_email: string;
      display_name: string | null; scopes: string; is_primary: number;
      expires_at: number; created_at: string;
    }>;

    return rows.map(r => ({
      accountId: r.account_id,
      provider: r.provider,
      userEmail: r.user_email,
      displayName: r.display_name,
      scopes: r.scopes,
      isPrimary: r.is_primary === 1,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
    }));
  }

  /** Set an account as primary for its provider. */
  setPrimary(accountId: string): void {
    const row = this.db.prepare('SELECT provider FROM oauth_tokens WHERE account_id = ?')
      .get(accountId) as { provider: string } | undefined;
    if (!row) throw new Error(`Account ${accountId} not found`);

    // Clear existing primary for this provider
    this.db.prepare('UPDATE oauth_tokens SET is_primary = 0 WHERE provider = ?').run(row.provider);
    // Set new primary
    this.db.prepare('UPDATE oauth_tokens SET is_primary = 1 WHERE account_id = ?').run(accountId);
  }

  /** Remove a specific account. */
  removeAccount(accountId: string): void {
    this.db.prepare('DELETE FROM oauth_tokens WHERE account_id = ?').run(accountId);

    if (this.keychain) {
      const service = keychainOAuthServiceName(accountId);
      this.keychain.delete(service, 'access_token').catch(() => {});
      this.keychain.delete(service, 'refresh_token').catch(() => {});
    }
  }

  /** Get the primary account for a provider (backwards-compatible). */
  getPrimaryAccount(provider: string): OAuthTokens | null {
    const row = this.db.prepare(
      'SELECT * FROM oauth_tokens WHERE provider = ? AND is_primary = 1'
    ).get(provider) as {
      account_id: string; provider: string; user_email: string;
      access_token_encrypted: string; refresh_token_encrypted: string;
      expires_at: number; scopes: string;
    } | undefined;

    if (!row) {
      // Fallback: any account for this provider
      return this.getAccountTokens(`${provider}:${provider}`);
    }

    const accessToken = row.access_token_encrypted === MIGRATED_SENTINEL ? '' : decryptPassword(this.encryptionKey, row.access_token_encrypted);
    const refreshToken = row.refresh_token_encrypted === MIGRATED_SENTINEL ? '' : decryptPassword(this.encryptionKey, row.refresh_token_encrypted);

    return {
      provider: row.provider,
      accessToken,
      refreshToken,
      expiresAt: row.expires_at,
      scopes: row.scopes,
      userEmail: row.user_email,
    };
  }
}
