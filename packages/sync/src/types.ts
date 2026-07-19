export type DeviceRole = 'owner' | 'member';

export interface SyncDeviceRecord {
  readonly deviceId: string;
  readonly publicKey: string;
  readonly role: DeviceRole;
  readonly enrolledAt: string;
  readonly revokedAt: string | null;
  readonly epochAdded: number;
}

export interface SovereigntyRootRecord {
  readonly rootId: string;
  readonly ownerDeviceId: string;
  readonly membershipEpoch: number;
  readonly rootPublicKey: string;
  readonly recoveryThreshold: number;
  readonly recoveryTotal: number;
  readonly priorRootHash: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SovereigntyRootStatus {
  readonly rootId: string;
  readonly ownerDeviceId: string;
  readonly membershipEpoch: number;
  readonly rootPublicKey: string;
  readonly activeDeviceCount: number;
  readonly recoveryThreshold: number;
  readonly recoveryTotal: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RecoveryShare {
  readonly index: number;
  readonly shareHex: string;
}

export interface RecoveryQuorumProof {
  readonly threshold: number;
  readonly shares: RecoveryShare[];
  readonly reconstructedSecretHash: string;
}

export interface MembershipOperationResult {
  readonly eventId: string;
  readonly membershipEpoch: number;
  readonly rootId: string;
  readonly deviceId: string;
  readonly operation: 'add' | 'revoke' | 'rotate_root' | 'transfer_owner';
}
