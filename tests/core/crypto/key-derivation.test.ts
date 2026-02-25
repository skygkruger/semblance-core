// Key Derivation Tests — Argon2id and legacy SHA-256.

import { describe, it, expect, beforeAll } from 'vitest';
import { deriveKey, deriveKeyLegacy, generateSalt } from '@semblance/core/crypto/key-derivation.js';
import { setPlatform } from '@semblance/core/platform/index.js';
import { createDesktopAdapter } from '@semblance/core/platform/desktop-adapter.js';

beforeAll(() => {
  setPlatform(createDesktopAdapter());
});

describe('Argon2id Key Derivation', () => {
  it('produces a 32-byte (64-char hex) key', async () => {
    const result = await deriveKey('test-passphrase');
    expect(result.keyHex).toHaveLength(64);
    expect(result.keyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(result.algorithm).toBe('argon2id');
  });

  it('produces deterministic output with the same salt', async () => {
    const salt = generateSalt();
    const result1 = await deriveKey('test-passphrase', salt);
    const result2 = await deriveKey('test-passphrase', salt);
    expect(result1.keyHex).toBe(result2.keyHex);
    expect(result1.saltHex).toBe(result2.saltHex);
  });

  it('produces different output with different passphrases', async () => {
    const salt = generateSalt();
    const result1 = await deriveKey('passphrase-one', salt);
    const result2 = await deriveKey('passphrase-two', salt);
    expect(result1.keyHex).not.toBe(result2.keyHex);
  });

  it('auto-generates a 16-byte (32-char hex) salt when none provided', async () => {
    const result = await deriveKey('auto-salt-test');
    expect(result.saltHex).toHaveLength(32);
    expect(result.saltHex).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('Legacy SHA-256 Key Derivation', () => {
  it('deriveKeyLegacy returns a 64-char hex SHA-256 hash', () => {
    const key = deriveKeyLegacy('legacy-passphrase');
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Salt Generation', () => {
  it('generates unique 16-byte salts', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    expect(salt1).toHaveLength(16);
    expect(salt2).toHaveLength(16);
    expect(salt1.toString('hex')).not.toBe(salt2.toString('hex'));
  });
});
