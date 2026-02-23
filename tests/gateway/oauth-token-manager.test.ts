// OAuthTokenManager Tests — Token storage, encryption, expiry, and revocation.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { OAuthTokenManager } from '../../packages/gateway/services/oauth-token-manager.js';
import { join } from 'node:path';
import { mkdirSync, existsSync, unlinkSync, writeFileSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';

describe('OAuthTokenManager', () => {
  let db: Database.Database;
  let manager: OAuthTokenManager;
  let tempDir: string;
  let keyPath: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `oauth-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    keyPath = join(tempDir, 'test.key');
    // Write a test encryption key
    writeFileSync(keyPath, randomBytes(32));
    db = new Database(':memory:');
    manager = new OAuthTokenManager(db, keyPath);
  });

  afterEach(() => {
    db.close();
    try { rmSync(tempDir, { recursive: true }); } catch {}
  });

  it('stores and retrieves tokens with encryption', () => {
    manager.storeTokens({
      provider: 'google_drive',
      accessToken: 'access-token-123',
      refreshToken: 'refresh-token-456',
      expiresAt: Date.now() + 3600_000,
      scopes: 'https://www.googleapis.com/auth/drive.readonly',
      userEmail: 'user@gmail.com',
    });

    const accessToken = manager.getAccessToken('google_drive');
    expect(accessToken).toBe('access-token-123');

    const refreshToken = manager.getRefreshToken('google_drive');
    expect(refreshToken).toBe('refresh-token-456');

    // Verify tokens are encrypted in the database (not plaintext)
    const row = db.prepare('SELECT access_token_encrypted FROM oauth_tokens WHERE provider = ?')
      .get('google_drive') as { access_token_encrypted: string };
    expect(row.access_token_encrypted).not.toBe('access-token-123');
    expect(row.access_token_encrypted).not.toContain('access-token-123');
  });

  it('hasValidTokens returns false when no tokens exist', () => {
    expect(manager.hasValidTokens('google_drive')).toBe(false);
  });

  it('detects token expiry correctly', () => {
    // Store expired token
    manager.storeTokens({
      provider: 'google_drive',
      accessToken: 'expired-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() - 1000, // Already expired
      scopes: 'drive.readonly',
    });

    expect(manager.isTokenExpired('google_drive')).toBe(true);
    expect(manager.hasValidTokens('google_drive')).toBe(false);

    // Store valid token
    manager.storeTokens({
      provider: 'dropbox',
      accessToken: 'valid-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3600_000,
      scopes: 'files.read',
    });

    expect(manager.isTokenExpired('dropbox')).toBe(false);
    expect(manager.hasValidTokens('dropbox')).toBe(true);
  });

  it('revokeTokens clears stored tokens', () => {
    manager.storeTokens({
      provider: 'google_drive',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3600_000,
      scopes: 'drive.readonly',
    });

    expect(manager.hasValidTokens('google_drive')).toBe(true);
    manager.revokeTokens('google_drive');
    expect(manager.hasValidTokens('google_drive')).toBe(false);
    expect(manager.getAccessToken('google_drive')).toBeNull();
    expect(manager.getRefreshToken('google_drive')).toBeNull();
  });
});
