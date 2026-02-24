/**
 * Step 26 — AttestationSigner tests (Commit 1).
 * Verifies HMAC-SHA256 signing of attestation payloads.
 */

import { describe, it, expect } from 'vitest';
import { AttestationSigner } from '@semblance/core/attestation/attestation-signer';
import type { DeviceIdentity } from '@semblance/core/attestation/types';

const TEST_KEY = Buffer.from('test-signing-key-for-attestation-testing-32bytes!');
const TEST_DEVICE: DeviceIdentity = { id: 'device-001', platform: 'desktop' };

function createSigner(key = TEST_KEY, device = TEST_DEVICE): AttestationSigner {
  return new AttestationSigner({ signingKey: key, deviceIdentity: device });
}

describe('AttestationSigner (Step 26)', () => {
  it('signs payload and produces valid proof block', () => {
    const signer = createSigner();
    const payload = { action: 'email.send', summary: 'Sent weekly report' };

    const result = signer.sign(payload);

    expect(result.payload).toEqual(payload);
    expect(result.proof).toBeDefined();
    expect(result.proof.proofValue).toBeTruthy();
    expect(result.proof.proofValue.length).toBeGreaterThan(0);
    expect(result.proof.verificationMethod).toBe('device:device-001');
  });

  it('proof block contains correct type, timestamp, and proofPurpose', () => {
    const signer = createSigner();
    const result = signer.sign({ data: 'test' });

    expect(result.proof.type).toBe('HmacSha256Signature');
    expect(result.proof.proofPurpose).toBe('assertionMethod');
    // Timestamp should be a valid ISO 8601 string
    expect(() => new Date(result.proof.created)).not.toThrow();
    expect(new Date(result.proof.created).getTime()).not.toBeNaN();
  });

  it('same payload + key produces same signature (deterministic)', () => {
    const signer = createSigner();
    const payload = { x: 1, y: 'two', z: [3] };

    const result1 = signer.sign(payload);
    const result2 = signer.sign(payload);

    expect(result1.proof.proofValue).toBe(result2.proof.proofValue);
  });

  it('different key produces different signature', () => {
    const signer1 = createSigner(Buffer.from('key-one-for-attestation-signer-test!!!'));
    const signer2 = createSigner(Buffer.from('key-two-for-attestation-signer-test!!!'));
    const payload = { action: 'test' };

    const result1 = signer1.sign(payload);
    const result2 = signer2.sign(payload);

    expect(result1.proof.proofValue).not.toBe(result2.proof.proofValue);
  });
});
