import {
  addSharedSpaceMember,
  assertAdminCannotAccessPersonalVault,
  createSharedSpace,
  getSharedSpaceStatus,
  listSharedSpaceMembers,
  openMemberPersonalVaultKey,
  sealMemberPersonalVaultKey,
  type AddSharedSpaceMemberInput,
  type AssertPersonalVaultAccessInput,
  type CreateSharedSpaceInput,
} from './membership.js';
import {
  decryptSharedSpaceEnvelope,
  departSharedSpaceMember,
  encryptSharedSpaceEnvelope,
  executeSharedSpaceRecovery,
  rejectLowerEpochEnvelope,
  rotateSharedSpaceKeysOnMembershipChange,
  type DepartSharedSpaceMemberInput,
  type ExecuteSharedSpaceRecoveryInput,
  type SharedEnvelopeCryptoInput,
} from './key-rotation.js';
import type { SharedSpaceSecureStorage } from './secure-storage.js';
import { openSharedSpaceStore, type SharedSpaceStore } from './store.js';
import type { SharedSpaceStatus } from './types.js';

export interface SharedSpaceServiceOptions {
  readonly dataDir: string;
  readonly secureStorage: SharedSpaceSecureStorage;
}

export class SharedSpaceService {
  private readonly store: SharedSpaceStore;

  private constructor(
    store: SharedSpaceStore,
    private readonly secureStorage: SharedSpaceSecureStorage,
  ) {
    this.store = store;
  }

  static initialize(options: SharedSpaceServiceOptions): SharedSpaceService {
    const store = openSharedSpaceStore(options.dataDir);
    return new SharedSpaceService(store, options.secureStorage);
  }

  close(): void {
    this.store.close();
  }

  async createSharedSpace(input: CreateSharedSpaceInput) {
    return createSharedSpace(this.store, this.secureStorage, input);
  }

  async addMember(input: AddSharedSpaceMemberInput) {
    return addSharedSpaceMember(this.store, this.secureStorage, input);
  }

  getStatus(sharedSpaceId: string): SharedSpaceStatus {
    return getSharedSpaceStatus(this.store, sharedSpaceId);
  }

  listMembers(sharedSpaceId: string, activeOnly = true) {
    return listSharedSpaceMembers(this.store, sharedSpaceId, activeOnly);
  }

  listSharedSpaces(): SharedSpaceStatus[] {
    return this.store.listRoots().map((root) => getSharedSpaceStatus(this.store, root.sharedSpaceId));
  }

  async departMember(input: DepartSharedSpaceMemberInput) {
    return departSharedSpaceMember(this.store, this.secureStorage, input);
  }

  async executeRecovery(input: ExecuteSharedSpaceRecoveryInput) {
    return executeSharedSpaceRecovery(this.store, this.secureStorage, input);
  }
}

export {
  addSharedSpaceMember,
  assertAdminCannotAccessPersonalVault,
  createSharedSpace,
  decryptSharedSpaceEnvelope,
  departSharedSpaceMember,
  encryptSharedSpaceEnvelope,
  executeSharedSpaceRecovery,
  getSharedSpaceStatus,
  listSharedSpaceMembers,
  openMemberPersonalVaultKey,
  openSharedSpaceStore,
  rejectLowerEpochEnvelope,
  rotateSharedSpaceKeysOnMembershipChange,
  sealMemberPersonalVaultKey,
};
export type { SharedSpaceStore } from './store.js';
export type {
  AddSharedSpaceMemberInput,
  AssertPersonalVaultAccessInput,
  CreateSharedSpaceInput,
} from './membership.js';
export type {
  DepartSharedSpaceMemberInput,
  ExecuteSharedSpaceRecoveryInput,
  SharedEnvelopeCryptoInput,
} from './key-rotation.js';
export type {
  PersonalKeyEnvelope,
  PersonalVaultAccessError,
  SharedSpaceDepartureResult,
  SharedSpaceMembershipResult,
  SharedSpaceRecoveryResult,
  SharedSpaceRootRecord,
  SharedSpaceStatus,
} from './types.js';
export {
  createMemorySharedSpaceSecureStorage,
  createSharedSpaceSecureStorage,
  type SharedSpaceSecureStorage,
} from './secure-storage.js';
export {
  evaluateSharedAction,
  decideOrgScopedExecutionDestination,
  SENSITIVE_SHARED_ACTIONS,
  SharedSpacePolicyError,
  type CapabilityScope,
  type EvaluateSharedActionInput,
  type OrgScopedExecutionDestinationInput,
  type SensitiveSharedAction,
  type SharedActionEvaluation,
  type SharedSpacePolicyAction,
  type SharedSpacePolicyActor,
  type SharedSpacePolicyApproval,
  type SharedSpacePolicyActionRequest,
  type SharedSpacePolicySpace,
} from './policy.js';
