import type { ConfidentialAttestationEvidence } from './attestation-types.js';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

export function attestationSigningPayload(
  evidence: Omit<ConfidentialAttestationEvidence, 'signature'>,
): string {
  return stableStringify(evidence);
}
