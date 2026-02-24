/**
 * Step 26 — AttestationVerifier tests (Commit 1).
 * Verifies attestation verification, tamper detection, and canonical serialization.
 */

import { describe, it, expect } from 'vitest';
import { AttestationSigner } from '@semblance/core/attestation/attestation-signer';
import { AttestationVerifier } from '@semblance/core/attestation/attestation-verifier';
import { canonicalizePayload } from '@semblance/core/attestation/attestation-format';
import type { DeviceIdentity } from '@semblance/core/attestation/types';

const TEST_KEY = Buffer.from('test-verification-key-for-testing-32-bytes!!!');
const TEST_DEVICE: DeviceIdentity = { id: 'device-v01', platform: 'desktop' };

function createSignerAndVerifier(key = TEST_KEY) {
  const signer = new AttestationSigner({ signingKey: key, deviceIdentity: TEST_DEVICE });
  const verifier = new AttestationVerifier();
  return { signer, verifier };
}

describe('AttestationVerifier (Step 26)', () => {
  it('verifies valid attestation returns { valid: true }', () => {
    const { signer, verifier } = createSignerAndVerifier();
    const attestation = signer.sign({ data: 'verified' });

    const result = verifier.verify(attestation, TEST_KEY);

    expect(result.valid).toBe(true);
    expect(result.signerDevice).toBe('device-v01');
    expect(result.timestamp).toBeTruthy();
  });

  it('tampered payload returns { valid: false }', () => {
    const { signer, verifier } = createSignerAndVerifier();
    const attestation = signer.sign({ data: 'original' });

    // Tamper with the payload
    attestation.payload.data = 'tampered';

    const result = verifier.verify(attestation, TEST_KEY);
    expect(result.valid).toBe(false);
  });

  it('wrong key returns { valid: false }', () => {
    const { signer, verifier } = createSignerAndVerifier();
    const attestation = signer.sign({ data: 'test' });

    const wrongKey = Buffer.from('wrong-key-completely-different-from-original!');
    const result = verifier.verify(attestation, wrongKey);

    expect(result.valid).toBe(false);
  });

  it('canonical JSON serialization is deterministic (key order)', () => {
    // Same data, different key insertion order
    const a = canonicalizePayload({ z: 1, a: 2, m: 3 });
    const b = canonicalizePayload({ a: 2, m: 3, z: 1 });
    const c = canonicalizePayload({ m: 3, z: 1, a: 2 });

    expect(a).toBe(b);
    expect(b).toBe(c);
    // Keys should be alphabetically sorted
    expect(a).toBe('{"a":2,"m":3,"z":1}');
  });
});
