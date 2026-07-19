import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SovereigntyRootService,
  SyncEventService,
  createMemorySyncSecureStorage,
  decryptWithDomainKey,
  encryptWithDomainKey,
  enforceDeviceRevocation,
  generateEd25519KeyMaterial,
  loadArchivedDomainMasterKey,
  loadEpochKeyForDevice,
  openMembershipStore,
  startOrResumeRekey,
} from '../src/index.js';
import { deriveEpochBoundDomainKey, getOrCreateDomainMasterKey } from '../src/keys/domain-keys.js';

describe('@semblance/sync revocation and rekey', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  async function createPairedDevices() {
    const dataDir = mkdtempSync(join(tmpdir(), 'semblance-sync-revoke-'));
    tempDirs.push(dataDir);
    const desktopStorage = createMemorySyncSecureStorage();
    const phoneStorage = createMemorySyncSecureStorage();

    const rootService = await SovereigntyRootService.initialize({
      dataDir,
      secureStorage: desktopStorage,
    });
    const status = await rootService.getStatus();
    const phoneKeys = generateEd25519KeyMaterial();

    await rootService.addDevice({
      deviceId: 'device-phone-001',
      devicePublicKey: phoneKeys.publicKey,
      authorizedByDeviceIds: [status.ownerDeviceId],
    });

    const membershipStore = openMembershipStore(dataDir);
    const desktopEventService = await SyncEventService.initialize({
      dataDir,
      secureStorage: desktopStorage,
      membershipStore,
    });

    return {
      dataDir,
      rootService,
      membershipStore,
      desktopEventService,
      desktopStorage,
      phoneStorage,
      status,
      phoneKeys,
    };
  }

  it('rotates domain keys on revoke and phone cannot decrypt future events', async () => {
    const harness = await createPairedDevices();
    const domainId = 'documents';

    const beforeRevoke = await harness.desktopEventService.pushEvents({
      domainId,
      events: [{ eventType: 'document.upsert', payload: { id: 'doc-1', title: 'Before Revoke' } }],
    });
    expect(beforeRevoke.pushed).toHaveLength(1);

    const root = harness.membershipStore.getRoot()!;
    const rootPrivateKey = (await harness.desktopStorage.get('sync.root.privateKey'))!;

    const revokeResult = await enforceDeviceRevocation({
      store: harness.membershipStore,
      secureStorage: harness.desktopStorage,
      rootId: root.rootId,
      rootPrivateKey,
      input: {
        deviceId: 'device-phone-001',
        authorizedByDeviceIds: [harness.status.ownerDeviceId],
      },
      domainIds: [domainId],
    });
    expect(revokeResult.domainKeysRotated).toBe(true);
    expect(revokeResult.rekeyCheckpointId.length).toBeGreaterThan(0);

    const afterRevoke = await harness.desktopEventService.pushEvents({
      domainId,
      events: [{ eventType: 'document.upsert', payload: { id: 'doc-2', title: 'After Revoke' } }],
    });
    const futureEnvelope = afterRevoke.pushed[0]!.payload as { ciphertext: string; membershipEpoch: number };

    const phoneMasterBeforeRevoke = await loadArchivedDomainMasterKey(
      harness.phoneStorage,
      domainId,
      revokeResult.membershipEpoch - 1,
    );
    expect(phoneMasterBeforeRevoke).toBeNull();

    const phoneLegacyMaster = await getOrCreateDomainMasterKey(harness.phoneStorage, domainId);
    const phoneLegacyKey = deriveEpochBoundDomainKey(phoneLegacyMaster, revokeResult.membershipEpoch);
    expect(() => decryptWithDomainKey(futureEnvelope.ciphertext, phoneLegacyKey)).toThrow();

    const desktopFutureKey = await loadEpochKeyForDevice(
      harness.desktopStorage,
      domainId,
      futureEnvelope.membershipEpoch,
      false,
    );
    const decrypted = decryptWithDomainKey(futureEnvelope.ciphertext, desktopFutureKey);
    expect(decrypted).toContain('After Revoke');

    harness.rootService.close();
    harness.desktopEventService.close();
    harness.membershipStore.close();
  });

  it('resumes rekey checkpoints without reusing keys', async () => {
    const secureStorage = createMemorySyncSecureStorage();
    const domainId = 'vault';
    const membershipEpoch = 3;

    const first = await startOrResumeRekey({
      secureStorage,
      domainId,
      membershipEpoch,
      revokedDeviceId: 'device-phone-001',
      eventIds: ['evt-1', 'evt-2'],
    });
    expect(first.keysRotated).toBe(true);
    expect(first.checkpoint.processedCount).toBe(2);
    expect(first.checkpoint.completed).toBe(false);

    const second = await startOrResumeRekey({
      secureStorage,
      domainId,
      membershipEpoch,
      revokedDeviceId: 'device-phone-001',
      checkpointId: first.checkpoint.checkpointId,
      eventIds: ['evt-3'],
    });
    expect(second.resumed).toBe(true);
    expect(second.keysRotated).toBe(false);
    expect(second.checkpoint.newMasterKeyFingerprint).toBe(first.checkpoint.newMasterKeyFingerprint);
    expect(second.checkpoint.priorMasterKeyFingerprint).toBe(first.checkpoint.priorMasterKeyFingerprint);
    expect(second.checkpoint.processedCount).toBe(3);

    const third = await startOrResumeRekey({
      secureStorage,
      domainId,
      membershipEpoch,
      revokedDeviceId: 'device-phone-001',
      checkpointId: first.checkpoint.checkpointId,
      eventIds: [],
    });
    expect(third.checkpoint.completed).toBe(true);
  });

  it('rejects post-revocation events from revoked device', async () => {
    const harness = await createPairedDevices();
    const root = harness.membershipStore.getRoot()!;
    const rootPrivateKey = (await harness.desktopStorage.get('sync.root.privateKey'))!;

    await enforceDeviceRevocation({
      store: harness.membershipStore,
      secureStorage: harness.desktopStorage,
      rootId: root.rootId,
      rootPrivateKey,
      input: {
        deviceId: 'device-phone-001',
        authorizedByDeviceIds: [harness.status.ownerDeviceId],
      },
    });

    const pushBeforeRevokeEpoch = await harness.desktopEventService.pushEvents({
      domainId: 'documents',
      events: [{ eventType: 'document.upsert', payload: { id: 'doc-replay', title: 'Replay' } }],
    });

    const replayEnvelope = {
      ...pushBeforeRevokeEpoch.pushed[0]!,
      payload: {
        ...(pushBeforeRevokeEpoch.pushed[0]!.payload as Record<string, unknown>),
        deviceId: 'device-phone-001',
      },
    };

    await expect(
      harness.desktopEventService.pullMerge({ incomingEnvelopes: [replayEnvelope] }),
    ).rejects.toThrow(/revoked/i);

    harness.rootService.close();
    harness.desktopEventService.close();
    harness.membershipStore.close();
  });
});
