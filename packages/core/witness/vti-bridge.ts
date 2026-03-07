// VTI Bridge — Offline bridge to Veridian Trust Infrastructure registry.
// VTI Registry is a future service. This bridge returns offline status for all operations.
// Includes signatureAlgorithm metadata for future Ed25519 integration.
// CRITICAL: No networking imports.

import type { WitnessAttestation } from './types.js';
import { ED25519_PROOF_TYPE, HMAC_PROOF_TYPE } from '../attestation/attestation-format.js';

/**
 * Offline bridge to the Veridian Trust Infrastructure.
 * Returns null/false — VTI Registry is a future external service.
 */
export class VtiBridge {
  /**
   * Get a registry reference for an attestation.
   * Returns null — VTI Registry is an external service (future enhancement).
   */
  getRegistryRef(): string | null {
    return null;
  }

  /**
   * Check if the VTI Registry is available.
   * Returns false — external service not yet operational.
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
