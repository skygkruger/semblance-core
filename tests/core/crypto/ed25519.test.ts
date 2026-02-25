// Ed25519 Tests — Key generation, signing, and verification.

import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, sign, verify } from '@semblance/core/crypto/ed25519.js';
import { setPlatform } from '@semblance/core/platform/index.js';
import { createDesktopAdapter } from '@semblance/core/platform/desktop-adapter.js';

beforeAll(() => {
  setPlatform(createDesktopAdapter());
});

describe('Ed25519', () => {
  it('generates a valid key pair with correct lengths', () => {
    const kp = generateKeyPair();
    expect(kp.privateKey).toHaveLength(32);
    expect(kp.publicKey).toHaveLength(32);
  });

  it('sign+verify roundtrip succeeds', () => {
    const kp = generateKeyPair();
    const message = Buffer.from('test message');
    const sig = sign(message, kp.privateKey);
    expect(sig).toHaveLength(64);
    expect(verify(message, sig, kp.publicKey)).toBe(true);
  });

  it('verification fails with wrong public key', () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    const message = Buffer.from('secret data');
    const sig = sign(message, kp1.privateKey);
    expect(verify(message, sig, kp2.publicKey)).toBe(false);
  });

  it('verification fails with tampered message', () => {
    const kp = generateKeyPair();
    const message = Buffer.from('original');
    const sig = sign(message, kp.privateKey);
    const tampered = Buffer.from('tampered');
    expect(verify(tampered, sig, kp.publicKey)).toBe(false);
  });

  it('verification fails with invalid signature bytes', () => {
    const kp = generateKeyPair();
    const message = Buffer.from('test');
    const badSig = Buffer.alloc(64, 0xff);
    expect(verify(message, badSig, kp.publicKey)).toBe(false);
  });
});
