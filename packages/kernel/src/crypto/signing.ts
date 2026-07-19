import type { CapabilityGrantV1, ProcessSessionV1 } from '@semblance/protocol';

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

export function sessionSigningPayload(
  session: Omit<ProcessSessionV1, 'kernelSignature'>,
): string {
  return stableStringify(session);
}

export function capabilitySigningPayload(
  grant: Omit<CapabilityGrantV1, 'signature'>,
): string {
  return stableStringify(grant);
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function isoAfterMs(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}
