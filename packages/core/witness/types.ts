// Witness Types — Semblance Witness attestation structures.
// CRITICAL: No networking imports.

import type { AttestationProof, DeviceIdentity } from '../attestation/types.js';

/**
 * Full Semblance Witness attestation in JSON-LD format.
 */
export interface WitnessAttestation {
  '@context': string;
  '@type': string;
  id: string;
  action: string;
  autonomyTier: string;
  device: DeviceIdentity;
  createdAt: string;
  auditEntryId: string;
  proof: AttestationProof;
  vti?: Record<string, unknown> | null;
}

/**
 * Configuration for the WitnessGenerator.
 */
export interface WitnessConfig {
  premiumGate: { isPremium(): boolean };
  attestationSigner: { sign(payload: Record<string, unknown>): { payload: Record<string, unknown>; proof: AttestationProof } };
  db: unknown;
  deviceIdentity: DeviceIdentity;
}

/**
 * Result of witness attestation generation.
 */
export interface WitnessGenerationResult {
  success: boolean;
  attestation?: WitnessAttestation;
  error?: string;
}
