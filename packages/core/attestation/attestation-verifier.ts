// Attestation Verifier — Verifies HMAC-SHA256 signed attestations.
// NOT premium-gated — verification is a public good.
// CRITICAL: No networking imports.

import { getPlatform } from '../platform/index.js';
import type { SignedAttestation, AttestationVerificationResult } from './types.js';
import { canonicalizePayload } from './attestation-format.js';

/**
 * Verifies attestation signatures using HMAC-SHA256.
 * Uses constant-time comparison to prevent timing attacks (same pattern as verifySignature).
 */
export class AttestationVerifier {
  /**
   * Verify a signed attestation against a verification key.
   *
   * Process:
   * 1. Extract and canonicalize the payload
   * 2. SHA-256 hash the canonical string
   * 3. HMAC-SHA256 with the verification key
   * 4. Constant-time compare with proof value
   */
  verify(attestation: SignedAttestation, verificationKey: Buffer): AttestationVerificationResult {
    const p = getPlatform();

    const canonical = canonicalizePayload(attestation.payload);
    const payloadHash = p.crypto.sha256(canonical);
    const expected = p.crypto.hmacSha256(verificationKey, payloadHash);

    const actual = attestation.proof.proofValue;

    // Constant-time comparison to prevent timing attacks
    const valid = constantTimeEqual(actual, expected);

    // Extract device from verificationMethod (format: "device:<id>")
    const signerDevice = attestation.proof.verificationMethod?.startsWith('device:')
      ? attestation.proof.verificationMethod.slice(7)
      : undefined;

    return {
      valid,
      signerDevice,
      timestamp: attestation.proof.created,
    };
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
