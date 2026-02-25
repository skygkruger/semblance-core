// Witness Exporter — Exports attestations and public keys as JSON.
// Supports Ed25519 (asymmetric, preferred) and HMAC-SHA256 (legacy symmetric).
// CRITICAL: No networking imports.

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
   * Ed25519: exports the 32-byte public key — verifier cannot forge attestations.
   * HMAC-SHA256 (legacy): exports the symmetric key — verifier CAN forge attestations.
   */
  exportPublicKey(
    key: Buffer,
    deviceIdentity: DeviceIdentity,
    algorithm: 'ed25519' | 'hmac-sha256' = 'hmac-sha256',
  ): string {
    return JSON.stringify(
      {
        algorithm,
        key: key.toString('hex'),
        deviceId: deviceIdentity.id,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    );
  }
}
