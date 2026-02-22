// AES-256-GCM Encryption Tests — Tests for platform crypto and sync crypto.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setPlatform, resetPlatform } from '../../../packages/core/platform/index.js';
import { createDesktopAdapter } from '../../../packages/core/platform/desktop-adapter.js';
import { PlatformSyncCrypto } from '../../../packages/core/routing/platform-sync-crypto.js';
import type { EncryptedPayload } from '../../../packages/core/platform/types.js';

describe('Desktop CryptoAdapter AES-256-GCM', () => {
  const adapter = createDesktopAdapter();
  const crypto = adapter.crypto;

  it('generateEncryptionKey returns 64-char hex string', async () => {
    const key = await crypto.generateEncryptionKey();
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('encrypt → decrypt roundtrip', async () => {
    const key = await crypto.generateEncryptionKey();
    const plaintext = 'Hello, Semblance! This is a secret message.';
    const payload = await crypto.encrypt(plaintext, key);
    const decrypted = await crypto.decrypt(payload, key);
    expect(decrypted).toBe(plaintext);
  });

  it('wrong key throws on decrypt', async () => {
    const key1 = await crypto.generateEncryptionKey();
    const key2 = await crypto.generateEncryptionKey();
    const payload = await crypto.encrypt('secret data', key1);
    await expect(crypto.decrypt(payload, key2)).rejects.toThrow();
  });

  it('tampered ciphertext throws (GCM auth)', async () => {
    const key = await crypto.generateEncryptionKey();
    const payload = await crypto.encrypt('secret data', key);

    // Tamper with ciphertext
    const tamperedCt = Buffer.from(payload.ciphertext, 'base64');
    tamperedCt[0] = (tamperedCt[0]! ^ 0xff);
    const tampered: EncryptedPayload = {
      ...payload,
      ciphertext: tamperedCt.toString('base64'),
    };

    await expect(crypto.decrypt(tampered, key)).rejects.toThrow();
  });

  it('tampered IV throws', async () => {
    const key = await crypto.generateEncryptionKey();
    const payload = await crypto.encrypt('secret data', key);

    const tamperedIv = Buffer.from(payload.iv, 'base64');
    tamperedIv[0] = (tamperedIv[0]! ^ 0xff);
    const tampered: EncryptedPayload = {
      ...payload,
      iv: tamperedIv.toString('base64'),
    };

    await expect(crypto.decrypt(tampered, key)).rejects.toThrow();
  });

  it('each encrypt produces unique IV', async () => {
    const key = await crypto.generateEncryptionKey();
    const p1 = await crypto.encrypt('same text', key);
    const p2 = await crypto.encrypt('same text', key);
    expect(p1.iv).not.toBe(p2.iv);
  });

  it('payload has correct structure', async () => {
    const key = await crypto.generateEncryptionKey();
    const payload = await crypto.encrypt('test', key);
    expect(typeof payload.ciphertext).toBe('string');
    expect(typeof payload.iv).toBe('string');
    expect(typeof payload.tag).toBe('string');
    // IV should be 12 bytes → 16 chars base64
    expect(Buffer.from(payload.iv, 'base64')).toHaveLength(12);
    // Tag should be 16 bytes
    expect(Buffer.from(payload.tag, 'base64')).toHaveLength(16);
  });

  it('handles empty string', async () => {
    const key = await crypto.generateEncryptionKey();
    const payload = await crypto.encrypt('', key);
    const decrypted = await crypto.decrypt(payload, key);
    expect(decrypted).toBe('');
  });

  it('handles unicode and long text', async () => {
    const key = await crypto.generateEncryptionKey();
    const plaintext = 'Unicode test: \u{1F680}\u{1F30D}\u{2764}\u{FE0F} ' + 'a'.repeat(10000);
    const payload = await crypto.encrypt(plaintext, key);
    const decrypted = await crypto.decrypt(payload, key);
    expect(decrypted).toBe(plaintext);
  });
});

describe('PlatformSyncCrypto (AES-256-GCM)', () => {
  let syncCrypto: PlatformSyncCrypto;

  beforeEach(() => {
    setPlatform(createDesktopAdapter());
    syncCrypto = new PlatformSyncCrypto();
  });

  afterEach(() => {
    resetPlatform();
  });

  it('encrypt → decrypt roundtrip via sync interface', async () => {
    const secret = 'my-pairing-secret-key';
    const plaintext = '{"items": [{"id": "1", "type": "preference"}]}';

    const { ciphertext, iv } = await syncCrypto.encrypt(plaintext, secret);
    const decrypted = await syncCrypto.decrypt(ciphertext, iv, secret);
    expect(decrypted).toBe(plaintext);
  });

  it('wrong secret throws on decrypt', async () => {
    const { ciphertext, iv } = await syncCrypto.encrypt('data', 'secret-1');
    await expect(syncCrypto.decrypt(ciphertext, iv, 'secret-2')).rejects.toThrow();
  });

  it('ciphertext field contains packed GCM tag', async () => {
    const { ciphertext } = await syncCrypto.encrypt('test', 'secret');
    const parsed = JSON.parse(ciphertext) as { c: string; t: string };
    expect(typeof parsed.c).toBe('string');
    expect(typeof parsed.t).toBe('string');
  });

  it('hmac produces consistent results', async () => {
    const h1 = await syncCrypto.hmac('data', 'key');
    const h2 = await syncCrypto.hmac('data', 'key');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 hex
  });
});
