import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DeviceMembershipEventV1 } from '@semblance/protocol';
import {
  canonicalizeRecord,
  generateEd25519KeyMaterial,
  hashHex,
  signPayload,
} from '../crypto/ed25519.js';
import type { MembershipOperationResult } from '../types.js';

export type MembershipOperation = DeviceMembershipEventV1['operation'];

export interface BuildMembershipEventInput {
  rootId: string;
  membershipEpoch: number;
  operation: MembershipOperation;
  deviceId: string;
  devicePublicKey: string;
  priorEventHash: string | null;
  authorizedByDeviceIds: string[];
  quorumProof: string;
  rootPrivateKey: string;
  domainKeyEnvelopes?: DeviceMembershipEventV1['domainKeyEnvelopes'];
  occurredAt?: string;
}

export function computeMembershipEventHash(event: Omit<DeviceMembershipEventV1, 'rootSignature'>): string {
  return hashHex(canonicalizeRecord(event as unknown as Record<string, unknown>));
}

export function buildMembershipEvent(input: BuildMembershipEventInput): DeviceMembershipEventV1 {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const unsigned: Omit<DeviceMembershipEventV1, 'rootSignature'> = {
    schemaVersion: 1,
    rootId: input.rootId,
    membershipEpoch: input.membershipEpoch,
    operation: input.operation,
    deviceId: input.deviceId,
    devicePublicKey: input.devicePublicKey,
    priorEventHash: input.priorEventHash,
    authorizedByDeviceIds: [...input.authorizedByDeviceIds].sort(),
    quorumProof: input.quorumProof,
    domainKeyEnvelopes: input.domainKeyEnvelopes ?? [],
    occurredAt,
  };

  const rootSignature = signPayload(canonicalizeRecord(unsigned as unknown as Record<string, unknown>), input.rootPrivateKey);
  return {
    ...unsigned,
    rootSignature,
  };
}

export function buildQuorumProof(authorizedByDeviceIds: string[], operation: MembershipOperation): string {
  return hashHex(
    canonicalizeRecord({
      authorizedByDeviceIds: [...authorizedByDeviceIds].sort(),
      operation,
    }),
  );
}

export function toMembershipOperationResult(event: DeviceMembershipEventV1): MembershipOperationResult {
  return {
    eventId: computeMembershipEventHash({
      schemaVersion: event.schemaVersion,
      rootId: event.rootId,
      membershipEpoch: event.membershipEpoch,
      operation: event.operation,
      deviceId: event.deviceId,
      devicePublicKey: event.devicePublicKey,
      priorEventHash: event.priorEventHash,
      authorizedByDeviceIds: event.authorizedByDeviceIds,
      quorumProof: event.quorumProof,
      domainKeyEnvelopes: event.domainKeyEnvelopes,
      occurredAt: event.occurredAt,
    }),
    membershipEpoch: event.membershipEpoch,
    rootId: event.rootId,
    deviceId: event.deviceId,
    operation:
      event.operation === 'change_recovery'
        ? 'add'
        : event.operation,
  };
}

export function createRootId(): string {
  return `root-${randomUUID()}`;
}

export function createRecoverySecret(): Buffer {
  return randomBytes(32);
}

export function hashRecoverySecret(secret: Buffer): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function createInitialRootKeyMaterial(): ReturnType<typeof generateEd25519KeyMaterial> {
  return generateEd25519KeyMaterial();
}
