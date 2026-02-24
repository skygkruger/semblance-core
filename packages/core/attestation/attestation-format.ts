// Attestation Format — JSON-LD formatting and canonical serialization.
// CRITICAL: No networking imports. Pure data transformation.

import type { AttestationPayload, AttestationProof } from './types.js';

const ATTESTATION_CONTEXT = 'https://veridian.run/attestation/v1';
const ATTESTATION_TYPE = 'VeridianAttestation';

/**
 * Wrap a payload and proof in a JSON-LD attestation envelope.
 */
export function buildJsonLdAttestation(
  payload: AttestationPayload,
  proof: AttestationProof,
): Record<string, unknown> {
  return {
    '@context': ATTESTATION_CONTEXT,
    '@type': ATTESTATION_TYPE,
    ...payload,
    proof,
  };
}

/**
 * Deterministic JSON serialization with sorted keys.
 * Ensures the same payload always produces the same string for signing.
 */
export function canonicalizePayload(payload: AttestationPayload): string {
  return JSON.stringify(sortKeys(payload));
}

/**
 * Extract the signable payload from a JSON-LD attestation by stripping the proof block.
 */
export function extractPayloadForSigning(
  attestation: Record<string, unknown>,
): AttestationPayload {
  const { proof: _proof, ...payload } = attestation;
  return payload;
}

/**
 * Recursively sort object keys for deterministic serialization.
 */
function sortKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}
