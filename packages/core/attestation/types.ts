// Attestation Types — Shared cryptographic attestation primitives.
// Used by both Living Will (archive signing) and Semblance Witness (action attestation).
// CRITICAL: No networking imports. All crypto via PlatformAdapter.

/**
 * Device identity for attestation provenance.
 */
export interface DeviceIdentity {
  id: string;
  platform: string;
}

/**
 * Generic payload to be signed. Any JSON-serializable object.
 */
export type AttestationPayload = Record<string, unknown>;

/**
 * Cryptographic proof block attached to a signed attestation.
 */
export interface AttestationProof {
  type: string;
  created: string;
  verificationMethod: string;
  proofPurpose: string;
  proofValue: string;
}

/**
 * A payload combined with its cryptographic proof.
 */
export interface SignedAttestation {
  payload: AttestationPayload;
  proof: AttestationProof;
}

/**
 * Result of verifying an attestation's proof.
 */
export interface AttestationVerificationResult {
  valid: boolean;
  signerDevice?: string;
  timestamp?: string;
}
