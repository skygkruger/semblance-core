// VTI Bridge — Stub for Veridian Trust Infrastructure registry.
// VTI Registry is not yet live. This stub returns null/false for all operations.
// Full implementation planned for Step 30 security hardening (asymmetric Ed25519 signing).
// CRITICAL: No networking imports.

import type { WitnessAttestation } from './types.js';

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
   * Returns the attestation as-is with an empty VTI block.
   */
  formatForVti(attestation: WitnessAttestation): Record<string, unknown> {
    return {
      ...attestation,
      vti: {
        registryRef: null,
        registryStatus: 'unavailable',
      },
    };
  }
}
