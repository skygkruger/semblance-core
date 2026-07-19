import { createHash, randomBytes } from 'node:crypto';
import {
  domainEpochStorageKey,
  domainKeyStorageKey,
  deriveEpochBoundDomainKey,
  getOrCreateDomainMasterKey,
} from '../keys/domain-keys.js';
import type { SyncSecureStorageAdapter } from '../keys/secure-storage.js';

const KEY_LENGTH = 32;
const REKEY_CHECKPOINT_PREFIX = 'sync.rekey.checkpoint.';
const ARCHIVED_MASTER_PREFIX = 'sync.domain.';

export interface RekeyCheckpoint {
  readonly checkpointId: string;
  readonly domainId: string;
  readonly membershipEpoch: number;
  readonly revokedDeviceId: string;
  readonly lastProcessedEventId: string | null;
  readonly processedCount: number;
  readonly newMasterKeyFingerprint: string;
  readonly priorMasterKeyFingerprint: string;
  readonly completed: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RekeyProgressResult {
  readonly checkpoint: RekeyCheckpoint;
  readonly resumed: boolean;
  readonly keysRotated: boolean;
}

function fingerprintKey(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex');
}

export function rekeyCheckpointStorageKey(checkpointId: string): string {
  return `${REKEY_CHECKPOINT_PREFIX}${checkpointId}`;
}

export function archivedMasterKeyStorageKey(domainId: string, membershipEpoch: number): string {
  return `${ARCHIVED_MASTER_PREFIX}${domainId}.archived.${membershipEpoch}`;
}

export async function rotateDomainMasterKeyForRevocation(
  secureStorage: SyncSecureStorageAdapter,
  domainId: string,
  membershipEpoch: number,
): Promise<{ newMasterKey: Buffer; priorMasterKeyFingerprint: string; newMasterKeyFingerprint: string }> {
  const priorMasterKey = await getOrCreateDomainMasterKey(secureStorage, domainId);
  const priorFingerprint = fingerprintKey(priorMasterKey);

  await secureStorage.set(
    archivedMasterKeyStorageKey(domainId, membershipEpoch - 1),
    priorMasterKey.toString('hex'),
  );

  const newMasterKey = randomBytes(KEY_LENGTH);
  await secureStorage.set(domainKeyStorageKey(domainId), newMasterKey.toString('hex'));

  const epochKey = deriveEpochBoundDomainKey(newMasterKey, membershipEpoch);
  await secureStorage.set(domainEpochStorageKey(domainId, membershipEpoch), epochKey.toString('hex'));

  return {
    newMasterKey,
    priorMasterKeyFingerprint: priorFingerprint,
    newMasterKeyFingerprint: fingerprintKey(newMasterKey),
  };
}

export async function loadArchivedDomainMasterKey(
  secureStorage: SyncSecureStorageAdapter,
  domainId: string,
  membershipEpoch: number,
): Promise<Buffer | null> {
  const archived = await secureStorage.get(archivedMasterKeyStorageKey(domainId, membershipEpoch));
  if (archived) {
    return Buffer.from(archived, 'hex');
  }
  return null;
}

export async function saveRekeyCheckpoint(
  secureStorage: SyncSecureStorageAdapter,
  checkpoint: RekeyCheckpoint,
): Promise<void> {
  await secureStorage.set(
    rekeyCheckpointStorageKey(checkpoint.checkpointId),
    JSON.stringify(checkpoint),
  );
}

export async function loadRekeyCheckpoint(
  secureStorage: SyncSecureStorageAdapter,
  checkpointId: string,
): Promise<RekeyCheckpoint | null> {
  const raw = await secureStorage.get(rekeyCheckpointStorageKey(checkpointId));
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as RekeyCheckpoint;
}

export interface StartRekeyInput {
  readonly secureStorage: SyncSecureStorageAdapter;
  readonly domainId: string;
  readonly membershipEpoch: number;
  readonly revokedDeviceId: string;
  readonly checkpointId?: string;
  readonly eventIds?: readonly string[];
}

export async function startOrResumeRekey(input: StartRekeyInput): Promise<RekeyProgressResult> {
  const checkpointId = input.checkpointId ?? `rekey-${input.domainId}-${input.membershipEpoch}`;
  const existing = await loadRekeyCheckpoint(input.secureStorage, checkpointId);

  if (existing?.completed) {
    return { checkpoint: existing, resumed: true, keysRotated: false };
  }

  let priorFingerprint: string;
  let newFingerprint: string;
  let keysRotated = false;

  if (existing) {
    priorFingerprint = existing.priorMasterKeyFingerprint;
    newFingerprint = existing.newMasterKeyFingerprint;
  } else {
    const rotation = await rotateDomainMasterKeyForRevocation(
      input.secureStorage,
      input.domainId,
      input.membershipEpoch,
    );
    priorFingerprint = rotation.priorMasterKeyFingerprint;
    newFingerprint = rotation.newMasterKeyFingerprint;
    keysRotated = true;
  }

  const eventIds = input.eventIds ?? [];
  const processedCount = (existing?.processedCount ?? 0) + eventIds.length;
  const lastProcessedEventId =
    eventIds.length > 0 ? eventIds[eventIds.length - 1]! : existing?.lastProcessedEventId ?? null;
  const completed = eventIds.length === 0 && existing !== null;

  const now = new Date().toISOString();
  const checkpoint: RekeyCheckpoint = {
    checkpointId,
    domainId: input.domainId,
    membershipEpoch: input.membershipEpoch,
    revokedDeviceId: input.revokedDeviceId,
    lastProcessedEventId,
    processedCount,
    newMasterKeyFingerprint: newFingerprint,
    priorMasterKeyFingerprint: priorFingerprint,
    completed,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await saveRekeyCheckpoint(input.secureStorage, checkpoint);
  return { checkpoint, resumed: existing !== null, keysRotated };
}

export async function loadEpochKeyForDevice(
  secureStorage: SyncSecureStorageAdapter,
  domainId: string,
  membershipEpoch: number,
  useArchivedMaster: boolean,
): Promise<Buffer> {
  if (useArchivedMaster) {
    const archived = await loadArchivedDomainMasterKey(secureStorage, domainId, membershipEpoch);
    if (archived) {
      return deriveEpochBoundDomainKey(archived, membershipEpoch);
    }
  }
  const masterKey = await getOrCreateDomainMasterKey(secureStorage, domainId);
  return deriveEpochBoundDomainKey(masterKey, membershipEpoch);
}
