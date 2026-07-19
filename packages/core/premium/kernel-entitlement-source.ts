import type { EntitlementService } from '../../../kernel/src/entitlement/service.js';
import type { EntitlementSnapshot as KernelEntitlementSnapshot } from '../../../kernel/src/entitlement/store.js';
import type {
  EntitlementSnapshotSource,
  EntitlementSnapshot as PremiumEntitlementSnapshot,
  LicenseTier,
} from './premium-gate.js';

export interface KernelBackedEntitlementSnapshot {
  active: boolean;
  tier: LicenseTier;
  validUntil: string | null;
  seat: number | null;
}

function mapKernelSnapshot(
  snapshot: KernelEntitlementSnapshot | null,
): KernelBackedEntitlementSnapshot | null {
  if (!snapshot) {
    return null;
  }

  return {
    active: snapshot.active,
    tier: snapshot.tier,
    validUntil: snapshot.validUntil,
    seat: snapshot.seat,
  };
}

/**
 * Synchronous PremiumGate adapter backed by a cached kernel snapshot.
 * Sidecar refreshes the cache after every entitlement mutation.
 */
export class KernelEntitlementSnapshotSource implements EntitlementSnapshotSource {
  private cachedSnapshot: KernelBackedEntitlementSnapshot | null = null;

  refresh(snapshot: KernelBackedEntitlementSnapshot | null): void {
    this.cachedSnapshot = snapshot;
  }

  getSnapshot(): PremiumEntitlementSnapshot | null {
    return this.cachedSnapshot;
  }
}

export function createKernelEntitlementSnapshotSource(): KernelEntitlementSnapshotSource {
  return new KernelEntitlementSnapshotSource();
}

export async function refreshKernelEntitlementSnapshotSource(
  source: KernelEntitlementSnapshotSource,
  service: EntitlementService,
  nowMs = Date.now(),
): Promise<KernelBackedEntitlementSnapshot | null> {
  const snapshot = mapKernelSnapshot(await service.getSnapshot(nowMs));
  source.refresh(snapshot);
  return snapshot;
}
