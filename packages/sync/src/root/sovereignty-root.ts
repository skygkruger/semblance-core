import { createHash } from 'node:crypto';
import {
  buildMembershipEvent,
  buildQuorumProof,
  createInitialRootKeyMaterial,
  createRecoverySecret,
  createRootId,
  hashRecoverySecret,
  toMembershipOperationResult,
} from '../membership/event.js';
import { openMembershipStore, type MembershipStore } from '../membership/store.js';
import {
  addDeviceMembership,
  assertMonotonicEpoch,
  revokeDeviceMembership,
  type AddDeviceInput,
  type RevokeDeviceInput,
} from '../membership/revocation.js';
import {
  generateRecoveryShares,
  persistRecoveryShares,
  verifyRecoveryQuorum,
  type RecoveryConfig,
} from '../root/recovery.js';
import {
  generateEd25519KeyMaterial,
  hashHex,
} from '../crypto/ed25519.js';
import { getOrCreateDeviceKeys } from '../keys/device-keys.js';
import {
  SYNC_ROOT_PRIVATE_KEY,
  SYNC_ROOT_PUBLIC_KEY,
  SYNC_ROOT_SECRET_KEY,
  type SyncSecureStorageAdapter,
} from '../keys/secure-storage.js';
import type {
  MembershipOperationResult,
  RecoveryQuorumProof,
  RecoveryShare,
  SovereigntyRootStatus,
} from '../types.js';

export interface SovereigntyRootServiceOptions {
  dataDir: string;
  secureStorage: SyncSecureStorageAdapter;
  recovery?: Partial<RecoveryConfig>;
  ownerDeviceId?: string;
}

const DEFAULT_RECOVERY: RecoveryConfig = {
  threshold: 2,
  totalShares: 3,
};

export class SovereigntyRootService {
  private readonly store: MembershipStore;
  private readonly secureStorage: SyncSecureStorageAdapter;
  private readonly recoveryConfig: RecoveryConfig;

  private constructor(
    store: MembershipStore,
    secureStorage: SyncSecureStorageAdapter,
    recoveryConfig: RecoveryConfig,
  ) {
    this.store = store;
    this.secureStorage = secureStorage;
    this.recoveryConfig = recoveryConfig;
  }

  static async initialize(options: SovereigntyRootServiceOptions): Promise<SovereigntyRootService> {
    const recoveryConfig: RecoveryConfig = {
      threshold: options.recovery?.threshold ?? DEFAULT_RECOVERY.threshold,
      totalShares: options.recovery?.totalShares ?? DEFAULT_RECOVERY.totalShares,
    };

    if (recoveryConfig.totalShares < recoveryConfig.threshold) {
      throw new Error('Recovery total shares must be >= threshold');
    }

    const store = openMembershipStore(options.dataDir);
    const service = new SovereigntyRootService(store, options.secureStorage, recoveryConfig);

    if (!store.getRoot()) {
      await service.createRoot(options.ownerDeviceId);
    }

    return service;
  }

  close(): void {
    this.store.close();
  }

  async getStatus(): Promise<SovereigntyRootStatus> {
    const root = this.store.getRoot();
    if (!root) {
      throw new Error('Sovereignty root is not initialized');
    }

    const activeDevices = this.store.listDevices(false);
    return {
      rootId: root.rootId,
      ownerDeviceId: root.ownerDeviceId,
      membershipEpoch: root.membershipEpoch,
      rootPublicKey: root.rootPublicKey,
      activeDeviceCount: activeDevices.length,
      recoveryThreshold: root.recoveryThreshold,
      recoveryTotal: root.recoveryTotal,
      createdAt: root.createdAt,
      updatedAt: root.updatedAt,
    };
  }

  async addDevice(input: AddDeviceInput): Promise<MembershipOperationResult> {
    const root = this.requireRoot();
    const rootPrivateKey = await this.requireRootPrivateKey();
    return addDeviceMembership({
      store: this.store,
      rootId: root.rootId,
      rootPrivateKey,
      input,
    });
  }

  async revokeDevice(input: RevokeDeviceInput): Promise<MembershipOperationResult> {
    const root = this.requireRoot();
    const rootPrivateKey = await this.requireRootPrivateKey();
    return revokeDeviceMembership({
      store: this.store,
      rootId: root.rootId,
      rootPrivateKey,
      input,
    });
  }

  async rotateRoot(authorizedByDeviceIds: string[]): Promise<SovereigntyRootStatus> {
    const root = this.requireRoot();
    const rootPrivateKey = await this.requireRootPrivateKey();
    const nextEpoch = root.membershipEpoch + 1;
    assertMonotonicEpoch(root.membershipEpoch, nextEpoch);

    const newRootKeys = generateEd25519KeyMaterial();
    const now = new Date().toISOString();
    const priorRootHash = hashHex(`${root.rootPublicKey}:${root.membershipEpoch}`);

    const owner = this.store.getDevice(root.ownerDeviceId);
    if (!owner) {
      throw new Error('Owner device record missing');
    }

    const event = buildMembershipEvent({
      rootId: root.rootId,
      membershipEpoch: nextEpoch,
      operation: 'rotate_root',
      deviceId: root.ownerDeviceId,
      devicePublicKey: owner.publicKey,
      priorEventHash: this.store.getLatestEventHash(),
      authorizedByDeviceIds,
      quorumProof: buildQuorumProof(authorizedByDeviceIds, 'rotate_root'),
      rootPrivateKey,
      occurredAt: now,
    });

    this.store.appendEvent(event);
    await this.secureStorage.set(SYNC_ROOT_PRIVATE_KEY, newRootKeys.privateKey);
    await this.secureStorage.set(SYNC_ROOT_PUBLIC_KEY, newRootKeys.publicKey);

    this.store.saveRoot({
      ...root,
      membershipEpoch: nextEpoch,
      rootPublicKey: newRootKeys.publicKey,
      priorRootHash,
      updatedAt: now,
    });

    return this.getStatus();
  }

  async transferOwner(newOwnerDeviceId: string, authorizedByDeviceIds: string[]): Promise<SovereigntyRootStatus> {
    const root = this.requireRoot();
    const rootPrivateKey = await this.requireRootPrivateKey();
    const nextEpoch = root.membershipEpoch + 1;
    assertMonotonicEpoch(root.membershipEpoch, nextEpoch);

    const newOwner = this.store.getDevice(newOwnerDeviceId);
    if (!newOwner || newOwner.revokedAt) {
      throw new Error(`New owner device is not active: ${newOwnerDeviceId}`);
    }

    const currentOwner = this.store.getDevice(root.ownerDeviceId);
    if (!currentOwner) {
      throw new Error('Current owner device record missing');
    }

    const now = new Date().toISOString();
    const event = buildMembershipEvent({
      rootId: root.rootId,
      membershipEpoch: nextEpoch,
      operation: 'transfer_owner',
      deviceId: newOwnerDeviceId,
      devicePublicKey: newOwner.publicKey,
      priorEventHash: this.store.getLatestEventHash(),
      authorizedByDeviceIds,
      quorumProof: buildQuorumProof(authorizedByDeviceIds, 'transfer_owner'),
      rootPrivateKey,
      occurredAt: now,
    });

    this.store.appendEvent(event);
    this.store.upsertDevice({ ...currentOwner, role: 'member' });
    this.store.upsertDevice({ ...newOwner, role: 'owner' });
    this.store.saveRoot({
      ...root,
      ownerDeviceId: newOwnerDeviceId,
      membershipEpoch: nextEpoch,
      updatedAt: now,
    });

    return this.getStatus();
  }

  async recoverRoot(params: {
    shares: RecoveryShare[];
    authorizedDeviceIds: string[];
  }): Promise<{ proof: RecoveryQuorumProof; status: SovereigntyRootStatus }> {
    const root = this.requireRoot();
    const secretHex = await this.secureStorage.get(SYNC_ROOT_SECRET_KEY);
    if (!secretHex) {
      throw new Error('Recovery secret is not available');
    }
    const expectedSecretHash = hashRecoverySecret(Buffer.from(secretHex, 'hex'));

    const proof = verifyRecoveryQuorum(
      params.shares,
      root.recoveryThreshold,
      expectedSecretHash,
    );

    if (params.authorizedDeviceIds.length === 0) {
      throw new Error('Recovery requires authorized device approvals');
    }

    const status = await this.rotateRoot(params.authorizedDeviceIds);
    return { proof, status };
  }

  listDevices(includeRevoked = false) {
    return this.store.listDevices(includeRevoked);
  }

  private requireRoot() {
    const root = this.store.getRoot();
    if (!root) {
      throw new Error('Sovereignty root is not initialized');
    }
    return root;
  }

  private async requireRootPrivateKey(): Promise<string> {
    const privateKey = await this.secureStorage.get(SYNC_ROOT_PRIVATE_KEY);
    if (!privateKey) {
      throw new Error('Root private key is not available in secure storage');
    }
    return privateKey;
  }

  private async createRoot(ownerDeviceId?: string): Promise<void> {
    const rootKeys = createInitialRootKeyMaterial();
    const ownerKeys = await getOrCreateDeviceKeys(this.secureStorage, ownerDeviceId);
    const recoverySecret = createRecoverySecret();
    const recoveryShares = generateRecoveryShares(recoverySecret, this.recoveryConfig);

    await this.secureStorage.set(SYNC_ROOT_PRIVATE_KEY, rootKeys.privateKey);
    await this.secureStorage.set(SYNC_ROOT_PUBLIC_KEY, rootKeys.publicKey);
    await this.secureStorage.set(SYNC_ROOT_SECRET_KEY, recoverySecret.toString('hex'));
    await persistRecoveryShares(this.secureStorage, recoveryShares);

    const now = new Date().toISOString();
    const rootId = createRootId();

    const rootRecord = {
      rootId,
      ownerDeviceId: ownerKeys.deviceId,
      membershipEpoch: 1,
      rootPublicKey: rootKeys.publicKey,
      recoveryThreshold: this.recoveryConfig.threshold,
      recoveryTotal: this.recoveryConfig.totalShares,
      priorRootHash: null,
      createdAt: now,
      updatedAt: now,
    };

    this.store.saveRoot(rootRecord);
    this.store.upsertDevice({
      deviceId: ownerKeys.deviceId,
      publicKey: ownerKeys.publicKey,
      role: 'owner',
      enrolledAt: now,
      revokedAt: null,
      epochAdded: 1,
    });

    const bootstrapEvent = buildMembershipEvent({
      rootId,
      membershipEpoch: 1,
      operation: 'add',
      deviceId: ownerKeys.deviceId,
      devicePublicKey: ownerKeys.publicKey,
      priorEventHash: null,
      authorizedByDeviceIds: [ownerKeys.deviceId],
      quorumProof: buildQuorumProof([ownerKeys.deviceId], 'add'),
      rootPrivateKey: rootKeys.privateKey,
      occurredAt: now,
    });

    this.store.appendEvent(bootstrapEvent);
  }
}

export function createSovereigntyRootService(options: SovereigntyRootServiceOptions): Promise<SovereigntyRootService> {
  return SovereigntyRootService.initialize(options);
}

export function hashSovereigntyRootAnchor(rootPublicKey: string, membershipEpoch: number): string {
  return createHash('sha256').update(`${rootPublicKey}:${membershipEpoch}`).digest('hex');
}
