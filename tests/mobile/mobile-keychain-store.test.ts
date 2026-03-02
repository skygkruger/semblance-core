// Mobile KeychainStore Tests — react-native-keychain-backed implementation.
//
// Covers:
// - set/get/delete round-trip via mocked RN keychain
// - iOS accessible attribute set correctly
// - clear() removes all entries matching a service prefix
// - In-memory tracking for clear()
// - Service name includes account for uniqueness

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MobileKeychainStore } from '@semblance/mobile/credentials/keychain.native';

function createMockRNKeychain() {
  const store = new Map<string, { username: string; password: string }>();

  return {
    setGenericPassword: vi.fn(
      async (username: string, password: string, options?: { service?: string; accessible?: string }) => {
        const service = options?.service ?? 'default';
        store.set(service, { username, password });
        return true;
      },
    ),
    getGenericPassword: vi.fn(
      async (options?: { service?: string }) => {
        const service = options?.service ?? 'default';
        const entry = store.get(service);
        if (!entry) return false;
        return { password: entry.password };
      },
    ),
    resetGenericPassword: vi.fn(
      async (options?: { service?: string }) => {
        const service = options?.service ?? 'default';
        store.delete(service);
        return true;
      },
    ),
    _store: store, // For test inspection
  };
}

describe('MobileKeychainStore', () => {
  let keychain: ReturnType<typeof createMockRNKeychain>;
  let store: MobileKeychainStore;

  beforeEach(() => {
    keychain = createMockRNKeychain();
    store = new MobileKeychainStore(keychain);
  });

  // ─── set/get round-trip ───────────────────────────────────────────────

  it('stores and retrieves a secret correctly', async () => {
    await store.set('semblance.credential.imap-1', 'password', 's3cret');
    const value = await store.get('semblance.credential.imap-1', 'password');
    expect(value).toBe('s3cret');
  });

  it('combines service and account into keychain service identifier', async () => {
    await store.set('semblance.credential.imap-1', 'password', 's3cret');

    expect(keychain.setGenericPassword).toHaveBeenCalledWith(
      'password',
      's3cret',
      expect.objectContaining({
        service: 'semblance.credential.imap-1.password',
      }),
    );
  });

  it('sets iOS accessible attribute to WhenUnlockedThisDeviceOnly', async () => {
    await store.set('semblance.credential.imap-1', 'password', 's3cret');

    expect(keychain.setGenericPassword).toHaveBeenCalledWith(
      'password',
      's3cret',
      expect.objectContaining({
        accessible: 'AccessibleWhenUnlockedThisDeviceOnly',
      }),
    );
  });

  it('stores multiple credentials independently', async () => {
    await store.set('semblance.credential.imap-1', 'password', 'pass1');
    await store.set('semblance.credential.smtp-1', 'password', 'pass2');

    const v1 = await store.get('semblance.credential.imap-1', 'password');
    const v2 = await store.get('semblance.credential.smtp-1', 'password');
    expect(v1).toBe('pass1');
    expect(v2).toBe('pass2');
  });

  // ─── get ──────────────────────────────────────────────────────────────

  it('returns null for non-existent entry', async () => {
    const value = await store.get('semblance.credential.nonexistent', 'password');
    expect(value).toBeNull();
  });

  // ─── delete ───────────────────────────────────────────────────────────

  it('removes entry from keychain', async () => {
    await store.set('semblance.credential.imap-1', 'password', 's3cret');
    await store.delete('semblance.credential.imap-1', 'password');

    const value = await store.get('semblance.credential.imap-1', 'password');
    expect(value).toBeNull();
  });

  it('calls resetGenericPassword with correct service', async () => {
    await store.set('semblance.credential.imap-1', 'password', 's3cret');
    await store.delete('semblance.credential.imap-1', 'password');

    expect(keychain.resetGenericPassword).toHaveBeenCalledWith({
      service: 'semblance.credential.imap-1.password',
    });
  });

  // ─── clear ────────────────────────────────────────────────────────────

  it('clears all entries matching a service prefix', async () => {
    await store.set('semblance.credential.imap-1', 'password', 'pass1');
    await store.set('semblance.credential.smtp-1', 'password', 'pass2');
    await store.set('semblance.oauth.google', 'access_token', 'at');

    await store.clear('semblance.credential');

    // OAuth should remain
    const oauthValue = await store.get('semblance.oauth.google', 'access_token');
    expect(oauthValue).toBe('at');

    // Credentials should be gone
    const v1 = await store.get('semblance.credential.imap-1', 'password');
    const v2 = await store.get('semblance.credential.smtp-1', 'password');
    expect(v1).toBeNull();
    expect(v2).toBeNull();
  });

  it('clear is safe when no entries match', async () => {
    await store.set('semblance.oauth.google', 'access_token', 'at');

    // Should not throw
    await store.clear('semblance.credential');

    const value = await store.get('semblance.oauth.google', 'access_token');
    expect(value).toBe('at');
  });

  it('clear removes entries from in-memory tracking', async () => {
    await store.set('semblance.credential.imap-1', 'password', 'pass1');
    await store.clear('semblance.credential');

    // After clear, the tracking should be empty for that prefix
    // Verify by clearing again — should not call resetGenericPassword again
    keychain.resetGenericPassword.mockClear();
    await store.clear('semblance.credential');
    expect(keychain.resetGenericPassword).not.toHaveBeenCalled();
  });
});
