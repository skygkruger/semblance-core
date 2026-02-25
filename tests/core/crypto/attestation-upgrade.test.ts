// Attestation Upgrade Tests — Ed25519 signing, HMAC backward compat, auto-detection.

import { describe, it, expect, beforeAll } from 'vitest';
import { AttestationSigner } from '@semblance/core/attestation/attestation-signer.js';
import { AttestationVerifier } from '@semblance/core/attestation/attestation-verifier.js';
import { ED25519_PROOF_TYPE, HMAC_PROOF_TYPE } from '@semblance/core/attestation/attestation-format.js';
import { generateKeyPair } from '@semblance/core/crypto/ed25519.js';
import { setPlatform } from '@semblance/core/platform/index.js';
import { createDesktopAdapter } from '@semblance/core/platform/desktop-adapter.js';
import { randomBytes } from 'node:crypto';

const device = { id: 'test-device-001', platform: 'desktop' };

beforeAll(() => {
  setPlatform(createDesktopAdapter());
});

describe('Attestation Ed25519 Signing', () => {
  it('signs with Ed25519Signature2020 proof type', () => {
    const kp = generateKeyPair();
    const signer = new AttestationSigner({ ed25519PrivateKey: kp.privateKey, deviceIdentity: device });
    const result = signer.sign({ action: 'test', data: 'hello' });
    expect(result.proof.type).toBe(ED25519_PROOF_TYPE);
    expect(result.proof.proofValue).toMatch(/^[0-9a-f]+$/);
    expect(result.proof.proofValue).toHaveLength(128); // 64-byte signature = 128 hex chars
  });

  it('Ed25519 sign+verify roundtrip succeeds', () => {
    const kp = generateKeyPair();
    const signer = new AttestationSigner({ ed25519PrivateKey: kp.privateKey, deviceIdentity: device });
    const verifier = new AttestationVerifier();
    const attestation = signer.sign({ action: 'email.send', to: 'user@example.com' });
    const result = verifier.verify(attestation, kp.publicKey);
    expect(result.valid).toBe(true);
    expect(result.signerDevice).toBe('test-device-001');
  });

  it('Ed25519 verification fails with wrong public key', () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    const signer = new AttestationSigner({ ed25519PrivateKey: kp1.privateKey, deviceIdentity: device });
    const verifier = new AttestationVerifier();
    const attestation = signer.sign({ action: 'calendar.create' });
    const result = verifier.verify(attestation, kp2.publicKey);
    expect(result.valid).toBe(false);
  });

  it('Ed25519 verification fails with tampered payload', () => {
    const kp = generateKeyPair();
    const signer = new AttestationSigner({ ed25519PrivateKey: kp.privateKey, deviceIdentity: device });
    const verifier = new AttestationVerifier();
    const attestation = signer.sign({ action: 'email.send', body: 'original' });
    attestation.payload.body = 'tampered';
    const result = verifier.verify(attestation, kp.publicKey);
    expect(result.valid).toBe(false);
  });
});

describe('Attestation HMAC Backward Compatibility', () => {
  it('signs with HmacSha256Signature when only signingKey provided', () => {
    const key = randomBytes(32);
    const signer = new AttestationSigner({ signingKey: key, deviceIdentity: device });
    const result = signer.sign({ action: 'test' });
    expect(result.proof.type).toBe(HMAC_PROOF_TYPE);
  });

  it('HMAC sign+verify roundtrip still works', () => {
    const key = randomBytes(32);
    const signer = new AttestationSigner({ signingKey: key, deviceIdentity: device });
    const verifier = new AttestationVerifier();
    const attestation = signer.sign({ action: 'legacy.action', data: 'test' });
    const result = verifier.verify(attestation, key);
    expect(result.valid).toBe(true);
  });

  it('prefers Ed25519 when both keys provided', () => {
    const kp = generateKeyPair();
    const hmacKey = randomBytes(32);
    const signer = new AttestationSigner({
      signingKey: hmacKey,
      ed25519PrivateKey: kp.privateKey,
      deviceIdentity: device,
    });
    const attestation = signer.sign({ action: 'dual-key-test' });
    expect(attestation.proof.type).toBe(ED25519_PROOF_TYPE);
  });

  it('throws when no key provided', () => {
    expect(() => new AttestationSigner({ deviceIdentity: device }))
      .toThrow('AttestationSigner requires at least one signing key');
  });
});
