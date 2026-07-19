import type { SignedEntitlementV1 } from '@semblance/protocol';

export interface GraceEvaluation {
  /** Entitlement is within paid period or offline grace window. */
  active: boolean;
  /** Subscription period ended and grace window has also elapsed. */
  expired: boolean;
  /** Canonical ISO timestamp when grace ends, or null for non-expiring tiers. */
  graceEndsAt: string | null;
  /** True when validUntil is in the past but grace keeps access active. */
  inGracePeriod: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Evaluate subscription grace for a signed entitlement.
 * Lifetime and founding tiers with null validUntil never expire.
 */
export function evaluateSubscriptionGrace(
  entitlement: Pick<SignedEntitlementV1, 'validUntil' | 'offlineGraceDays'>,
  nowMs = Date.now(),
): GraceEvaluation {
  if (entitlement.validUntil === null) {
    return {
      active: true,
      expired: false,
      graceEndsAt: null,
      inGracePeriod: false,
    };
  }

  const validUntilMs = Date.parse(entitlement.validUntil);
  if (!Number.isFinite(validUntilMs)) {
    return {
      active: false,
      expired: true,
      graceEndsAt: null,
      inGracePeriod: false,
    };
  }

  const graceMs = entitlement.offlineGraceDays * MS_PER_DAY;
  const graceEndsAtMs = validUntilMs + graceMs;
  const graceEndsAt = new Date(graceEndsAtMs).toISOString();

  if (nowMs <= validUntilMs) {
    return {
      active: true,
      expired: false,
      graceEndsAt,
      inGracePeriod: false,
    };
  }

  if (nowMs <= graceEndsAtMs) {
    return {
      active: true,
      expired: false,
      graceEndsAt,
      inGracePeriod: true,
    };
  }

  return {
    active: false,
    expired: true,
    graceEndsAt,
    inGracePeriod: false,
  };
}

export function isWithinEntitlementGrace(
  entitlement: Pick<SignedEntitlementV1, 'validUntil' | 'offlineGraceDays'>,
  nowMs = Date.now(),
): boolean {
  return evaluateSubscriptionGrace(entitlement, nowMs).active;
}
