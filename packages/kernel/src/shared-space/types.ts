import type { SharedSpaceRole } from '@semblance/protocol';

export interface SharedSpaceRootRecord {
  readonly sharedSpaceId: string;
  readonly sharedSpaceRootPublicKey: string;
  readonly membershipEpoch: number;
  readonly recoveryThreshold: number;
  readonly recoveryTotal: number;
  readonly recoverySecretHash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SharedSpaceMemberRecord {
  readonly memberId: string;
  readonly personalRootId: string;
  readonly memberPublicKey: string;
  readonly role: SharedSpaceRole;
  readonly consentRecordId: string;
  readonly joinedAt: string;
  readonly departedAt: string | null;
  readonly epochAdded: number;
}

export interface SharedSpaceStatus {
  readonly sharedSpaceId: string;
  readonly sharedSpaceRootPublicKey: string;
  readonly membershipEpoch: number;
  readonly recoveryThreshold: number;
  readonly recoveryTotal: number;
  readonly activeMemberCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SharedSpaceMembershipResult {
  readonly sharedSpaceId: string;
  readonly membershipEpoch: number;
  readonly memberId: string;
  readonly operation: 'add' | 'remove' | 'role_change';
  readonly consentRecordId: string;
}

export interface SharedSpaceDepartureResult {
  readonly sharedSpaceId: string;
  readonly membershipEpoch: number;
  readonly departingMemberId: string;
  readonly keyRotationId: string;
}

export interface SharedSpaceRecoveryResult {
  readonly sharedSpaceId: string;
  readonly membershipEpoch: number;
  readonly reconstructedSecretHash: string;
  readonly newRootPublicKey: string;
}

export interface PersonalKeyEnvelope {
  readonly memberId: string;
  readonly personalRootId: string;
  readonly sealedMaterial: string;
}

export class PersonalVaultAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersonalVaultAccessError';
  }
}

export class SharedSpaceEpochError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SharedSpaceEpochError';
  }
}
