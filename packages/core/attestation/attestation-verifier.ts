// Attestation Verifier — Verifies Ed25519 or HMAC-SHA256 signed attestations.
// Auto-detects algorithm from proof.type.
// NOT premium-gated — verification is a public good.
// CRITICAL: No networking imports.

import { getPlatform } from '../platform/index.js';
import type { SignedAttestation, AttestationVerificationResult } from './types.js';
import { canonicalizePayload, ED25519_PROOF_TYPE } from './attestation-format.js';
import { verify as ed25519Verify } from '../crypto/ed25519.js';

/**
 * Verifies attestation signatures.
 * Auto-detects Ed25519 vs HMAC-SHA256 from proof.type.
 */
export class AttestationVerifier {
  /**
   * Verify a signed attestation against a verification key.
   *
   * Ed25519 path (proof.type === 'Ed25519Signature2020'):
   *   verificationKey = 32-byte Ed25519 public key
   *   Canonicalize → SHA-256 → ed25519Verify(hash, signature, publicKey)
   *
   * HMAC path (proof.type === 'HmacSha256Signature'):
   *   verificationKey = HMAC key (same symmetric key used for signing)
   *   Canonicalize → SHA-256 → HMAC-SHA256 → constant-time compare
   */
  verify(attestation: SignedAttestation, verificationKey: Buffer): AttestationVerificationResult {
    const p = getPlatform();

    const canonical = canonicalizePayload(attestation.payload);
    const payloadHash = p.crypto.sha256(canonical);
    const actual = attestation.proof.proofValue;

    let valid: boolean;

    if (attestation.proof.type === ED25519_PROOF_TYPE) {
      const hashBytes = Buffer.from(payloadHash, 'hex');
      const signatureBytes = Buffer.from(actual, 'hex');
      valid = ed25519Verify(hashBytes, signatureBytes, verificationKey);
    } else {
      // Legacy HMAC-SHA256 path
      const expected = p.crypto.hmacSha256(verificationKey, payloadHash);
      valid = constantTimeEqual(actual, expected);
    }

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
