// VTI Bridge — Stub for Veridian Trust Infrastructure registry.
// VTI Registry is not yet live. This stub returns null/false for all operations.
// Includes signatureAlgorithm metadata for future Ed25519 integration.
// CRITICAL: No networking imports.

import type { WitnessAttestation } from './types.js';
import { ED25519_PROOF_TYPE, HMAC_PROOF_TYPE } from '../attestation/attestation-format.js';

/**
 * Stub bridge to the Veridian Trust Infrastructure.
 * Returns null/false until VTI Registry is operational.
 */
export class VtiBridge {
  /**
   * Get a registry reference for an attestation.
   * Returns null — VTI Registry not yet live.
   */
  getRegistryRef(): string | null {
    return null;
  }

  /**
   * Check if the VTI Registry is available.
   * Returns false — not yet operational.
   */
  isRegistryAvailable(): boolean {
    return false;
  }

  /**
   * Format an attestation for VTI submission.
   * Includes signatureAlgorithm in VTI block for future registry compatibility.
   */
  formatForVti(attestation: WitnessAttestation): Record<string, unknown> {
    const signatureAlgorithm = attestation.proof.type === ED25519_PROOF_TYPE
      ? ED25519_PROOF_TYPE
      : HMAC_PROOF_TYPE;

    return {
      ...attestation,
      vti: {
        registryRef: null,
        registryStatus: 'unavailable',
        signatureAlgorithm,
      },
    };
  }
}
