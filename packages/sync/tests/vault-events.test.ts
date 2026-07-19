import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SovereigntyRootService,
  appendSignedAuditEntry,
  createMemorySyncSecureStorage,
  createSignedCheckpoint,
  createSignedEncryptedVaultEvent,
  decryptAndVerifyVaultEvent,
  generateEd25519KeyMaterial,
  getAuditGenesisHash,
  getOrCreateDeviceKeys,
  mergeVaultEvents,
  rotateDomainKeyForEpoch,
  verifyAuditChain,
  verifyCheckpoint,
  type MergeableEvent,
} from '../src/index.js';
import { openMembershipStore } from '../src/membership/store.js';
import { SyncEventService } from '../src/events/sync-event-service.js';
import { loadEpochBoundDomainKey } from '../src/keys/domain-keys.js';

describe('@semblance/sync encrypted vault events', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  function createHarness() {
    const dataDir = mkdtempSync(join(tmpdir(), 'semblance-sync-events-'));
    tempDirs.push(dataDir);
    const secureStorage = createMemorySyncSecureStorage();
    return { dataDir, secureStorage };
  }

  async function createRootWithPhone() {
    const { dataDir, secureStorage } = createHarness();
    const rootService = await SovereigntyRootService.initialize({ dataDir, secureStorage });
    const owner = (await rootService.getStatus()).ownerDeviceId;
    const phoneKeys = generateEd25519KeyMaterial();

    await rootService.addDevice({
      deviceId: 'device-phone-001',
      devicePublicKey: phoneKeys.publicKey,
      authorizedByDeviceIds: [owner],
    });

    const membershipStore = openMembershipStore(dataDir);
    const eventService = await SyncEventService.initialize({
      dataDir,
      secureStorage,
      membershipStore,
    });

    return { dataDir, secureStorage, rootService, membershipStore, eventService, phoneKeys, owner };
  }

  it('encrypts and decrypts vault event envelopes roundtrip', async () => {
    const { dataDir, secureStorage } = createHarness();
    const rootService = await SovereigntyRootService.initialize({ dataDir, secureStorage });
    const status = await rootService.getStatus();
    const ownerDevice = rootService.listDevices(false)[0]!;
    const ownerKeys = await getOrCreateDeviceKeys(secureStorage, ownerDevice.deviceId);

    const membershipStore = openMembershipStore(dataDir);
    const devicePublicKeys = new Map(
      membershipStore.listDevices(false).map((d) => [d.deviceId, d.publicKey]),
    );

    await rotateDomainKeyForEpoch(secureStorage, 'documents', status.membershipEpoch);

    const envelope = await createSignedEncryptedVaultEvent({
      deviceId: ownerDevice.deviceId,
      devicePrivateKey: ownerKeys.privateKey,
      membershipEpoch: status.membershipEpoch,
      domainId: 'documents',
      eventType: 'document.upsert',
      payload: { id: 'doc-1', title: 'Test' },
      lamportClock: 1,
      vectorClock: { [ownerDevice.deviceId]: 1 },
      secureStorage,
    });

    const plaintext = await decryptAndVerifyVaultEvent({
      envelope: envelope.payload,
      devicePublicKeys,
      secureStorage,
    });

    expect(plaintext.eventType).toBe('document.upsert');
    expect(plaintext.payload).toEqual({ id: 'doc-1', title: 'Test' });
    rootService.close();
    membershipStore.close();
  });

  it('performs causal merge accepting new events', async () => {
    const local: MergeableEvent[] = [];
    const incoming: MergeableEvent[] = [
      {
        eventId: 'evt-a',
        domainId: 'documents',
        deviceId: 'device-a',
        membershipEpoch: 1,
        lamportClock: 1,
        vectorClock: { 'device-a': 1 },
        causalParentIds: [],
        plaintext: { eventType: 'doc.create', payload: { id: '1' }, occurredAt: '2026-01-01T00:00:00Z' },
      },
    ];

    const result = mergeVaultEvents({ localEvents: local, incomingEvents: incoming });
    expect(result.appliedEventIds).toEqual(['evt-a']);
    expect(result.conflicts).toHaveLength(0);
    expect(result.merged).toHaveLength(1);
  });

  it('preserves concurrent corrections with conflict markers', async () => {
    const local: MergeableEvent[] = [
      {
        eventId: 'evt-local',
        domainId: 'documents',
        deviceId: 'device-desktop',
        membershipEpoch: 1,
        lamportClock: 2,
        vectorClock: { 'device-desktop': 2, 'device-phone': 1 },
        causalParentIds: [],
        plaintext: { eventType: 'doc.update', payload: { title: 'Local' }, occurredAt: '2026-01-01T00:00:00Z' },
      },
    ];

    const incoming: MergeableEvent[] = [
      {
        eventId: 'evt-remote',
        domainId: 'documents',
        deviceId: 'device-phone',
        membershipEpoch: 1,
        lamportClock: 2,
        vectorClock: { 'device-desktop': 1, 'device-phone': 2 },
        causalParentIds: [],
        plaintext: { eventType: 'doc.update', payload: { title: 'Remote' }, occurredAt: '2026-01-01T00:00:01Z' },
      },
    ];

    const result = mergeVaultEvents({ localEvents: local, incomingEvents: incoming });
    expect(result.appliedEventIds).toContain('evt-remote');
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.eventIds).toContain('evt-local');
    expect(result.conflicts[0]!.eventIds).toContain('evt-remote');

    const localMerged = result.merged.find((event) => event.eventId === 'evt-local');
    const remoteMerged = result.merged.find((event) => event.eventId === 'evt-remote');
    expect(localMerged?.conflictGroupId).toBeTruthy();
    expect(remoteMerged?.conflictGroupId).toBe(localMerged?.conflictGroupId);
    expect(localMerged?.isConflictDuplicate).toBe(true);
    expect(remoteMerged?.isConflictDuplicate).toBe(true);
  });

  it('verifies signed audit chain and checkpoint', async () => {
    const deviceKeys = generateEd25519KeyMaterial();
    const entry1 = appendSignedAuditEntry({
      sequence: 1,
      operation: 'push',
      eventIds: ['evt-1'],
      priorChainHash: getAuditGenesisHash(),
      devicePrivateKey: deviceKeys.privateKey,
    });
    const entry2 = appendSignedAuditEntry({
      sequence: 2,
      operation: 'merge',
      eventIds: ['evt-2'],
      priorChainHash: entry1.chainHash,
      devicePrivateKey: deviceKeys.privateKey,
    });

    expect(verifyAuditChain([entry1, entry2], deviceKeys.publicKey)).toBe(true);

    const checkpoint = createSignedCheckpoint({
      deviceId: 'device-test',
      auditChainHash: entry2.chainHash,
      eventCount: 2,
      membershipEpoch: 1,
      devicePrivateKey: deviceKeys.privateKey,
    });

    expect(verifyCheckpoint(checkpoint, deviceKeys.publicKey)).toBe(true);
  });

  it('rejects decryption with rotated domain key from prior epoch', async () => {
    const { dataDir, secureStorage } = createHarness();
    const rootService = await SovereigntyRootService.initialize({ dataDir, secureStorage });
    const status = await rootService.getStatus();
    const ownerDevice = rootService.listDevices(false)[0]!;
    const ownerKeys = generateEd25519KeyMaterial();

    const membershipStore = openMembershipStore(dataDir);
    const devicePublicKeys = new Map([[ownerDevice.deviceId, ownerKeys.publicKey]]);

    const oldEpoch = status.membershipEpoch;
    const newEpoch = oldEpoch + 1;

    const envelope = await createSignedEncryptedVaultEvent({
      deviceId: ownerDevice.deviceId,
      devicePrivateKey: ownerKeys.privateKey,
      membershipEpoch: oldEpoch,
      domainId: 'documents',
      eventType: 'doc.secret',
      payload: { secret: 'old-epoch-data' },
      lamportClock: 1,
      vectorClock: { [ownerDevice.deviceId]: 1 },
      secureStorage,
    });

    await rotateDomainKeyForEpoch(secureStorage, 'documents', newEpoch);

    await expect(
      decryptAndVerifyVaultEvent({
        envelope: envelope.payload,
        devicePublicKeys,
        secureStorage,
        minMembershipEpoch: newEpoch,
      }),
    ).rejects.toThrow(/revoked epoch/);

    const oldKey = await loadEpochBoundDomainKey(secureStorage, 'documents', oldEpoch);
    const newKey = await loadEpochBoundDomainKey(secureStorage, 'documents', newEpoch);
    expect(oldKey.equals(newKey)).toBe(false);

    rootService.close();
    membershipStore.close();
  });

  it('push and pull_merge through SyncEventService', async () => {
    const { eventService, secureStorage, rootService, membershipStore } = await createRootWithPhone();

    const pushResult = await eventService.pushEvents({
      domainId: 'documents',
      events: [{ eventType: 'doc.create', payload: { id: 'sync-test-1' } }],
    });

    expect(pushResult.pushed).toHaveLength(1);
    expect(pushResult.pushed[0]!.envelopeKind).toBe('encrypted_event');

    const mergeResult = await eventService.pullMerge({
      incomingEnvelopes: pushResult.pushed,
      createCheckpoint: true,
    });

    expect(mergeResult.checkpoint).not.toBeNull();
    expect(eventService.verifyLatestCheckpoint()).toBe(true);

    rootService.close();
    eventService.close();
    membershipStore.close();
    void secureStorage;
  });
});
