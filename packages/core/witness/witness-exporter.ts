// Witness Exporter — Exports attestations and public keys as JSON.
// CRITICAL: No networking imports.
//
// Known limitation: HMAC is symmetric — the verifier holding the exported key can forge
// attestations. Asymmetric signing (Ed25519) planned for VTI bridge upgrade in Step 30
// security hardening.

import type { DeviceIdentity } from '../attestation/types.js';
import type { WitnessAttestation } from './types.js';

/**
 * Exports Semblance Witness attestations and verification keys.
 */
export class WitnessExporter {
  /**
   * Export an attestation as pretty-printed JSON.
   */
  exportAsJson(attestation: WitnessAttestation): string {
    return JSON.stringify(attestation, null, 2);
  }

  /**
   * Export the verification key for sharing with verifiers.
   *
   * Known limitation: HMAC is symmetric — the verifier holding this key can forge
   * attestations. Asymmetric signing (Ed25519) planned for VTI bridge upgrade
   * in Step 30 security hardening.
   */
  exportPublicKey(key: Buffer, deviceIdentity: DeviceIdentity): string {
    return JSON.stringify(
      {
        algorithm: 'hmac-sha256',
        key: key.toString('hex'),
        deviceId: deviceIdentity.id,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    );
  }
}
