// Attestation Signer — Signs payloads with Ed25519 (preferred) or HMAC-SHA256 (legacy).
// Reuses Sprint 1 crypto primitives via PlatformAdapter.
// CRITICAL: No networking imports.

import { getPlatform } from '../platform/index.js';
import type { DeviceIdentity, SignedAttestation, AttestationPayload, AttestationProof } from './types.js';
import { canonicalizePayload, ED25519_PROOF_TYPE, HMAC_PROOF_TYPE } from './attestation-format.js';
import { sign as ed25519Sign } from '../crypto/ed25519.js';

/**
 * Signs attestation payloads using Ed25519 (when key provided) or HMAC-SHA256 (legacy).
 *
 * When both keys are provided, Ed25519 is preferred — it's asymmetric, so the verifier
 * holding the public key cannot forge attestations.
 */
export class AttestationSigner {
  private signingKey: Buffer | undefined;
  private ed25519PrivateKey: Buffer | undefined;
  private deviceIdentity: DeviceIdentity;

  constructor(config: {
    signingKey?: Buffer;
    ed25519PrivateKey?: Buffer;
    deviceIdentity: DeviceIdentity;
  }) {
    if (!config.signingKey && !config.ed25519PrivateKey) {
      throw new Error('AttestationSigner requires at least one signing key (signingKey or ed25519PrivateKey)');
    }
    this.signingKey = config.signingKey;
    this.ed25519PrivateKey = config.ed25519PrivateKey;
    this.deviceIdentity = config.deviceIdentity;
  }

  /**
   * Sign a payload and return a SignedAttestation with proof block.
   *
   * Ed25519 path (when ed25519PrivateKey present):
   * 1. Canonicalize payload (deterministic JSON with sorted keys)
   * 2. SHA-256 hash the canonical string
   * 3. Ed25519 sign the hash with the private key
   * 4. Wrap in proof block with type: 'Ed25519Signature2020'
   *
   * HMAC path (legacy, when only signingKey present):
   * 1. Canonicalize payload
   * 2. SHA-256 hash the canonical string
   * 3. HMAC-SHA256 sign the hash
   * 4. Wrap in proof block with type: 'HmacSha256Signature'
   */
  sign(payload: AttestationPayload): SignedAttestation {
    const p = getPlatform();
    const canonical = canonicalizePayload(payload);
    const payloadHash = p.crypto.sha256(canonical);

    let proofType: string;
    let proofValue: string;

    if (this.ed25519PrivateKey) {
      const hashBytes = Buffer.from(payloadHash, 'hex');
      const signature = ed25519Sign(hashBytes, this.ed25519PrivateKey);
      proofValue = signature.toString('hex');
      proofType = ED25519_PROOF_TYPE;
    } else {
      proofValue = p.crypto.hmacSha256(this.signingKey!, payloadHash);
      proofType = HMAC_PROOF_TYPE;
    }

    const proof: AttestationProof = {
      type: proofType,
      created: new Date().toISOString(),
      verificationMethod: `device:${this.deviceIdentity.id}`,
      proofPurpose: 'assertionMethod',
      proofValue,
    };

    return { payload, proof };
  }
}
