import { createHash } from 'node:crypto';
import type { SignedEntitlementV1 } from '@semblance/protocol';
import { validateLegacySemLicenseKey, LEGACY_SEM_ISSUER_KEY_ID } from './verifier.js';

export const LEGACY_SEM_SIGNATURE_PREFIX = 'legacy-sem:';

export interface LegacyAdaptationResult {
  ok: boolean;
  entitlement?: SignedEntitlementV1;
  error?: string;
}

/**
 * Convert a valid sem_ license key into a canonical SignedEntitlementV1 snapshot.
 * The snapshot signature embeds the original key for offline re-verification.
 */
export function adaptLegacySemKey(key: string, nowMs = Date.now()): LegacyAdaptationResult {
  const validation = validateLegacySemLicenseKey(key, nowMs);
  if (!validation.valid || !validation.payload) {
    return { ok: false, error: validation.error ?? 'Invalid legacy license key' };
  }

  const { tier, sub, exp, seat } = validation.payload;
  const entitlementId = `legacy-sem-${createHash('sha256').update(sub).digest('hex').slice(0, 16)}`;

  const entitlement: SignedEntitlementV1 = {
    schemaVersion: 1,
    entitlementId,
    memberId: sub,
    tier,
    ...(tier === 'founding' && seat !== null ? { seat } : {}),
    validFrom: new Date(nowMs).toISOString(),
    validUntil: exp,
    offlineGraceDays: 30,
    revocationEpoch: 0,
    issuerKeyId: LEGACY_SEM_ISSUER_KEY_ID,
    signature: `${LEGACY_SEM_SIGNATURE_PREFIX}${key}`,
  };

  return { ok: true, entitlement };
}
