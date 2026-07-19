export type {
  DeviceRole,
  MembershipOperationResult,
  RecoveryQuorumProof,
  RecoveryShare,
  SovereigntyRootRecord,
  SovereigntyRootStatus,
  SyncDeviceRecord,
} from './types.js';

export {
  canonicalizeRecord,
  generateEd25519KeyMaterial,
  hashHex,
  signPayload,
  verifyPayload,
} from './crypto/ed25519.js';
export {
  combineShares,
  sharesFromHex,
  sharesToHex,
  splitSecret,
  type ShamirShare,
} from './crypto/shamir.js';

export {
  SYNC_ROOT_PRIVATE_KEY,
  SYNC_ROOT_PUBLIC_KEY,
  SYNC_ROOT_SECRET_KEY,
  createSyncSecureStorageAdapter,
  createMemorySyncSecureStorage,
  syncDevicePrivateKey,
  syncDevicePublicKey,
  syncRecoveryShareKey,
  type KeyStoreLike,
  type SyncSecureStorageAdapter,
} from './keys/secure-storage.js';
export {
  exportDeviceKeyMaterial,
  getOrCreateDeviceKeys,
  loadDevicePublicKey,
  type StoredDeviceKeys,
} from './keys/device-keys.js';

export {
  buildMembershipEvent,
  buildQuorumProof,
  computeMembershipEventHash,
  createInitialRootKeyMaterial,
  createRecoverySecret,
  createRootId,
  hashRecoverySecret,
  toMembershipOperationResult,
  type BuildMembershipEventInput,
  type MembershipOperation,
} from './membership/event.js';
export {
  MembershipEpochConflictError,
  MembershipStore,
  openMembershipStore,
} from './membership/store.js';
export {
  MembershipRevocationError,
  addDeviceMembership,
  applyExternalMembershipEvent,
  assertMonotonicEpoch,
  rejectConflictingLowerEpoch,
  revokeDeviceMembership,
  type AddDeviceInput,
  type RevokeDeviceInput,
} from './membership/revocation.js';

export {
  buildRecoveryQuorumProofString,
  executeRecoveryRotation,
  generateRecoveryShares,
  loadRecoveryShare,
  persistRecoveryShares,
  verifyRecoveryQuorum,
  type RecoveryConfig,
} from './root/recovery.js';
export {
  SovereigntyRootService,
  createSovereigntyRootService,
  hashSovereigntyRootAnchor,
  type SovereigntyRootServiceOptions,
} from './root/sovereignty-root.js';
