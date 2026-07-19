import type { SyncSecureStorageAdapter } from '../keys/secure-storage.js';

export const OFFLINE_DECRYPTED_DELETION_CAVEAT =
  'Data already decrypted and stored offline on a revoked device cannot be remotely erased. ' +
  'Tombstones propagate to authorized peers; local erasure on the revoked device is pending until it reconnects.';

export interface DeletionTombstoneRecord {
  readonly tombstoneEventId: string;
  readonly recordReference: string;
  readonly dataDomain: string;
  readonly membershipEpoch: number;
  readonly propagatedAt: string;
  readonly originatingDeviceId: string;
}

export interface PendingOfflineDeletion {
  readonly tombstoneEventId: string;
  readonly deviceId: string;
  readonly pending: boolean;
  readonly registeredAt: string;
  readonly completedAt: string | null;
  readonly remoteErasureClaimed: false;
  readonly caveat: typeof OFFLINE_DECRYPTED_DELETION_CAVEAT;
}

export interface DeletionPropagationState {
  readonly tombstones: readonly DeletionTombstoneRecord[];
  readonly pendingOffline: readonly PendingOfflineDeletion[];
}

const TOMBSTONE_STORE_KEY = 'sync.deletion.tombstones';
const PENDING_STORE_KEY = 'sync.deletion.pending';

export class DeletionPropagationService {
  constructor(private readonly secureStorage: SyncSecureStorageAdapter) {}

  async registerTombstone(record: DeletionTombstoneRecord): Promise<void> {
    const state = await this.loadState();
    const tombstones = [
      ...state.tombstones.filter((t) => t.tombstoneEventId !== record.tombstoneEventId),
      record,
    ];
    await this.persistState({ ...state, tombstones });
  }

  async registerPendingOfflineDeletion(params: {
    tombstoneEventId: string;
    deviceId: string;
  }): Promise<PendingOfflineDeletion> {
    const entry: PendingOfflineDeletion = {
      tombstoneEventId: params.tombstoneEventId,
      deviceId: params.deviceId,
      pending: true,
      registeredAt: new Date().toISOString(),
      completedAt: null,
      remoteErasureClaimed: false,
      caveat: OFFLINE_DECRYPTED_DELETION_CAVEAT,
    };

    const state = await this.loadState();
    const pendingOffline = [
      ...state.pendingOffline.filter(
        (p) => !(p.tombstoneEventId === params.tombstoneEventId && p.deviceId === params.deviceId),
      ),
      entry,
    ];
    await this.persistState({ ...state, pendingOffline });
    return entry;
  }

  async markOfflineDeletionComplete(tombstoneEventId: string, deviceId: string): Promise<void> {
    const state = await this.loadState();
    const pendingOffline = state.pendingOffline.map((entry) => {
      if (entry.tombstoneEventId === tombstoneEventId && entry.deviceId === deviceId) {
        return {
          ...entry,
          pending: false,
          completedAt: new Date().toISOString(),
        };
      }
      return entry;
    });
    await this.persistState({ ...state, pendingOffline });
  }

  async getState(): Promise<DeletionPropagationState> {
    return this.loadState();
  }

  getOfflineDecryptedCaveat(): typeof OFFLINE_DECRYPTED_DELETION_CAVEAT {
    return OFFLINE_DECRYPTED_DELETION_CAVEAT;
  }

  private async loadState(): Promise<DeletionPropagationState> {
    const tombstonesRaw = await this.secureStorage.get(TOMBSTONE_STORE_KEY);
    const pendingRaw = await this.secureStorage.get(PENDING_STORE_KEY);
    return {
      tombstones: tombstonesRaw ? (JSON.parse(tombstonesRaw) as DeletionTombstoneRecord[]) : [],
      pendingOffline: pendingRaw ? (JSON.parse(pendingRaw) as PendingOfflineDeletion[]) : [],
    };
  }

  private async persistState(state: DeletionPropagationState): Promise<void> {
    await this.secureStorage.set(TOMBSTONE_STORE_KEY, JSON.stringify(state.tombstones));
    await this.secureStorage.set(PENDING_STORE_KEY, JSON.stringify(state.pendingOffline));
  }
}

export function createDeletionPropagationService(
  secureStorage: SyncSecureStorageAdapter,
): DeletionPropagationService {
  return new DeletionPropagationService(secureStorage);
}
