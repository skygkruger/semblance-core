import { randomUUID } from 'node:crypto';
import type { SharedSpaceDepartureV1, SharedSpaceKeyRotationV1, SharedSpaceRecoveryV1 } from '@semblance/protocol';
import { SHARED_SPACE_PROTOCOL_VERSION } from '@semblance/protocol';
import {
  decryptSharedEnvelope,
  deriveSharedDomainEpochKey,
  encryptMasterKeyForMember,
  encryptSharedEnvelope,
  hashRecoverySecret,
  loadSharedDomainEpochKey,
  rotateSharedDomainMasterKey,
  sharedSpaceRootPrivateKey,
  sharedSpaceRootPublicKey,
} from './crypto/domain-keys.js';
import { canonicalizeRecord, generateEd25519KeyMaterial, hashHex, signPayload } from './crypto/ed25519.js';
import { combineShares, sharesFromHex } from './crypto/shamir.js';
import type { SharedSpaceSecureStorage } from './secure-storage.js';
import { SharedSpaceStore } from './store.js';
import type {
  SharedSpaceDepartureResult,
  SharedSpaceRecoveryResult,
} from './types.js';

export interface DepartSharedSpaceMemberInput {
  readonly sharedSpaceId: string;
  readonly departingMemberId: string;
  readonly authorizedByMemberIds: string[];
  readonly domainId?: string;
}

export interface ExecuteSharedSpaceRecoveryInput {
  readonly sharedSpaceId: string;
  readonly submittedShares: Array<{ index: number; shareHex: string }>;
  readonly authorizedOwnerMemberIds: string[];
}

export interface SharedEnvelopeCryptoInput {
  readonly secureStorage: SharedSpaceSecureStorage;
  readonly sharedSpaceId: string;
  readonly domainId: string;
  readonly membershipEpoch: number;
}

function assertMonotonicEpoch(current: number, next: number): void {
  if (next !== current + 1) {
    throw new Error(`Shared-space membership epoch must advance by 1 (${current} -> ${next})`);
  }
}

export async function rotateSharedSpaceKeysOnMembershipChange(
  store: SharedSpaceStore,
  secureStorage: SharedSpaceSecureStorage,
  input: {
    sharedSpaceId: string;
    membershipEpoch: number;
    trigger: SharedSpaceKeyRotationV1['trigger'];
    authorizedByMemberIds: string[];
    domainId?: string;
  },
): Promise<SharedSpaceKeyRotationV1> {
  const root = store.getRoot(input.sharedSpaceId);
  if (!root) {
    throw new Error(`Shared space not found: ${input.sharedSpaceId}`);
  }
  assertMonotonicEpoch(root.membershipEpoch, input.membershipEpoch);

  const rootPrivateKey = await secureStorage.get(sharedSpaceRootPrivateKey(input.sharedSpaceId));
  if (!rootPrivateKey) {
    throw new Error('Shared-space root private key missing');
  }

  const domainId = input.domainId ?? 'shared-default';
  const { priorFingerprint, newFingerprint, masterKey } = await rotateSharedDomainMasterKey(
    secureStorage,
    input.sharedSpaceId,
    domainId,
  );
  const epochKey = deriveSharedDomainEpochKey(masterKey, input.membershipEpoch);
  await secureStorage.set(
    `sharedSpace.${input.sharedSpaceId}.domain.${domainId}.epoch.${input.membershipEpoch}`,
    epochKey.toString('hex'),
  );

  const activeMembers = store.listMembers(input.sharedSpaceId, true);
  const memberKeyEnvelopes = await Promise.all(
    activeMembers.map(async (member) => {
      const enrollmentKey = await secureStorage.get(
        `sharedSpace.${input.sharedSpaceId}.member.${member.memberId}.enrollmentPrivateKey`,
      );
      if (!enrollmentKey) {
        throw new Error(`Missing enrollment key for member ${member.memberId}`);
      }
      return {
        memberId: member.memberId,
        encryptedMasterKey: encryptMasterKeyForMember(
          masterKey.toString('hex'),
          enrollmentKey,
          member.memberId,
        ),
      };
    }),
  );

  const now = new Date().toISOString();
  const unsigned: Omit<SharedSpaceKeyRotationV1, 'rootSignature'> = {
    schemaVersion: 1,
    protocolVersion: SHARED_SPACE_PROTOCOL_VERSION,
    sharedSpaceId: input.sharedSpaceId,
    membershipEpoch: input.membershipEpoch,
    priorMasterKeyFingerprint: priorFingerprint,
    newMasterKeyFingerprint: newFingerprint,
    trigger: input.trigger,
    memberKeyEnvelopes,
    authorizedByMemberIds: [...input.authorizedByMemberIds].sort(),
    occurredAt: now,
  };
  const rotation: SharedSpaceKeyRotationV1 = {
    ...unsigned,
    rootSignature: signPayload(canonicalizeRecord(unsigned as unknown as Record<string, unknown>), rootPrivateKey),
  };
  store.saveKeyRotation(rotation);
  store.saveRoot({ ...root, membershipEpoch: input.membershipEpoch, updatedAt: now });
  return rotation;
}

export async function departSharedSpaceMember(
  store: SharedSpaceStore,
  secureStorage: SharedSpaceSecureStorage,
  input: DepartSharedSpaceMemberInput,
): Promise<SharedSpaceDepartureResult> {
  const root = store.getRoot(input.sharedSpaceId);
  if (!root) {
    throw new Error(`Shared space not found: ${input.sharedSpaceId}`);
  }
  const departing = store.getMember(input.sharedSpaceId, input.departingMemberId);
  if (!departing || departing.departedAt) {
    throw new Error(`Departing member is not active: ${input.departingMemberId}`);
  }
  if (departing.role === 'owner') {
    const activeOwners = store
      .listMembers(input.sharedSpaceId, true)
      .filter((member) => member.role === 'owner');
    if (activeOwners.length <= 1) {
      throw new Error('Cannot depart the last active owner without recovery quorum');
    }
  }

  const nextEpoch = root.membershipEpoch + 1;
  const rotation = await rotateSharedSpaceKeysOnMembershipChange(store, secureStorage, {
    sharedSpaceId: input.sharedSpaceId,
    membershipEpoch: nextEpoch,
    trigger: 'member_departed',
    authorizedByMemberIds: input.authorizedByMemberIds,
    domainId: input.domainId,
  });

  const rootPrivateKey = await secureStorage.get(sharedSpaceRootPrivateKey(input.sharedSpaceId));
  if (!rootPrivateKey) {
    throw new Error('Shared-space root private key missing');
  }

  const now = new Date().toISOString();
  const keyRotationId = hashHex(`${rotation.sharedSpaceId}:${rotation.membershipEpoch}:${rotation.newMasterKeyFingerprint}`);
  const unsignedDeparture: Omit<SharedSpaceDepartureV1, 'rootSignature'> = {
    schemaVersion: 1,
    protocolVersion: SHARED_SPACE_PROTOCOL_VERSION,
    sharedSpaceId: input.sharedSpaceId,
    membershipEpoch: nextEpoch,
    departingMemberId: input.departingMemberId,
    personalRootId: departing.personalRootId,
    keyRotationId,
    authorizedByMemberIds: [...input.authorizedByMemberIds].sort(),
    occurredAt: now,
  };
  const departure: SharedSpaceDepartureV1 = {
    ...unsignedDeparture,
    rootSignature: signPayload(
      canonicalizeRecord(unsignedDeparture as unknown as Record<string, unknown>),
      rootPrivateKey,
    ),
  };
  store.saveDeparture(departure);
  store.upsertMember({ ...departing, departedAt: now });

  await secureStorage.delete(
    `sharedSpace.${input.sharedSpaceId}.member.${input.departingMemberId}.enrollmentPrivateKey`,
  );

  return {
    sharedSpaceId: input.sharedSpaceId,
    membershipEpoch: nextEpoch,
    departingMemberId: input.departingMemberId,
    keyRotationId,
  };
}

export async function executeSharedSpaceRecovery(
  store: SharedSpaceStore,
  secureStorage: SharedSpaceSecureStorage,
  input: ExecuteSharedSpaceRecoveryInput,
): Promise<SharedSpaceRecoveryResult> {
  const root = store.getRoot(input.sharedSpaceId);
  if (!root) {
    throw new Error(`Shared space not found: ${input.sharedSpaceId}`);
  }

  for (const ownerId of input.authorizedOwnerMemberIds) {
    const owner = store.getMember(input.sharedSpaceId, ownerId);
    if (!owner || owner.departedAt || owner.role !== 'owner') {
      throw new Error(`Recovery authorizer must be an active owner: ${ownerId}`);
    }
  }

  if (input.submittedShares.length < root.recoveryThreshold) {
    throw new Error(`Recovery requires at least ${root.recoveryThreshold} shares`);
  }

  const shamirShares = sharesFromHex(input.submittedShares.slice(0, root.recoveryThreshold));
  const reconstructed = combineShares(shamirShares);
  const reconstructedSecretHash = hashRecoverySecret(reconstructed);
  if (reconstructedSecretHash !== root.recoverySecretHash) {
    throw new Error('Recovery shares failed to reconstruct the expected shared-space secret');
  }

  const nextEpoch = root.membershipEpoch + 1;
  const newRootKeys = generateEd25519KeyMaterial();
  const rootPrivateKey = await secureStorage.get(sharedSpaceRootPrivateKey(input.sharedSpaceId));
  if (!rootPrivateKey) {
    throw new Error('Shared-space root private key missing');
  }

  await secureStorage.set(sharedSpaceRootPrivateKey(input.sharedSpaceId), newRootKeys.privateKey);
  await secureStorage.set(sharedSpaceRootPublicKey(input.sharedSpaceId), newRootKeys.publicKey);

  const now = new Date().toISOString();
  const unsignedRecovery: Omit<SharedSpaceRecoveryV1, 'rootSignature'> = {
    schemaVersion: 1,
    protocolVersion: SHARED_SPACE_PROTOCOL_VERSION,
    sharedSpaceId: input.sharedSpaceId,
    membershipEpoch: nextEpoch,
    recoveryThreshold: root.recoveryThreshold,
    submittedShares: input.submittedShares.slice(0, root.recoveryThreshold),
    reconstructedSecretHash,
    authorizedOwnerMemberIds: [...input.authorizedOwnerMemberIds].sort(),
    newRootPublicKey: newRootKeys.publicKey,
    occurredAt: now,
  };
  const recovery: SharedSpaceRecoveryV1 = {
    ...unsignedRecovery,
    rootSignature: signPayload(
      canonicalizeRecord(unsignedRecovery as unknown as Record<string, unknown>),
      rootPrivateKey,
    ),
  };
  store.saveRecovery(recovery);
  store.saveRoot({
    ...root,
    sharedSpaceRootPublicKey: newRootKeys.publicKey,
    membershipEpoch: nextEpoch,
    updatedAt: now,
  });

  await rotateSharedSpaceKeysOnMembershipChange(store, secureStorage, {
    sharedSpaceId: input.sharedSpaceId,
    membershipEpoch: nextEpoch + 1,
    trigger: 'recovery',
    authorizedByMemberIds: input.authorizedOwnerMemberIds,
  });

  return {
    sharedSpaceId: input.sharedSpaceId,
    membershipEpoch: nextEpoch + 1,
    reconstructedSecretHash,
    newRootPublicKey: newRootKeys.publicKey,
  };
}

export async function encryptSharedSpaceEnvelope(
  input: SharedEnvelopeCryptoInput & { plaintext: string },
): Promise<string> {
  const epochKey = await loadSharedDomainEpochKey(
    input.secureStorage,
    input.sharedSpaceId,
    input.domainId,
    input.membershipEpoch,
  );
  return encryptSharedEnvelope(input.plaintext, epochKey);
}

export async function decryptSharedSpaceEnvelope(
  input: SharedEnvelopeCryptoInput & { ciphertext: string },
): Promise<string> {
  const epochKey = await loadSharedDomainEpochKey(
    input.secureStorage,
    input.sharedSpaceId,
    input.domainId,
    input.membershipEpoch,
  );
  return decryptSharedEnvelope(input.ciphertext, epochKey);
}

export function rejectLowerEpochEnvelope(requestedEpoch: number, currentEpoch: number): void {
  if (requestedEpoch < currentEpoch) {
    throw new Error(`Rejected lower-epoch shared envelope (requested=${requestedEpoch}, current=${currentEpoch})`);
  }
}

export function createSharedEnvelopeId(): string {
  return `shared-env-${randomUUID()}`;
}
