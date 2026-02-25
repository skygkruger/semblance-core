// Device Keypair Tests — Persistent identity key management.

import { describe, it, expect, beforeAll } from 'vitest';
import { getOrCreateDeviceKeyPair, exportPublicKey } from '@semblance/core/crypto/device-keypair.js';
import type { SecureStorageAdapter } from '@semblance/core/platform/types.js';
import { setPlatform } from '@semblance/core/platform/index.js';
import { createDesktopAdapter } from '@semblance/core/platform/desktop-adapter.js';

beforeAll(() => {
  setPlatform(createDesktopAdapter());
});

function createMockStorage(): SecureStorageAdapter {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
  };
}

describe('Device Keypair', () => {
  it('generates a key pair on first call and retrieves same on second call', async () => {
    const storage = createMockStorage();
    const kp1 = await getOrCreateDeviceKeyPair(storage);
    expect(kp1.privateKey).toHaveLength(32);
    expect(kp1.publicKey).toHaveLength(32);

    const kp2 = await getOrCreateDeviceKeyPair(storage);
    expect(kp2.privateKey.toString('hex')).toBe(kp1.privateKey.toString('hex'));
    expect(kp2.publicKey.toString('hex')).toBe(kp1.publicKey.toString('hex'));

    const pubHex = exportPublicKey(kp1);
    expect(pubHex).toHaveLength(64);
    expect(pubHex).toMatch(/^[0-9a-f]{64}$/);
  });
});
