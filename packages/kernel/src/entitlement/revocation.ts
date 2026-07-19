import type { SignedEntitlementV1 } from '@semblance/protocol';
import type { KeyStore } from '../keys/key-store.js';

export const REVOCATION_STATE_KEY = 'kernel.entitlement.revocation';

export interface RevocationState {
  revoked: boolean;
  acknowledgedEpoch: number;
  revokedAt: string | null;
  entitlementId: string | null;
}

const EMPTY_REVOCATION_STATE: RevocationState = {
  revoked: false,
  acknowledgedEpoch: 0,
  revokedAt: null,
  entitlementId: null,
};

export async function readRevocationState(keyStore: KeyStore): Promise<RevocationState> {
  const raw = await keyStore.get(REVOCATION_STATE_KEY);
  if (!raw) {
    return { ...EMPTY_REVOCATION_STATE };
  }

  try {
    const parsed = JSON.parse(raw) as RevocationState;
    return {
      revoked: parsed.revoked === true,
      acknowledgedEpoch: typeof parsed.acknowledgedEpoch === 'number' ? parsed.acknowledgedEpoch : 0,
      revokedAt: typeof parsed.revokedAt === 'string' ? parsed.revokedAt : null,
      entitlementId: typeof parsed.entitlementId === 'string' ? parsed.entitlementId : null,
    };
  } catch {
    return { ...EMPTY_REVOCATION_STATE };
  }
}

async function writeRevocationState(keyStore: KeyStore, state: RevocationState): Promise<void> {
  await keyStore.set(REVOCATION_STATE_KEY, JSON.stringify(state));
}

export async function clearRevocationState(keyStore: KeyStore): Promise<void> {
  await keyStore.delete(REVOCATION_STATE_KEY);
}

/**
 * Mark the current entitlement revoked and record the observed epoch.
 */
export async function revokeEntitlement(
  keyStore: KeyStore,
  entitlement: Pick<SignedEntitlementV1, 'entitlementId' | 'revocationEpoch'>,
  revokedAt = new Date().toISOString(),
): Promise<RevocationState> {
  const state: RevocationState = {
    revoked: true,
    acknowledgedEpoch: Math.max(entitlement.revocationEpoch, 0),
    revokedAt,
    entitlementId: entitlement.entitlementId,
  };
  await writeRevocationState(keyStore, state);
  return state;
}

/**
 * Persist the latest issuer revocation epoch without clearing stored entitlement.
 */
export async function acknowledgeRevocationEpoch(
  keyStore: KeyStore,
  epoch: number,
  entitlementId: string | null = null,
): Promise<RevocationState> {
  const current = await readRevocationState(keyStore);
  const state: RevocationState = {
    ...current,
    acknowledgedEpoch: Math.max(current.acknowledgedEpoch, epoch),
    entitlementId: entitlementId ?? current.entitlementId,
  };
  await writeRevocationState(keyStore, state);
  return state;
}

/**
 * Returns true when local revocation state blocks the entitlement.
 */
export async function isRevoked(
  keyStore: KeyStore,
  entitlement: SignedEntitlementV1,
): Promise<boolean> {
  const state = await readRevocationState(keyStore);
  if (!state.revoked) {
    return false;
  }
  if (state.entitlementId === null) {
    return true;
  }
  return state.entitlementId === entitlement.entitlementId;
}

export async function resetRevocationForActivation(
  keyStore: KeyStore,
  entitlement: SignedEntitlementV1,
): Promise<void> {
  await writeRevocationState(keyStore, {
    revoked: false,
    acknowledgedEpoch: entitlement.revocationEpoch,
    revokedAt: null,
    entitlementId: entitlement.entitlementId,
  });
}
