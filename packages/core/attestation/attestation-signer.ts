// Attestation Signer — Signs payloads with HMAC-SHA256.
// Reuses Sprint 1 crypto primitives via PlatformAdapter.
// CRITICAL: No networking imports.

import { getPlatform } from '../platform/index.js';
import type { DeviceIdentity, SignedAttestation, AttestationPayload, AttestationProof } from './types.js';
import { canonicalizePayload } from './attestation-format.js';

/**
 * Signs attestation payloads using HMAC-SHA256 (same algorithm as Sprint 1 audit trail).
 */
export class AttestationSigner {
  private signingKey: Buffer;
  private deviceIdentity: DeviceIdentity;

  constructor(config: { signingKey: Buffer; deviceIdentity: DeviceIdentity }) {
    this.signingKey = config.signingKey;
    this.deviceIdentity = config.deviceIdentity;
  }

  /**
   * Sign a payload and return a SignedAttestation with proof block.
   *
   * Process:
   * 1. Canonicalize payload (deterministic JSON with sorted keys)
   * 2. SHA-256 hash the canonical string
   * 3. HMAC-SHA256 sign the hash with the signing key
   * 4. Wrap in proof block with metadata
   */
  sign(payload: AttestationPayload): SignedAttestation {
    const p = getPlatform();
    const canonical = canonicalizePayload(payload);
    const payloadHash = p.crypto.sha256(canonical);
    const proofValue = p.crypto.hmacSha256(this.signingKey, payloadHash);

    const proof: AttestationProof = {
      type: 'HmacSha256Signature',
      created: new Date().toISOString(),
      verificationMethod: `device:${this.deviceIdentity.id}`,
      proofPurpose: 'assertionMethod',
      proofValue,
    };

    return { payload, proof };
  }
}
