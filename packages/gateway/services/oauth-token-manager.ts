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
}
