import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createMemorySyncSecureStorage,
  MembershipEpochConflictError,
  SovereigntyRootService,
  buildMembershipEvent,
  buildQuorumProof,
  createSyncSecureStorageAdapter,
  generateEd25519KeyMaterial,
  generateRecoveryShares,
  hashRecoverySecret,
  loadRecoveryShare,
  rejectConflictingLowerEpoch,
  sharesToHex,
  splitSecret,
  combineShares,
  verifyRecoveryQuorum,
} from '../src/index.js';
import { openMembershipStore } from '../src/membership/store.js';

describe('@semblance/sync sovereignty root', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  function createHarness() {
    const dataDir = mkdtempSync(join(tmpdir(), 'semblance-sync-'));
    tempDirs.push(dataDir);
    const secureStorage = createMemorySyncSecureStorage();
    return { dataDir, secureStorage };
  }

  it('creates root with monotonic epoch starting at 1', async () => {
    const { dataDir, secureStorage } = createHarness();
    const service = await SovereigntyRootService.initialize({ dataDir, secureStorage });
    const status = await service.getStatus();

    expect(status.membershipEpoch).toBe(1);
    expect(status.activeDeviceCount).toBe(1);
    expect(status.recoveryThreshold).toBe(2);
    expect(status.recoveryTotal).toBe(3);
    service.close();
  });

  it('adds and revokes devices while incrementing epoch', async () => {
    const { dataDir, secureStorage } = createHarness();
    const service = await SovereigntyRootService.initialize({ dataDir, secureStorage });
    const owner = (await service.getStatus()).ownerDeviceId;
    const phoneKeys = generateEd25519KeyMaterial();

    const added = await service.addDevice({
      deviceId: 'device-phone-001',
      devicePublicKey: phoneKeys.publicKey,
      authorizedByDeviceIds: [owner],
    });
    expect(added.membershipEpoch).toBe(2);

    const revoked = await service.revokeDevice({
      deviceId: 'device-phone-001',
      authorizedByDeviceIds: [owner],
    });
    expect(revoked.membershipEpoch).toBe(3);
    expect(revoked.operation).toBe('revoke');

    const status = await service.getStatus();
    expect(status.membershipEpoch).toBe(3);
    expect(status.activeDeviceCount).toBe(1);
    service.close();
  });

  it('rotates root keys and bumps epoch', async () => {
    const { dataDir, secureStorage } = createHarness();
    const service = await SovereigntyRootService.initialize({ dataDir, secureStorage });
    const owner = (await service.getStatus()).ownerDeviceId;
    const before = await service.getStatus();

    const after = await service.rotateRoot([owner]);
    expect(after.membershipEpoch).toBe(before.membershipEpoch + 1);
    expect(after.rootPublicKey).not.toBe(before.rootPublicKey);
    service.close();
  });

  it('transfers owner succession to another active device', async () => {
    const { dataDir, secureStorage } = createHarness();
    const service = await SovereigntyRootService.initialize({ dataDir, secureStorage });
    const owner = (await service.getStatus()).ownerDeviceId;
    const tabletKeys = generateEd25519KeyMaterial();

    await service.addDevice({
      deviceId: 'device-tablet-001',
      devicePublicKey: tabletKeys.publicKey,
      authorizedByDeviceIds: [owner],
    });

    const status = await service.transferOwner('device-tablet-001', [owner, 'device-tablet-001']);
    expect(status.ownerDeviceId).toBe('device-tablet-001');
    expect(status.membershipEpoch).toBe(3);

    const devices = service.listDevices(false);
    expect(devices.find((device) => device.deviceId === owner)?.role).toBe('member');
    expect(devices.find((device) => device.deviceId === 'device-tablet-001')?.role).toBe('owner');
    service.close();
  });

  it('rejects conflicting lower epoch membership events', async () => {
    const { dataDir, secureStorage } = createHarness();
    const service = await SovereigntyRootService.initialize({ dataDir, secureStorage });
    const owner = (await service.getStatus()).ownerDeviceId;
    const phoneKeys = generateEd25519KeyMaterial();
    await service.addDevice({
      deviceId: 'device-phone-001',
      devicePublicKey: phoneKeys.publicKey,
      authorizedByDeviceIds: [owner],
    });

    const store = openMembershipStore(dataDir);
    const root = store.getRoot()!;

    rejectConflictingLowerEpoch(store, root.membershipEpoch + 1);

    const staleEvent = buildMembershipEvent({
      rootId: root.rootId,
      membershipEpoch: 1,
      operation: 'add',
      deviceId: 'device-stale',
      devicePublicKey: generateEd25519KeyMaterial().publicKey,
      priorEventHash: store.getLatestEventHash(),
      authorizedByDeviceIds: [root.ownerDeviceId],
      quorumProof: buildQuorumProof([root.ownerDeviceId], 'add'),
      rootPrivateKey: (await secureStorage.get('sync.root.privateKey'))!,
    });

    expect(() => store.appendEvent(staleEvent)).toThrow(MembershipEpochConflictError);
    store.close();
    service.close();
  });

  it('verifies recovery quorum and executes recovery rotation', async () => {
    const { dataDir, secureStorage } = createHarness();
    const service = await SovereigntyRootService.initialize({
      dataDir,
      secureStorage,
      recovery: { threshold: 2, totalShares: 3 },
    });
    const owner = (await service.getStatus()).ownerDeviceId;
    const secretHex = await secureStorage.get('sync.root.recoverySecret');
    expect(secretHex).toBeTruthy();

    const shares = sharesToHex(generateRecoveryShares(Buffer.from(secretHex!, 'hex'), { threshold: 2, totalShares: 3 }));
    const proof = verifyRecoveryQuorum(shares.slice(0, 2), 2, hashRecoverySecret(Buffer.from(secretHex!, 'hex')));
    expect(proof.shares).toHaveLength(2);

    const shareOne = await loadRecoveryShare(secureStorage, 1);
    const shareTwo = await loadRecoveryShare(secureStorage, 2);
    expect(shareOne).not.toBeNull();
    expect(shareTwo).not.toBeNull();

    const recovered = await service.recoverRoot({
      shares: [shareOne!, shareTwo!],
      authorizedDeviceIds: [owner],
    });
    expect(recovered.proof.reconstructedSecretHash).toBe(proof.reconstructedSecretHash);
    expect(recovered.status.membershipEpoch).toBe(2);
    service.close();
  });

  it('splits and recombines shamir secrets exactly', () => {
    const secret = Buffer.from('semblance-sync-root-secret-bytes!!', 'utf8');
    const shares = splitSecret(secret, 2, 3);
    const reconstructed = combineShares([shares[0]!, shares[2]!]);
    expect(reconstructed.equals(secret)).toBe(true);
  });
});
