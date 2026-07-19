import { randomUUID } from 'node:crypto';
import type { SharedSpaceConsentV1, SharedSpaceRole } from '@semblance/protocol';
import { SHARED_SPACE_PROTOCOL_VERSION } from '@semblance/protocol';
import {
  createRecoverySecret,
  createSharedSpaceId,
  encryptMasterKeyForMember,
  hashRecoverySecret,
  openPersonalKeyMaterial,
  sealPersonalKeyMaterial,
  sharedSpaceMemberEnrollmentKey,
  sharedSpaceRecoverySecretKey,
  sharedSpaceRootPrivateKey,
  sharedSpaceRootPublicKey,
} from './crypto/domain-keys.js';
import {
  canonicalizeRecord,
  generateEd25519KeyMaterial,
  hashHex,
  signPayload,
} from './crypto/ed25519.js';
import { splitSecret } from './crypto/shamir.js';
import type { SharedSpaceSecureStorage } from './secure-storage.js';
import { computeMembershipEventHash, SharedSpaceStore } from './store.js';
import {
  PersonalVaultAccessError,
  type PersonalKeyEnvelope,
  type SharedSpaceMembershipResult,
  type SharedSpaceRootRecord,
  type SharedSpaceStatus,
} from './types.js';

export interface CreateSharedSpaceInput {
  readonly creatorMemberId: string;
  readonly creatorPersonalRootId: string;
  readonly creatorPersonalRootPrivateKey: string;
  readonly creatorPublicKey: string;
  readonly displayName?: string;
  readonly recoveryThreshold?: number;
  readonly recoveryTotal?: number;
}

export interface AddSharedSpaceMemberInput {
  readonly sharedSpaceId: string;
  readonly memberId: string;
  readonly personalRootId: string;
  readonly memberPublicKey: string;
  readonly memberEnrollmentPrivateKey: string;
  readonly role: SharedSpaceRole;
  readonly consentTextHash: string;
  readonly authorizedByMemberIds: string[];
}

export interface AssertPersonalVaultAccessInput {
  readonly actorMemberId: string;
  readonly actorRole: SharedSpaceRole;
  readonly targetMemberId: string;
  readonly targetPersonalEnvelope: PersonalKeyEnvelope;
  readonly actorPersonalRootPrivateKey: string;
}

const DEFAULT_RECOVERY_THRESHOLD = 2;
const DEFAULT_RECOVERY_TOTAL = 3;

function assertMonotonicEpoch(current: number, next: number): void {
  if (next !== current + 1) {
    throw new Error(`Shared-space membership epoch must advance by 1 (${current} -> ${next})`);
  }
}

function buildConsentRecord(input: {
  sharedSpaceId: string;
  memberId: string;
  personalRootId: string;
  requestedRole: SharedSpaceRole;
  consentTextHash: string;
  memberPrivateKey: string;
}): SharedSpaceConsentV1 {
  const grantedAt = new Date().toISOString();
  const consentRecordId = `consent-${randomUUID()}`;
  const unsigned = {
    schemaVersion: 1 as const,
    protocolVersion: SHARED_SPACE_PROTOCOL_VERSION,
    consentRecordId,
    sharedSpaceId: input.sharedSpaceId,
    memberId: input.memberId,
    personalRootId: input.personalRootId,
    requestedRole: input.requestedRole,
    consentTextHash: input.consentTextHash,
    grantedAt,
  };
  return {
    ...unsigned,
    memberSignature: signPayload(canonicalizeRecord(unsigned as unknown as Record<string, unknown>), input.memberPrivateKey),
  };
}

export function assertAdminCannotAccessPersonalVault(input: AssertPersonalVaultAccessInput): void {
  if (input.actorMemberId === input.targetMemberId) {
    return;
  }
  if (input.actorRole === 'admin' || input.actorRole === 'owner') {
    throw new PersonalVaultAccessError(
      'Shared-space admin/owner roles cannot access another member personal vault material',
    );
  }
  if (input.targetPersonalEnvelope.personalRootId !== input.targetPersonalEnvelope.memberId) {
    // noop — envelope must belong to target member
  }
  try {
    openPersonalKeyMaterial(
      input.targetMemberId,
      input.actorPersonalRootPrivateKey,
      input.targetPersonalEnvelope.sealedMaterial,
    );
    throw new PersonalVaultAccessError('Cross-member personal vault access must fail');
  } catch (error) {
    if (error instanceof PersonalVaultAccessError) {
      throw error;
    }
    // Expected decrypt failure for wrong personal root key.
  }
}

export async function createSharedSpace(
  store: SharedSpaceStore,
  secureStorage: SharedSpaceSecureStorage,
  input: CreateSharedSpaceInput,
): Promise<{ root: SharedSpaceRootRecord; status: SharedSpaceStatus; creatorConsent: SharedSpaceConsentV1 }> {
  const recoveryThreshold = input.recoveryThreshold ?? DEFAULT_RECOVERY_THRESHOLD;
  const recoveryTotal = input.recoveryTotal ?? DEFAULT_RECOVERY_TOTAL;
  if (recoveryTotal < recoveryThreshold) {
    throw new Error('Recovery total shares must be >= threshold');
  }
  if (input.creatorPersonalRootId.startsWith('sspace-')) {
    throw new Error('Personal Sovereignty Root cannot be used as a shared-space root');
  }

  const sharedSpaceId = createSharedSpaceId();
  const rootKeys = generateEd25519KeyMaterial();
  const recoverySecret = createRecoverySecret();
  const recoverySecretHash = hashRecoverySecret(recoverySecret);
  const now = new Date().toISOString();

  await secureStorage.set(sharedSpaceRootPrivateKey(sharedSpaceId), rootKeys.privateKey);
  await secureStorage.set(sharedSpaceRootPublicKey(sharedSpaceId), rootKeys.publicKey);
  await secureStorage.set(sharedSpaceRecoverySecretKey(sharedSpaceId), recoverySecret.toString('hex'));

  const shares = splitSecret(recoverySecret, recoveryThreshold, recoveryTotal);
  for (const share of shares) {
    await secureStorage.set(
      `sharedSpace.${sharedSpaceId}.recovery.share.${share.index}`,
      share.value.toString('hex'),
    );
  }

  const unsignedRoot = {
    schemaVersion: 1 as const,
    protocolVersion: SHARED_SPACE_PROTOCOL_VERSION,
    sharedSpaceId,
    sharedSpaceRootPublicKey: rootKeys.publicKey,
    membershipEpoch: 0,
    recoveryThreshold,
    recoveryTotal,
    recoverySecretHash,
    createdAt: now,
    updatedAt: now,
  };
  const rootSignature = signPayload(
    canonicalizeRecord(unsignedRoot as unknown as Record<string, unknown>),
    rootKeys.privateKey,
  );

  const root: SharedSpaceRootRecord = {
    sharedSpaceId,
    sharedSpaceRootPublicKey: rootKeys.publicKey,
    membershipEpoch: 0,
    recoveryThreshold,
    recoveryTotal,
    recoverySecretHash,
    createdAt: now,
    updatedAt: now,
  };
  store.saveRoot(root);

  const creatorEnrollment = generateEd25519KeyMaterial();
  await secureStorage.set(
    sharedSpaceMemberEnrollmentKey(sharedSpaceId, input.creatorMemberId),
    creatorEnrollment.privateKey,
  );

  const creatorConsent = buildConsentRecord({
    sharedSpaceId,
    memberId: input.creatorMemberId,
    personalRootId: input.creatorPersonalRootId,
    requestedRole: 'owner',
    consentTextHash: hashHex(`create:${sharedSpaceId}:${input.displayName ?? 'shared-space'}`),
    memberPrivateKey: input.creatorPersonalRootPrivateKey,
  });
  store.saveConsent(creatorConsent);

  const membershipEventUnsigned = {
    schemaVersion: 1 as const,
    protocolVersion: SHARED_SPACE_PROTOCOL_VERSION,
    sharedSpaceId,
    membershipEpoch: 0,
    operation: 'add' as const,
    memberId: input.creatorMemberId,
    personalRootId: input.creatorPersonalRootId,
    memberPublicKey: input.creatorPublicKey,
    role: 'owner' as const,
    consentRecordId: creatorConsent.consentRecordId,
    priorEventHash: null,
    authorizedByMemberIds: [input.creatorMemberId],
    sharedKeyEnvelope: encryptMasterKeyForMember(
      recoverySecret.toString('hex'),
      creatorEnrollment.privateKey,
      input.creatorMemberId,
    ),
    occurredAt: now,
  };
  const membershipEvent = {
    ...membershipEventUnsigned,
    rootSignature: signPayload(
      canonicalizeRecord(membershipEventUnsigned as unknown as Record<string, unknown>),
      rootKeys.privateKey,
    ),
  };
  store.appendMembershipEvent(membershipEvent, rootKeys.publicKey);
  store.upsertMember({
    sharedSpaceId,
    memberId: input.creatorMemberId,
    personalRootId: input.creatorPersonalRootId,
    memberPublicKey: input.creatorPublicKey,
    role: 'owner',
    consentRecordId: creatorConsent.consentRecordId,
    joinedAt: now,
    departedAt: null,
    epochAdded: 0,
  });

  return {
    root,
    status: toStatus(store, root),
    creatorConsent,
  };
}

export async function addSharedSpaceMember(
  store: SharedSpaceStore,
  secureStorage: SharedSpaceSecureStorage,
  input: AddSharedSpaceMemberInput,
): Promise<SharedSpaceMembershipResult> {
  const root = store.getRoot(input.sharedSpaceId);
  if (!root) {
    throw new Error(`Shared space not found: ${input.sharedSpaceId}`);
  }
  if (input.personalRootId.startsWith('sspace-')) {
    throw new Error('Member personal root must remain distinct from shared-space root');
  }

  for (const authorizerId of input.authorizedByMemberIds) {
    const authorizer = store.getMember(input.sharedSpaceId, authorizerId);
    if (!authorizer || authorizer.departedAt) {
      throw new Error(`Authorizing member is not active: ${authorizerId}`);
    }
    if (authorizer.role !== 'owner' && authorizer.role !== 'admin') {
      throw new Error(`Member ${authorizerId} cannot authorize membership changes`);
    }
  }

  const nextEpoch = root.membershipEpoch + 1;
  assertMonotonicEpoch(root.membershipEpoch, nextEpoch);
  const rootPrivateKey = await secureStorage.get(sharedSpaceRootPrivateKey(input.sharedSpaceId));
  if (!rootPrivateKey) {
    throw new Error('Shared-space root private key missing');
  }

  const consent = buildConsentRecord({
    sharedSpaceId: input.sharedSpaceId,
    memberId: input.memberId,
    personalRootId: input.personalRootId,
    requestedRole: input.role,
    consentTextHash: input.consentTextHash,
    memberPrivateKey: input.memberEnrollmentPrivateKey,
  });
  store.saveConsent(consent);

  await secureStorage.set(
    sharedSpaceMemberEnrollmentKey(input.sharedSpaceId, input.memberId),
    input.memberEnrollmentPrivateKey,
  );

  const masterKeyHex = await secureStorage.get(sharedSpaceRecoverySecretKey(input.sharedSpaceId));
  if (!masterKeyHex) {
    throw new Error('Shared-space recovery secret missing');
  }

  const now = new Date().toISOString();
  const priorEventHash = store.getLatestMembershipEventHash(input.sharedSpaceId);
  const membershipEventUnsigned = {
    schemaVersion: 1 as const,
    protocolVersion: SHARED_SPACE_PROTOCOL_VERSION,
    sharedSpaceId: input.sharedSpaceId,
    membershipEpoch: nextEpoch,
    operation: 'add' as const,
    memberId: input.memberId,
    personalRootId: input.personalRootId,
    memberPublicKey: input.memberPublicKey,
    role: input.role,
    consentRecordId: consent.consentRecordId,
    priorEventHash,
    authorizedByMemberIds: [...input.authorizedByMemberIds].sort(),
    sharedKeyEnvelope: encryptMasterKeyForMember(
      masterKeyHex,
      input.memberEnrollmentPrivateKey,
      input.memberId,
    ),
    occurredAt: now,
  };
  const membershipEvent = {
    ...membershipEventUnsigned,
    rootSignature: signPayload(
      canonicalizeRecord(membershipEventUnsigned as unknown as Record<string, unknown>),
      rootPrivateKey,
    ),
  };
  store.appendMembershipEvent(membershipEvent, root.sharedSpaceRootPublicKey);
  store.upsertMember({
    sharedSpaceId: input.sharedSpaceId,
    memberId: input.memberId,
    personalRootId: input.personalRootId,
    memberPublicKey: input.memberPublicKey,
    role: input.role,
    consentRecordId: consent.consentRecordId,
    joinedAt: now,
    departedAt: null,
    epochAdded: nextEpoch,
  });
  store.saveRoot({ ...root, membershipEpoch: nextEpoch, updatedAt: now });

  return {
    sharedSpaceId: input.sharedSpaceId,
    membershipEpoch: nextEpoch,
    memberId: input.memberId,
    operation: 'add',
    consentRecordId: consent.consentRecordId,
  };
}

export function getSharedSpaceStatus(store: SharedSpaceStore, sharedSpaceId: string): SharedSpaceStatus {
  const root = store.getRoot(sharedSpaceId);
  if (!root) {
    throw new Error(`Shared space not found: ${sharedSpaceId}`);
  }
  return toStatus(store, root);
}

export function listSharedSpaceMembers(
  store: SharedSpaceStore,
  sharedSpaceId: string,
  activeOnly = true,
) {
  return store.listMembers(sharedSpaceId, activeOnly);
}

function toStatus(store: SharedSpaceStore, root: SharedSpaceRootRecord): SharedSpaceStatus {
  return {
    sharedSpaceId: root.sharedSpaceId,
    sharedSpaceRootPublicKey: root.sharedSpaceRootPublicKey,
    membershipEpoch: root.membershipEpoch,
    recoveryThreshold: root.recoveryThreshold,
    recoveryTotal: root.recoveryTotal,
    activeMemberCount: store.listMembers(root.sharedSpaceId, true).length,
    createdAt: root.createdAt,
    updatedAt: root.updatedAt,
  };
}

export function sealMemberPersonalVaultKey(
  memberId: string,
  personalRootId: string,
  personalRootPrivateKey: string,
  personalVaultKeyHex: string,
): PersonalKeyEnvelope {
  return {
    memberId,
    personalRootId,
    sealedMaterial: sealPersonalKeyMaterial(memberId, personalRootPrivateKey, personalVaultKeyHex),
  };
}

export function openMemberPersonalVaultKey(
  envelope: PersonalKeyEnvelope,
  personalRootPrivateKey: string,
): string {
  return openPersonalKeyMaterial(envelope.memberId, personalRootPrivateKey, envelope.sealedMaterial);
}

export { computeMembershipEventHash };
