// Witness Format — JSON-LD payload construction for Semblance Witness attestations.
// CRITICAL: No networking imports.

import type { DeviceIdentity } from '../attestation/types.js';

export const WITNESS_CONTEXT = 'https://veridian.run/witness/v1';
export const WITNESS_TYPE = 'SemblanceWitness';

/**
 * Build the attestation payload body (without proof block).
 */
export function buildWitnessPayload(
  action: string,
  autonomyTier: string,
  device: DeviceIdentity,
  auditEntryId: string,
): Record<string, unknown> {
  return {
    '@context': WITNESS_CONTEXT,
    '@type': WITNESS_TYPE,
    action,
    autonomyTier,
    device,
    auditEntryId,
    createdAt: new Date().toISOString(),
  };
}
