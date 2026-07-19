import type { SignedEntitlementV1 } from '@semblance/protocol';
import type { KeyStore } from '../keys/key-store.js';
import { adaptLegacySemKey } from './legacy-adapter.js';
import {
  clearDeviceEnrollment,
  DeviceEnrollmentError,
  enrollDevice,
  removeEnrolledDevice,
  transferDeviceEnrollment,
  type DeviceEnrollmentState,
} from './device-enrollment.js';
import { isReservationArtifact } from './reservation-guard.js';
import { revokeEntitlement, resetRevocationForActivation } from './revocation.js';
import { EntitlementStore, type EntitlementSnapshot } from './store.js';
import { verifySignedEntitlementV1 } from './verifier.js';

export interface EntitlementActivationResult {
  success: boolean;
  snapshot?: EntitlementSnapshot;
  error?: string;
}

export interface EntitlementServiceOptions {
  deviceId: string;
}

export class EntitlementService {
  private readonly store: EntitlementStore;
  private readonly keyStore: KeyStore;
  private readonly deviceId: string;

  constructor(keyStore: KeyStore, options: EntitlementServiceOptions) {
    this.keyStore = keyStore;
    this.deviceId = options.deviceId;
    this.store = new EntitlementStore(keyStore, options.deviceId);
  }

  async getSnapshot(nowMs = Date.now()): Promise<EntitlementSnapshot | null> {
    return this.store.getSnapshot(nowMs);
  }

  async activate(
    input: string | SignedEntitlementV1,
    nowMs = Date.now(),
  ): Promise<EntitlementActivationResult> {
    const resolved = await this.resolveEntitlementInput(input, nowMs);
    if (!resolved.ok || !resolved.entitlement) {
      return { success: false, error: resolved.error ?? 'Invalid entitlement' };
    }

    try {
      await enrollDevice(
        this.keyStore,
        resolved.entitlement.entitlementId,
        this.deviceId,
      );
    } catch (error) {
      if (error instanceof DeviceEnrollmentError) {
        return { success: false, error: error.message };
      }
      throw error;
    }

    await resetRevocationForActivation(this.keyStore, resolved.entitlement);
    await this.store.setEntitlement(resolved.entitlement);
    const snapshot = await this.store.getSnapshot(nowMs);
    if (!snapshot?.active) {
      return { success: false, error: 'Entitlement is not currently active' };
    }
    return { success: true, snapshot };
  }

  async revokeLocalEntitlement(): Promise<void> {
    const record = await this.store.getRecord();
    if (record) {
      await revokeEntitlement(this.keyStore, record.entitlement);
    }
    await this.store.clear();
    await clearDeviceEnrollment(this.keyStore);
  }

  async transferDevice(
    fromDeviceId: string,
    toDeviceId: string,
  ): Promise<DeviceEnrollmentState> {
    const record = await this.store.getRecord();
    if (!record) {
      throw new DeviceEnrollmentError('No active entitlement to transfer');
    }
    return transferDeviceEnrollment(
      this.keyStore,
      record.entitlement.entitlementId,
      fromDeviceId,
      toDeviceId,
    );
  }

  async removeDevice(deviceId: string): Promise<DeviceEnrollmentState | null> {
    const record = await this.store.getRecord();
    if (!record) {
      return null;
    }
    return removeEnrolledDevice(
      this.keyStore,
      record.entitlement.entitlementId,
      deviceId,
    );
  }

  private async resolveEntitlementInput(
    input: string | SignedEntitlementV1,
    nowMs: number,
  ): Promise<{ ok: boolean; entitlement?: SignedEntitlementV1; error?: string }> {
    if (typeof input === 'object' && input !== null) {
      const verification = verifySignedEntitlementV1(input, nowMs);
      if (!verification.valid || !verification.entitlement) {
        return { ok: false, error: verification.error ?? 'Invalid signed entitlement' };
      }
      return { ok: true, entitlement: verification.entitlement };
    }

    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return { ok: false, error: 'Entitlement bearer is required' };
    }

    if (isReservationArtifact(trimmed)) {
      return {
        ok: false,
        error: 'Reservation artifacts never grant paid entitlement',
      };
    }

    let entitlement: SignedEntitlementV1 | undefined;

    if (trimmed.startsWith('sem_')) {
      const adapted = adaptLegacySemKey(trimmed, nowMs);
      if (!adapted.ok || !adapted.entitlement) {
        return { ok: false, error: adapted.error ?? 'Invalid legacy license key' };
      }
      entitlement = adapted.entitlement;
    } else if (trimmed.startsWith('{')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed) as unknown;
      } catch {
        return { ok: false, error: 'Invalid entitlement JSON' };
      }
      const verification = verifySignedEntitlementV1(parsed, nowMs);
      if (!verification.valid || !verification.entitlement) {
        return { ok: false, error: verification.error ?? 'Invalid signed entitlement' };
      }
      entitlement = verification.entitlement;
    } else if (trimmed.includes('.')) {
      return {
        ok: false,
        error: 'Reservation artifacts never grant paid entitlement',
      };
    } else {
      return { ok: false, error: 'Unsupported entitlement bearer format' };
    }

    const verification = verifySignedEntitlementV1(entitlement, nowMs);
    if (!verification.valid) {
      return { ok: false, error: verification.error ?? 'Entitlement verification failed' };
    }

    return { ok: true, entitlement };
  }
}

export function createEntitlementService(
  keyStore: KeyStore,
  options: EntitlementServiceOptions,
): EntitlementService {
  return new EntitlementService(keyStore, options);
}
