import type { SignedEntitlementV1 } from '@semblance/protocol';
import type { KeyStore } from '../keys/key-store.js';
import { adaptLegacySemKey } from './legacy-adapter.js';
import { isReservationArtifact } from './reservation-guard.js';
import { EntitlementStore, type EntitlementSnapshot } from './store.js';
import { verifySignedEntitlementV1 } from './verifier.js';

export interface EntitlementActivationResult {
  success: boolean;
  snapshot?: EntitlementSnapshot;
  error?: string;
}

export class EntitlementService {
  constructor(private readonly store: EntitlementStore) {}

  async getSnapshot(nowMs = Date.now()): Promise<EntitlementSnapshot | null> {
    return this.store.getSnapshot(nowMs);
  }

  async activate(
    input: string | SignedEntitlementV1,
    nowMs = Date.now(),
  ): Promise<EntitlementActivationResult> {
    if (typeof input === 'object' && input !== null) {
      const verification = verifySignedEntitlementV1(input, nowMs);
      if (!verification.valid || !verification.entitlement) {
        return { success: false, error: verification.error ?? 'Invalid signed entitlement' };
      }
      await this.store.setEntitlement(verification.entitlement);
      const snapshot = await this.store.getSnapshot(nowMs);
      if (!snapshot?.active) {
        return { success: false, error: 'Entitlement is not currently active' };
      }
      return { success: true, snapshot };
    }

    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return { success: false, error: 'Entitlement bearer is required' };
    }

    if (isReservationArtifact(trimmed)) {
      return {
        success: false,
        error: 'Reservation artifacts never grant paid entitlement',
      };
    }

    let entitlement: SignedEntitlementV1 | undefined;

    if (trimmed.startsWith('sem_')) {
      const adapted = adaptLegacySemKey(trimmed, nowMs);
      if (!adapted.ok || !adapted.entitlement) {
        return { success: false, error: adapted.error ?? 'Invalid legacy license key' };
      }
      entitlement = adapted.entitlement;
    } else if (trimmed.startsWith('{')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed) as unknown;
      } catch {
        return { success: false, error: 'Invalid entitlement JSON' };
      }
      const verification = verifySignedEntitlementV1(parsed, nowMs);
      if (!verification.valid || !verification.entitlement) {
        return { success: false, error: verification.error ?? 'Invalid signed entitlement' };
      }
      entitlement = verification.entitlement;
    } else if (trimmed.includes('.')) {
      return {
        success: false,
        error: 'Reservation artifacts never grant paid entitlement',
      };
    } else {
      return { success: false, error: 'Unsupported entitlement bearer format' };
    }

    const verification = verifySignedEntitlementV1(entitlement, nowMs);
    if (!verification.valid) {
      return { success: false, error: verification.error ?? 'Entitlement verification failed' };
    }

    await this.store.setEntitlement(entitlement);
    const snapshot = await this.store.getSnapshot(nowMs);
    if (!snapshot?.active) {
      return { success: false, error: 'Entitlement is not currently active' };
    }

    return { success: true, snapshot };
  }
}

export function createEntitlementService(keyStore: KeyStore): EntitlementService {
  return new EntitlementService(new EntitlementStore(keyStore));
}
