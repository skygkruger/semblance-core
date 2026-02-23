// OAuthTokenManager — Stores and manages OAuth tokens for cloud services.
// Own SQLite table 'oauth_tokens'. Reuses encryption from credentials/encryption.ts.
// Separate from CredentialStore because OAuth tokens have different schema
// (access_token, refresh_token, expires_at, scopes) vs IMAP/SMTP credentials.

import type Database from 'better-sqlite3';
import { encryptPassword, decryptPassword, getEncryptionKey } from '../credentials/encryption.js';

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

  constructor(db: Database.Database, encryptionKeyPath?: string) {
    this.db = db;
    this.db.exec(CREATE_TABLE);
    this.encryptionKey = getEncryptionKey(encryptionKeyPath);
  }

  /** Store (or update) OAuth tokens for a provider. */
  storeTokens(tokens: OAuthTokens): void {
    const encryptedAccess = encryptPassword(this.encryptionKey, tokens.accessToken);
    const encryptedRefresh = encryptPassword(this.encryptionKey, tokens.refreshToken);

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
    const row = this.db.prepare(
      'SELECT access_token_encrypted FROM oauth_tokens WHERE provider = ?'
    ).get(provider) as { access_token_encrypted: string } | undefined;

    if (!row) return null;
    return decryptPassword(this.encryptionKey, row.access_token_encrypted);
  }

  /** Get the decrypted refresh token for a provider. Returns null if not stored. */
  getRefreshToken(provider: string): string | null {
    const row = this.db.prepare(
      'SELECT refresh_token_encrypted FROM oauth_tokens WHERE provider = ?'
    ).get(provider) as { refresh_token_encrypted: string } | undefined;

    if (!row) return null;
    return decryptPassword(this.encryptionKey, row.refresh_token_encrypted);
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

  /** Revoke all tokens for a provider (delete from storage). */
  revokeTokens(provider: string): void {
    this.db.prepare('DELETE FROM oauth_tokens WHERE provider = ?').run(provider);
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
