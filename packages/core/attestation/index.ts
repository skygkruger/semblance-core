// Attestation — Barrel exports for shared cryptographic attestation infrastructure.

export type {
  DeviceIdentity,
  AttestationPayload,
  AttestationProof,
  SignedAttestation,
  AttestationVerificationResult,
} from './types.js';

export { AttestationSigner } from './attestation-signer.js';
export { AttestationVerifier } from './attestation-verifier.js';
export {
  buildJsonLdAttestation,
  canonicalizePayload,
  extractPayloadForSigning,
} from './attestation-format.js';
