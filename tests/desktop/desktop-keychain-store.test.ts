// Desktop KeychainStore Tests — Tauri stronghold-backed implementation.
//
// Covers:
// - set/get/delete round-trip via mocked Tauri invoke
// - Tracking table creation on construction
// - clear() removes all entries matching a service prefix
// - get() returns null for missing entries
// - delete() removes from both keychain and tracking table
// - Tracking table survives multiple operations

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { DesktopKeychainStore } from '@semblance/desktop/credentials/desktop-keychain-store';

describe('DesktopKeychainStore', () => {
  let db: InstanceType<typeof Database>;
  let store: DesktopKeychainStore;
  let mockKeychain: Map<string, string>;
  let mockInvoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    db = new Database(':memory:');
    mockKeychain = new Map<string, string>();

    mockInvoke = vi.fn(async (cmd: string, args: Record<string, unknown>) => {
      const key = `${args.service}::${args.account}`;
      if (cmd === 'plugin:stronghold|set_record') {
        mockKeychain.set(key, args.value as string);
        return undefined;
      }
      if (cmd === 'plugin:stronghold|get_record') {
        return mockKeychain.get(key) ?? null;
      }
      if (cmd === 'plugin:stronghold|delete_record') {
        mockKeychain.delete(key);
        return undefined;
      }
      throw new Error(`Unknown command: ${cmd}`);
    });

    store = new DesktopKeychainStore(mockInvoke, db);
  });

  afterEach(() => {
    db.close();
  });

  // ─── Construction ─────────────────────────────────────────────────────

  it('creates keychain_entries tracking table on construction', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='keychain_entries'"
    ).all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
    expect(tables[0]!.name).toBe('keychain_entries');
  });

  // ─── set/get round-trip ───────────────────────────────────────────────

  it('stores and retrieves a secret correctly', async () => {
    await store.set('semblance.credential.imap-1', 'password', 's3cret');

    const value = await store.get('semblance.credential.imap-1', 'password');
    expect(value).toBe('s3cret');
  });

  it('tracks entry in tracking table after set', async () => {
    await store.set('semblance.credential.imap-1', 'password', 's3cret');

    const rows = db.prepare('SELECT * FROM keychain_entries').all() as Array<{
      service: string;
      account: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.service).toBe('semblance.credential.imap-1');
    expect(rows[0]!.account).toBe('password');
  });

  it('overwrites existing entry on duplicate set', async () => {
    await store.set('semblance.credential.imap-1', 'password', 'old');
    await store.set('semblance.credential.imap-1', 'password', 'new');

    const value = await store.get('semblance.credential.imap-1', 'password');
    expect(value).toBe('new');

    // Tracking table should still have one entry (INSERT OR REPLACE)
    const rows = db.prepare('SELECT * FROM keychain_entries').all();
    expect(rows).toHaveLength(1);
  });

  // ─── get ──────────────────────────────────────────────────────────────

  it('returns null for non-existent entry', async () => {
    const value = await store.get('semblance.credential.nonexistent', 'password');
    expect(value).toBeNull();
  });

  it('returns null when invoke throws', async () => {
    const failingInvoke = vi.fn(async () => {
      throw new Error('Not found');
    });
    const failStore = new DesktopKeychainStore(failingInvoke, db);

    const value = await failStore.get('any', 'thing');
    expect(value).toBeNull();
  });

  // ─── delete ───────────────────────────────────────────────────────────

  it('removes entry from keychain and tracking table', async () => {
    await store.set('semblance.credential.imap-1', 'password', 's3cret');
    await store.delete('semblance.credential.imap-1', 'password');

    const value = await store.get('semblance.credential.imap-1', 'password');
    expect(value).toBeNull();

    const rows = db.prepare('SELECT * FROM keychain_entries').all();
    expect(rows).toHaveLength(0);
  });

  it('delete is safe for non-existent entries', async () => {
    // Should not throw
    await store.delete('nonexistent', 'password');
    const rows = db.prepare('SELECT * FROM keychain_entries').all();
    expect(rows).toHaveLength(0);
  });

  // ─── clear ────────────────────────────────────────────────────────────

  it('clears all entries matching a service prefix', async () => {
    await store.set('semblance.credential.imap-1', 'password', 'pass1');
    await store.set('semblance.credential.imap-1', 'username', 'user1');
    await store.set('semblance.credential.smtp-1', 'password', 'pass2');
    await store.set('semblance.oauth.google', 'access_token', 'at');

    // Clear all credential entries
    await store.clear('semblance.credential');

    // OAuth entry should remain
    const oauthValue = await store.get('semblance.oauth.google', 'access_token');
    expect(oauthValue).toBe('at');

    // Credential entries should be gone from tracking
    const rows = db.prepare(
      "SELECT * FROM keychain_entries WHERE service LIKE 'semblance.credential%'"
    ).all();
    expect(rows).toHaveLength(0);

    // OAuth tracking should remain
    const oauthRows = db.prepare(
      "SELECT * FROM keychain_entries WHERE service LIKE 'semblance.oauth%'"
    ).all();
    expect(oauthRows).toHaveLength(1);
  });

  it('clear is safe when no entries match prefix', async () => {
    await store.set('semblance.oauth.google', 'access_token', 'at');

    // Clear a non-matching prefix
    await store.clear('semblance.credential');

    // Nothing should be affected
    const value = await store.get('semblance.oauth.google', 'access_token');
    expect(value).toBe('at');
  });

  it('clear removes entries from keychain via invoke', async () => {
    await store.set('semblance.credential.imap-1', 'password', 's3cret');
    await store.clear('semblance.credential');

    // Verify delete was called on the keychain
    expect(mockInvoke).toHaveBeenCalledWith('plugin:stronghold|delete_record', {
      service: 'semblance.credential.imap-1',
      account: 'password',
    });
  });
});
