import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { OAuthTokenManager } from '../../packages/gateway/services/oauth-token-manager.js';

describe('Sprint G — Multi-Account OAuth', () => {
  let db: Database.Database;
  let mgr: OAuthTokenManager;

  beforeEach(() => {
    db = new Database(':memory:');
    mgr = new OAuthTokenManager(db);
  });

  describe('schema migration', () => {
    it('migration is idempotent — running twice produces no errors', () => {
      mgr.migrateToMultiAccount();
      mgr.migrateToMultiAccount(); // Second run should be a no-op
    });

    it('migrates existing single-account rows to multi-account with is_primary=1', () => {
      // Insert a legacy row
      mgr.storeTokens({
        provider: 'gmail',
        accessToken: 'test-access',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() + 3600000,
        scopes: 'email calendar',
        userEmail: 'sky@example.com',
      });

      // Run migration
      mgr.migrateToMultiAccount();

      // Should have migrated the row
      const accounts = mgr.listAccounts('gmail');
      expect(accounts.length).toBeGreaterThanOrEqual(1);
      expect(accounts[0]!.isPrimary).toBe(true);
      expect(accounts[0]!.userEmail).toBe('sky@example.com');
    });

    it('preserves existing data after migration', () => {
      mgr.storeTokens({
        provider: 'google-calendar',
        accessToken: 'cal-access',
        refreshToken: 'cal-refresh',
        expiresAt: Date.now() + 3600000,
        scopes: 'calendar',
        userEmail: 'user@example.com',
      });

      mgr.migrateToMultiAccount();

      const accounts = mgr.listAllAccounts();
      expect(accounts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('multi-account CRUD', () => {
    beforeEach(() => {
      mgr.migrateToMultiAccount();
    });

    it('storeAccountTokens creates a new account', () => {
      mgr.storeAccountTokens({
        accountId: 'gmail:user1@example.com',
        provider: 'gmail',
        accessToken: 'access1',
        refreshToken: 'refresh1',
        expiresAt: Date.now() + 3600000,
        scopes: 'email',
        userEmail: 'user1@example.com',
        isPrimary: true,
      });

      const accounts = mgr.listAccounts('gmail');
      expect(accounts).toHaveLength(1);
      expect(accounts[0]!.accountId).toBe('gmail:user1@example.com');
    });

    it('supports multiple accounts for same provider', () => {
      mgr.storeAccountTokens({
        accountId: 'gmail:user1@example.com',
        provider: 'gmail',
        accessToken: 'a1', refreshToken: 'r1',
        expiresAt: Date.now() + 3600000, scopes: 'email',
        userEmail: 'user1@example.com', isPrimary: true,
      });
      mgr.storeAccountTokens({
        accountId: 'gmail:user2@example.com',
        provider: 'gmail',
        accessToken: 'a2', refreshToken: 'r2',
        expiresAt: Date.now() + 3600000, scopes: 'email',
        userEmail: 'user2@example.com', isPrimary: false,
      });

      const accounts = mgr.listAccounts('gmail');
      expect(accounts).toHaveLength(2);
    });

    it('setPrimary changes the primary account', () => {
      mgr.storeAccountTokens({
        accountId: 'gmail:a@b.com', provider: 'gmail',
        accessToken: 'a', refreshToken: 'r',
        expiresAt: Date.now() + 3600000, scopes: 'email',
        userEmail: 'a@b.com', isPrimary: true,
      });
      mgr.storeAccountTokens({
        accountId: 'gmail:c@d.com', provider: 'gmail',
        accessToken: 'a', refreshToken: 'r',
        expiresAt: Date.now() + 3600000, scopes: 'email',
        userEmail: 'c@d.com', isPrimary: false,
      });

      mgr.setPrimary('gmail:c@d.com');

      const accounts = mgr.listAccounts('gmail');
      const primary = accounts.find(a => a.isPrimary);
      expect(primary?.accountId).toBe('gmail:c@d.com');
    });

    it('removeAccount deletes a specific account', () => {
      mgr.storeAccountTokens({
        accountId: 'gmail:del@me.com', provider: 'gmail',
        accessToken: 'a', refreshToken: 'r',
        expiresAt: Date.now() + 3600000, scopes: 'email',
        userEmail: 'del@me.com',
      });

      mgr.removeAccount('gmail:del@me.com');
      const accounts = mgr.listAccounts('gmail');
      expect(accounts.find(a => a.accountId === 'gmail:del@me.com')).toBeUndefined();
    });

    it('getAccountTokens returns tokens for a specific account', () => {
      mgr.storeAccountTokens({
        accountId: 'gmail:test@test.com', provider: 'gmail',
        accessToken: 'mytoken', refreshToken: 'myrefresh',
        expiresAt: Date.now() + 3600000, scopes: 'email',
        userEmail: 'test@test.com',
      });

      const tokens = mgr.getAccountTokens('gmail:test@test.com');
      expect(tokens).not.toBeNull();
      expect(tokens!.provider).toBe('gmail');
    });

    it('listAllAccounts returns accounts across all providers', () => {
      mgr.storeAccountTokens({
        accountId: 'gmail:a@b.com', provider: 'gmail',
        accessToken: 'a', refreshToken: 'r',
        expiresAt: Date.now() + 3600000, scopes: 'email',
        userEmail: 'a@b.com', isPrimary: true,
      });
      mgr.storeAccountTokens({
        accountId: 'google-calendar:a@b.com', provider: 'google-calendar',
        accessToken: 'a', refreshToken: 'r',
        expiresAt: Date.now() + 3600000, scopes: 'calendar',
        userEmail: 'a@b.com', isPrimary: true,
      });

      const all = mgr.listAllAccounts();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('backwards compatibility', () => {
    it('getPrimaryAccount returns the primary account for a provider', () => {
      mgr.migrateToMultiAccount();
      mgr.storeAccountTokens({
        accountId: 'gmail:primary@test.com', provider: 'gmail',
        accessToken: 'tok', refreshToken: 'ref',
        expiresAt: Date.now() + 3600000, scopes: 'email',
        userEmail: 'primary@test.com', isPrimary: true,
      });

      const primary = mgr.getPrimaryAccount('gmail');
      expect(primary).not.toBeNull();
      expect(primary!.provider).toBe('gmail');
    });
  });
});
