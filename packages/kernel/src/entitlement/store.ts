import type { SignedEntitlementV1 } from '@semblance/protocol';
import type { KeyStore } from '../keys/key-store.js';
import { ENTITLEMENT_SNAPSHOT_KEY, LICENSE_KEY } from '../keys/key-store.js';
import { isDeviceEnrolled } from './device-enrollment.js';
import { evaluateSubscriptionGrace } from './grace.js';
import { isRevoked } from './revocation.js';
import { verifySignedEntitlementV1 } from './verifier.js';

export interface EntitlementSnapshot {
  active: boolean;
  tier: SignedEntitlementV1['tier'];
  seat: number | null;
  validUntil: string | null;
  verifiedAt: string;
  entitlement: SignedEntitlementV1;
  inGracePeriod: boolean;
  graceEndsAt: string | null;
  deviceEnrolled: boolean;
  revoked: boolean;
}

export interface StoredEntitlementRecord {
  verifiedAt: string;
  entitlement: SignedEntitlementV1;
}

export class EntitlementStore {
  constructor(
    private readonly keyStore: KeyStore,
    private readonly deviceId: string,
  ) {}

  async getRecord(): Promise<StoredEntitlementRecord | null> {
    const raw = await this.keyStore.get(ENTITLEMENT_SNAPSHOT_KEY);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as StoredEntitlementRecord;
      if (!parsed?.entitlement || typeof parsed.verifiedAt !== 'string') {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async getSnapshot(nowMs = Date.now()): Promise<EntitlementSnapshot | null> {
    const record = await this.getRecord();
    if (!record) {
      return null;
    }

    const revoked = await isRevoked(this.keyStore, record.entitlement);
    const grace = evaluateSubscriptionGrace(record.entitlement, nowMs);
    const signatureValid = verifySignedEntitlementV1(record.entitlement, nowMs).valid;
    const deviceEnrolled = revoked
      ? false
      : await isDeviceEnrolled(
        this.keyStore,
        record.entitlement.entitlementId,
        this.deviceId,
      );
    const active = !revoked && signatureValid && grace.active && deviceEnrolled;
    const { tier, seat, validUntil } = record.entitlement;

    return {
      active,
      tier,
      seat: seat ?? null,
      validUntil,
      verifiedAt: record.verifiedAt,
      entitlement: record.entitlement,
      inGracePeriod: grace.inGracePeriod,
      graceEndsAt: grace.graceEndsAt,
      deviceEnrolled,
      revoked,
    };
  }

  async setEntitlement(entitlement: SignedEntitlementV1): Promise<void> {
    const record: StoredEntitlementRecord = {
      verifiedAt: new Date().toISOString(),
      entitlement,
    };
    await this.keyStore.set(ENTITLEMENT_SNAPSHOT_KEY, JSON.stringify(record));

    if (entitlement.signature.startsWith('legacy-sem:')) {
      const legacyKey = entitlement.signature.slice('legacy-sem:'.length);
      await this.keyStore.set(LICENSE_KEY, legacyKey);
    }
  }

  async clear(): Promise<void> {
    await this.keyStore.delete(ENTITLEMENT_SNAPSHOT_KEY);
    await this.keyStore.delete(LICENSE_KEY);
  }
}
