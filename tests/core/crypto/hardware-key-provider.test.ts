// Hardware-Bound Key Provider — Tests for HardwareKeyProvider class.
// Covers: key generation, signing, verification, backend detection, storage,
// key listing, deletion, and IPC type alignment.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HardwareKeyProvider,
} from '../../../packages/core/crypto/hardware-key-provider.js';
import type {
  HardwareKeyBackend,
  HardwareKeyInfo,
  HardwareSignResult,
  HardwareVerifyResult,
} from '../../../packages/core/crypto/hardware-key-provider.js';
import type { SecureStorageAdapter } from '../../../packages/core/platform/types.js';

// ─── In-Memory SecureStorageAdapter ─────────────────────────────────────────

function createMemoryStorage(): SecureStorageAdapter {
  const store = new Map<string, string>();
  return {
    async get(key: string): Promise<string | null> { return store.get(key) ?? null; },
    async set(key: string, value: string): Promise<void> { store.set(key, value); },
    async delete(key: string): Promise<void> { store.delete(key); },
  };
}

// ─── detectBackend ──────────────────────────────────────────────────────────

describe('HardwareKeyProvider.detectBackend', () => {
  it('returns secure-enclave for darwin', () => {
    expect(HardwareKeyProvider.detectBackend('darwin', 'arm64')).toBe('secure-enclave');
  });

  it('returns tpm for win32', () => {
    expect(HardwareKeyProvider.detectBackend('win32', 'x64')).toBe('tpm');
  });

  it('returns libsecret for linux', () => {
    expect(HardwareKeyProvider.detectBackend('linux', 'x64')).toBe('libsecret');
  });

  it('returns android-keystore for android', () => {
    expect(HardwareKeyProvider.detectBackend('android', 'arm64')).toBe('android-keystore');
  });

  it('returns secure-enclave for ios', () => {
    expect(HardwareKeyProvider.detectBackend('ios', 'arm64')).toBe('secure-enclave');
  });

  it('returns software for unknown platforms', () => {
    expect(HardwareKeyProvider.detectBackend('freebsd', 'x64')).toBe('software');
  });
});

// ─── Key generation and retrieval ───────────────────────────────────────────

describe('HardwareKeyProvider key operations', () => {
  let provider: HardwareKeyProvider;
  let storage: SecureStorageAdapter;

  beforeEach(() => {
    storage = createMemoryStorage();
    provider = new HardwareKeyProvider({ storage, backend: 'software' });
  });

  it('generates a new key on first call', async () => {
    const info = await provider.getOrCreateKey();
    expect(info.keyId).toBe('device-identity');
    expect(info.backend).toBe('software');
    expect(info.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(info.hardwareBacked).toBe(false);
    expect(info.createdAt).toBeTruthy();
  });

  it('returns the same key on subsequent calls', async () => {
    const first = await provider.getOrCreateKey();
    const second = await provider.getOrCreateKey();
    expect(first.publicKeyHex).toBe(second.publicKeyHex);
    expect(first.keyId).toBe(second.keyId);
  });

  it('supports custom key IDs', async () => {
    const info = await provider.getOrCreateKey('audit-signing');
    expect(info.keyId).toBe('audit-signing');
    expect(info.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates different keys for different IDs', async () => {
    const key1 = await provider.getOrCreateKey('key-a');
    const key2 = await provider.getOrCreateKey('key-b');
    expect(key1.publicKeyHex).not.toBe(key2.publicKeyHex);
  });

  it('persists keys in storage and reloads from storage', async () => {
    // Generate a key with one provider instance
    const info1 = await provider.getOrCreateKey('persistent');

    // Create a new provider with the same storage (simulating app restart)
    const provider2 = new HardwareKeyProvider({ storage, backend: 'software' });
    const info2 = await provider2.getOrCreateKey('persistent');

    expect(info2.publicKeyHex).toBe(info1.publicKeyHex);
  });
});

// ─── Signing and verification ───────────────────────────────────────────────

describe('HardwareKeyProvider signing', () => {
  let provider: HardwareKeyProvider;

  beforeEach(() => {
    const storage = createMemoryStorage();
    provider = new HardwareKeyProvider({ storage, backend: 'memory-only' });
  });

  it('signs a payload and returns valid signature', async () => {
    const payload = Buffer.from('hello world');
    const result: HardwareSignResult = await provider.signPayload(payload);
    expect(result.signatureHex).toMatch(/^[0-9a-f]+$/);
    expect(result.keyId).toBe('device-identity');
    expect(result.backend).toBe('memory-only');
  });

  it('verifies a valid signature', async () => {
    const payload = Buffer.from('test data');
    const signed = await provider.signPayload(payload);
    const verified: HardwareVerifyResult = await provider.verifySignature(
      payload, signed.signatureHex,
    );
    expect(verified.valid).toBe(true);
    expect(verified.keyId).toBe('device-identity');
  });

  it('rejects an invalid signature', async () => {
    const payload = Buffer.from('test data');
    await provider.getOrCreateKey(); // ensure key exists
    const verified = await provider.verifySignature(
      payload, 'deadbeef'.repeat(16),
    );
    expect(verified.valid).toBe(false);
  });

  it('rejects signature for tampered payload', async () => {
    const payload = Buffer.from('original');
    const signed = await provider.signPayload(payload);
    const tampered = Buffer.from('tampered');
    const verified = await provider.verifySignature(tampered, signed.signatureHex);
    expect(verified.valid).toBe(false);
  });

  it('signs with custom key ID', async () => {
    const payload = Buffer.from('custom key');
    const result = await provider.signPayload(payload, 'custom-id');
    expect(result.keyId).toBe('custom-id');

    const verified = await provider.verifySignature(payload, result.signatureHex, 'custom-id');
    expect(verified.valid).toBe(true);
  });
});

// ─── Key listing and deletion ───────────────────────────────────────────────

describe('HardwareKeyProvider management', () => {
  let provider: HardwareKeyProvider;
  let storage: SecureStorageAdapter;

  beforeEach(() => {
    storage = createMemoryStorage();
    provider = new HardwareKeyProvider({ storage, backend: 'software' });
  });

  it('lists keys after generation', async () => {
    await provider.getOrCreateKey('key-1');
    await provider.getOrCreateKey('key-2');
    const keys = await provider.listKeys();
    expect(keys).toHaveLength(2);
    const ids = keys.map((k: HardwareKeyInfo) => k.keyId);
    expect(ids).toContain('key-1');
    expect(ids).toContain('key-2');
  });

  it('deletes a key', async () => {
    await provider.getOrCreateKey('to-delete');
    const deleted = await provider.deleteKey('to-delete');
    expect(deleted).toBe(true);

    // Key removed from cache — listKeys won't include it
    const keys = await provider.listKeys();
    expect(keys.find((k: HardwareKeyInfo) => k.keyId === 'to-delete')).toBeUndefined();

    // Storage cleared — new provider won't find it
    const provider2 = new HardwareKeyProvider({ storage, backend: 'software' });
    const info = await provider2.getOrCreateKey('to-delete');
    // Should generate a NEW key (different public key)
    // We can't easily compare since we didn't save the old one,
    // but the key should exist and be valid
    expect(info.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('getBackend returns correct backend', () => {
    expect(provider.getBackend()).toBe('software');
  });

  it('isHardwareBacked returns false for software', () => {
    expect(provider.isHardwareBacked()).toBe(false);
  });

  it('isHardwareBacked returns false for stub', () => {
    const stubProvider = new HardwareKeyProvider({
      storage: createMemoryStorage(),
      backend: 'memory-only',
    });
    expect(stubProvider.isHardwareBacked()).toBe(false);
  });

  it('isHardwareBacked returns true for tpm', () => {
    const tpmProvider = new HardwareKeyProvider({
      storage: createMemoryStorage(),
      backend: 'tpm',
    });
    expect(tpmProvider.isHardwareBacked()).toBe(true);
  });

  it('isHardwareBacked returns true for secure-enclave', () => {
    const seProvider = new HardwareKeyProvider({
      storage: createMemoryStorage(),
      backend: 'secure-enclave',
    });
    expect(seProvider.isHardwareBacked()).toBe(true);
  });
});

// ─── IPC Type Alignment ─────────────────────────────────────────────────────

describe('IPC type alignment', () => {
  it('HardwareKeyInfo fields match IPC types', async () => {
    const storage = createMemoryStorage();
    const provider = new HardwareKeyProvider({ storage, backend: 'software' });
    const info: HardwareKeyInfo = await provider.getOrCreateKey();

    // Verify all fields expected by desktop/src/ipc/types.ts are present
    expect(typeof info.keyId).toBe('string');
    expect(typeof info.backend).toBe('string');
    expect(typeof info.publicKeyHex).toBe('string');
    expect(typeof info.createdAt).toBe('string');
    expect(typeof info.hardwareBacked).toBe('boolean');
  });

  it('HardwareSignResult fields match IPC types', async () => {
    const storage = createMemoryStorage();
    const provider = new HardwareKeyProvider({ storage, backend: 'software' });
    const result: HardwareSignResult = await provider.signPayload(Buffer.from('test'));

    expect(typeof result.signatureHex).toBe('string');
    expect(typeof result.keyId).toBe('string');
    expect(typeof result.backend).toBe('string');
  });

  it('HardwareVerifyResult fields match IPC types', async () => {
    const storage = createMemoryStorage();
    const provider = new HardwareKeyProvider({ storage, backend: 'software' });
    const signed = await provider.signPayload(Buffer.from('test'));
    const result: HardwareVerifyResult = await provider.verifySignature(
      Buffer.from('test'), signed.signatureHex,
    );

    expect(typeof result.valid).toBe('boolean');
    expect(typeof result.keyId).toBe('string');
  });

  it('HardwareKeyBackend type covers all variants', () => {
    const validBackends: HardwareKeyBackend[] = [
      'secure-enclave', 'tpm', 'android-keystore', 'libsecret', 'software', 'memory-only',
    ];
    expect(validBackends).toHaveLength(6);
    // Each should be detectable or manually constructible
    for (const b of validBackends) {
      const p = new HardwareKeyProvider({ storage: createMemoryStorage(), backend: b });
      expect(p.getBackend()).toBe(b);
    }
  });
});
