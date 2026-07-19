import type { DeviceMembershipEventV1 } from '@semblance/protocol';
import {
  buildMembershipEvent,
  buildQuorumProof,
  toMembershipOperationResult,
} from '../membership/event.js';
import { MembershipEpochConflictError, type MembershipStore } from '../membership/store.js';
import type { MembershipOperationResult } from '../types.js';

export interface RevokeDeviceInput {
  deviceId: string;
  authorizedByDeviceIds: string[];
}

export interface AddDeviceInput {
  deviceId: string;
  devicePublicKey: string;
  authorizedByDeviceIds: string[];
}

export class MembershipRevocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MembershipRevocationError';
  }
}

export function assertMonotonicEpoch(currentEpoch: number, nextEpoch: number): void {
  if (nextEpoch <= currentEpoch) {
    throw new MembershipEpochConflictError(
      `Membership epoch must increase monotonically (${currentEpoch} -> ${nextEpoch})`,
    );
  }
}

export function rejectConflictingLowerEpoch(store: MembershipStore, epoch: number): void {
  const latest = store.getLatestEpoch();
  if (epoch < latest) {
    throw new MembershipEpochConflictError(
      `Rejected conflicting lower epoch ${epoch}; authoritative epoch is ${latest}`,
    );
  }
}

export function revokeDeviceMembership(params: {
  store: MembershipStore;
  rootId: string;
  rootPrivateKey: string;
  input: RevokeDeviceInput;
}): MembershipOperationResult {
  const root = params.store.getRoot();
  if (!root) {
    throw new MembershipRevocationError('Sovereignty root is not initialized');
  }

  const device = params.store.getDevice(params.input.deviceId);
  if (!device || device.revokedAt) {
    throw new MembershipRevocationError(`Device is not an active member: ${params.input.deviceId}`);
  }

  if (device.role === 'owner') {
    throw new MembershipRevocationError('Owner device cannot be revoked; transfer ownership first');
  }

  const nextEpoch = root.membershipEpoch + 1;
  assertMonotonicEpoch(root.membershipEpoch, nextEpoch);

  const now = new Date().toISOString();
  const event = buildMembershipEvent({
    rootId: params.rootId,
    membershipEpoch: nextEpoch,
    operation: 'revoke',
    deviceId: params.input.deviceId,
    devicePublicKey: device.publicKey,
    priorEventHash: params.store.getLatestEventHash(),
    authorizedByDeviceIds: params.input.authorizedByDeviceIds,
    quorumProof: buildQuorumProof(params.input.authorizedByDeviceIds, 'revoke'),
    rootPrivateKey: params.rootPrivateKey,
    occurredAt: now,
  });

  params.store.appendEvent(event);
  params.store.saveRoot({
    ...root,
    membershipEpoch: nextEpoch,
    updatedAt: now,
  });
  params.store.upsertDevice({
    ...device,
    revokedAt: now,
  });

  return toMembershipOperationResult(event);
}

export function addDeviceMembership(params: {
  store: MembershipStore;
  rootId: string;
  rootPrivateKey: string;
  input: AddDeviceInput;
}): MembershipOperationResult {
  const root = params.store.getRoot();
  if (!root) {
    throw new MembershipRevocationError('Sovereignty root is not initialized');
  }

  const existing = params.store.getDevice(params.input.deviceId);
  if (existing && !existing.revokedAt) {
    throw new MembershipRevocationError(`Device is already enrolled: ${params.input.deviceId}`);
  }

  const nextEpoch = root.membershipEpoch + 1;
  assertMonotonicEpoch(root.membershipEpoch, nextEpoch);

  const now = new Date().toISOString();
  const event = buildMembershipEvent({
    rootId: params.rootId,
    membershipEpoch: nextEpoch,
    operation: 'add',
    deviceId: params.input.deviceId,
    devicePublicKey: params.input.devicePublicKey,
    priorEventHash: params.store.getLatestEventHash(),
    authorizedByDeviceIds: params.input.authorizedByDeviceIds,
    quorumProof: buildQuorumProof(params.input.authorizedByDeviceIds, 'add'),
    rootPrivateKey: params.rootPrivateKey,
    occurredAt: now,
  });

  params.store.appendEvent(event);
  params.store.saveRoot({
    ...root,
    membershipEpoch: nextEpoch,
    updatedAt: now,
  });
  params.store.upsertDevice({
    deviceId: params.input.deviceId,
    publicKey: params.input.devicePublicKey,
    role: 'member',
    enrolledAt: now,
    revokedAt: null,
    epochAdded: nextEpoch,
  });

  return toMembershipOperationResult(event);
}

export function applyExternalMembershipEvent(params: {
  store: MembershipStore;
  event: DeviceMembershipEventV1;
}): MembershipOperationResult {
  rejectConflictingLowerEpoch(params.store, params.event.membershipEpoch);
  params.store.appendEvent(params.event);
  return toMembershipOperationResult(params.event);
}
