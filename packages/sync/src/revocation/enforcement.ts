import type { EncryptedEventEnvelopeV1 } from '@semblance/protocol';
import type { MembershipStore } from '../membership/store.js';
import type { SyncSecureStorageAdapter } from '../keys/secure-storage.js';
import { revokeDeviceMembership, type RevokeDeviceInput } from '../membership/revocation.js';
import type { MembershipOperationResult } from '../types.js';
import {
  createDeletionPropagationService,
  type DeletionTombstoneRecord,
} from './deletion-service.js';
import { startOrResumeRekey } from './rekey-service.js';

export class RevokedDeviceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RevokedDeviceError';
  }
}

export class PostRevocationEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PostRevocationEventError';
  }
}

export interface RevocationEnforcementResult extends MembershipOperationResult {
  readonly rekeyCheckpointId: string;
  readonly domainKeysRotated: boolean;
  readonly tombstonePropagated: boolean;
}

export function assertDeviceNotRevoked(
  membershipStore: MembershipStore,
  deviceId: string,
): void {
  const device = membershipStore.getDevice(deviceId);
  if (!device || device.revokedAt) {
    throw new RevokedDeviceError(`Device is revoked or unknown: ${deviceId}`);
  }
}

export function assertEventMembershipEpoch(
  membershipStore: MembershipStore,
  envelope: EncryptedEventEnvelopeV1,
): void {
  const root = membershipStore.getRoot();
  if (!root) {
    throw new PostRevocationEventError('Sovereignty root is not initialized');
  }

  if (envelope.membershipEpoch < root.membershipEpoch) {
    const device = membershipStore.getDevice(envelope.deviceId);
    if (device?.revokedAt) {
      throw new PostRevocationEventError(
        `Rejected post-revocation event from revoked device ${envelope.deviceId} at epoch ${envelope.membershipEpoch}`,
      );
    }
  }

  assertDeviceNotRevoked(membershipStore, envelope.deviceId);
}

export async function enforceDeviceRevocation(params: {
  store: MembershipStore;
  secureStorage: SyncSecureStorageAdapter;
  rootId: string;
  rootPrivateKey: string;
  input: RevokeDeviceInput;
  domainIds?: readonly string[];
  tombstone?: Omit<DeletionTombstoneRecord, 'propagatedAt' | 'membershipEpoch'>;
}): Promise<RevocationEnforcementResult> {
  const revokeResult = revokeDeviceMembership({
    store: params.store,
    rootId: params.rootId,
    rootPrivateKey: params.rootPrivateKey,
    input: params.input,
  });

  const domainIds = params.domainIds ?? ['documents', 'vault'];
  let domainKeysRotated = false;
  let rekeyCheckpointId = '';

  for (const domainId of domainIds) {
    const rekey = await startOrResumeRekey({
      secureStorage: params.secureStorage,
      domainId,
      membershipEpoch: revokeResult.membershipEpoch,
      revokedDeviceId: params.input.deviceId,
    });
    rekeyCheckpointId = rekey.checkpoint.checkpointId;
    domainKeysRotated = domainKeysRotated || rekey.keysRotated;
  }

  let tombstonePropagated = false;
  if (params.tombstone) {
    const deletionService = createDeletionPropagationService(params.secureStorage);
    await deletionService.registerTombstone({
      ...params.tombstone,
      membershipEpoch: revokeResult.membershipEpoch,
      propagatedAt: new Date().toISOString(),
    });
    await deletionService.registerPendingOfflineDeletion({
      tombstoneEventId: params.tombstone.tombstoneEventId,
      deviceId: params.input.deviceId,
    });
    tombstonePropagated = true;
  } else {
    const deletionService = createDeletionPropagationService(params.secureStorage);
    await deletionService.registerPendingOfflineDeletion({
      tombstoneEventId: `revoke-${params.input.deviceId}-${revokeResult.membershipEpoch}`,
      deviceId: params.input.deviceId,
    });
  }

  return {
    ...revokeResult,
    rekeyCheckpointId,
    domainKeysRotated,
    tombstonePropagated,
  };
}
