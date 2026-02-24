// Witness Verifier — Verifies Semblance Witness attestations.
// NOT premium-gated — anyone can verify an attestation.
// CRITICAL: No networking imports.

import { AttestationVerifier } from '../attestation/attestation-verifier.js';
import type { AttestationVerificationResult, SignedAttestation } from '../attestation/types.js';
import type { WitnessAttestation } from './types.js';

/**
 * Verifies Semblance Witness attestations by delegating to AttestationVerifier.
 * Not premium-gated — verification is a public good.
 */
export class WitnessVerifier {
  private verifier = new AttestationVerifier();

  /**
   * Verify a witness attestation's signature against a verification key.
   */
  verify(
    attestation: WitnessAttestation,
    verificationKey: Buffer,
  ): AttestationVerificationResult {
    // Reconstruct the SignedAttestation from the witness format.
    // The payload for signing was built via buildWitnessPayload — reconstruct it.
    const payload: Record<string, unknown> = {
      '@context': attestation['@context'],
      '@type': attestation['@type'],
      action: attestation.action,
      autonomyTier: attestation.autonomyTier,
      device: attestation.device,
      auditEntryId: attestation.auditEntryId,
      createdAt: attestation.createdAt,
    };

    const signed: SignedAttestation = {
      payload,
      proof: attestation.proof,
    };

    return this.verifier.verify(signed, verificationKey);
  }
}
