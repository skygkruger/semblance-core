import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SyncEnvelopeV1 } from '@semblance/protocol';
import {
  SovereigntyRootService,
  SyncEventService,
  SyncRelayClient,
  ComputeMeshRouter,
  OFFLINE_DECRYPTED_DELETION_CAVEAT,
  buildComputeExecutionReceipt,
  assertComputeNotDataAuthoritative,
  createMemorySyncSecureStorage,
  createDeletionPropagationService,
  decryptWithDomainKey,
  enforceDeviceRevocation,
  generateEd25519KeyMaterial,
  getOrCreateDeviceKeys,
  loadEpochKeyForDevice,
  deriveEpochBoundDomainKey,
  getOrCreateDomainMasterKey,
  type SyncRelayExchangeRequest,
  type SyncRelayExchangeResponse,
  type SyncRelayTransport,
  type CiphertextEnvelopeBlob,
  type SyncRelayPushRequest,
  type SyncRelayPushResponse,
  type SyncRelayPullRequest,
  type SyncRelayPullResponse,
  SyncRelayIntegrityError,
  assertNoSubstitution,
  computeBatchMerkleRoot,
  computeDeviceEpochHash,
  computeHeadHash,
  encodeEnvelopeBlob,
  SYNC_RELAY_GENESIS_HEAD,
} from '../../packages/sync/src/index.js';
import { openMembershipStore } from '../../packages/sync/src/membership/store.js';
import { createSovereignNodeClient } from '../../packages/mobile/src/runtime/sovereign-node-client.js';

class MemoryRelayBackend implements SyncRelayTransport {
  private readonly blobs = new Map<string, CiphertextEnvelopeBlob>();
  private headHash = SYNC_RELAY_GENESIS_HEAD;

  async push(request: SyncRelayPushRequest): Promise<SyncRelayPushResponse> {
    if (request.priorHeadHash !== this.headHash) {
      throw new SyncRelayIntegrityError('fork', 'relay_head_fork');
    }
    const rejectedBlobIds: string[] = [];
    const acceptedHashes: string[] = [];
    for (const blob of request.blobs) {
      if (this.blobs.has(blob.blobId)) {
        rejectedBlobIds.push(blob.blobId);
        continue;
      }
      this.blobs.set(blob.blobId, blob);
      acceptedHashes.push(blob.blobHash);
    }
    if (acceptedHashes.length > 0) {
      this.headHash = computeHeadHash(this.headHash, acceptedHashes);
    }
    return { accepted: acceptedHashes.length, headHash: this.headHash, rejectedBlobIds };
  }

  async pull(request: SyncRelayPullRequest): Promise<SyncRelayPullResponse> {
    const sinceLamport = request.sinceLamport ?? 0;
    const blobs = [...this.blobs.values()].filter((blob) => blob.lamportClock > sinceLamport);
    return {
      blobs,
      headHash: this.headHash,
      merkleRoot: computeBatchMerkleRoot(blobs.map((blob) => blob.blobHash)),
    };
  }
}

function createDirectPeerBridge(clients: Map<string, SyncRelayClient>) {
  return {
    async exchange(
      peerDeviceId: string,
      request: SyncRelayExchangeRequest,
    ): Promise<SyncRelayExchangeResponse> {
      const peer = clients.get(peerDeviceId);
      if (!peer) {
        throw new Error(`peer_not_registered:${peerDeviceId}`);
      }
      return peer.handleIncomingExchange(request);
    },
  };
}

describe('Slice 11 exit gate — mobile sync mesh', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('pairs phone and desktop under one Sovereignty Root', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'slice11-pair-'));
    tempDirs.push(dataDir);
    const desktopStorage = createMemorySyncSecureStorage();
    const rootService = await SovereigntyRootService.initialize({ dataDir, secureStorage: desktopStorage });
    const status = await rootService.getStatus();
    const phoneKeys = generateEd25519KeyMaterial();

    await rootService.addDevice({
      deviceId: 'device-phone-001',
      devicePublicKey: phoneKeys.publicKey,
      authorizedByDeviceIds: [status.ownerDeviceId],
    });

    const devices = rootService.listDevices(false);
    expect(devices).toHaveLength(2);
    expect(status.rootId.length).toBeGreaterThan(0);

    rootService.close();
  });

  it('syncs known events E2EE, revokes phone, and phone cannot decrypt future events', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'slice11-revoke-'));
    tempDirs.push(dataDir);
    const desktopStorage = createMemorySyncSecureStorage();
    const phoneStorage = createMemorySyncSecureStorage();

    const rootService = await SovereigntyRootService.initialize({ dataDir, secureStorage: desktopStorage });
    const status = await rootService.getStatus();
    const phoneKeys = generateEd25519KeyMaterial();

    await rootService.addDevice({
      deviceId: 'device-phone-001',
      devicePublicKey: phoneKeys.publicKey,
      authorizedByDeviceIds: [status.ownerDeviceId],
    });

    const membershipStore = openMembershipStore(dataDir);
    const eventService = await SyncEventService.initialize({
      dataDir,
      secureStorage: desktopStorage,
      membershipStore,
    });

    const domainId = 'documents';
    const beforeRevoke = await eventService.pushEvents({
      domainId,
      events: [{ eventType: 'document.upsert', payload: { id: 'doc-known', title: 'Known Event' } }],
    });
    expect(beforeRevoke.pushed).toHaveLength(1);

    const root = membershipStore.getRoot()!;
    const rootPrivateKey = (await desktopStorage.get('sync.root.privateKey'))!;
    const revokeResult = await enforceDeviceRevocation({
      store: membershipStore,
      secureStorage: desktopStorage,
      rootId: root.rootId,
      rootPrivateKey,
      input: {
        deviceId: 'device-phone-001',
        authorizedByDeviceIds: [status.ownerDeviceId],
      },
      domainIds: [domainId],
    });

    const afterRevoke = await eventService.pushEvents({
      domainId,
      events: [{ eventType: 'document.upsert', payload: { id: 'doc-future', title: 'Future Event' } }],
    });
    const futureCiphertext = (afterRevoke.pushed[0]!.payload as { ciphertext: string }).ciphertext;

    const phoneMaster = await getOrCreateDomainMasterKey(phoneStorage, domainId);
    const phoneEpochKey = deriveEpochBoundDomainKey(phoneMaster, revokeResult.membershipEpoch);
    expect(() => decryptWithDomainKey(futureCiphertext, phoneEpochKey)).toThrow();

    const desktopKey = await loadEpochKeyForDevice(
      desktopStorage,
      domainId,
      revokeResult.membershipEpoch,
      false,
    );
    expect(decryptWithDomainKey(futureCiphertext, desktopKey)).toContain('Future Event');

    rootService.close();
    eventService.close();
    membershipStore.close();
  });

  it('converges direct and relay sync paths', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'slice11-converge-'));
    tempDirs.push(dataDir);
    const desktopStorage = createMemorySyncSecureStorage();
    const rootService = await SovereigntyRootService.initialize({ dataDir, secureStorage: desktopStorage });
    const status = await rootService.getStatus();
    const phoneKeys = generateEd25519KeyMaterial();

    await rootService.addDevice({
      deviceId: 'device-phone-001',
      devicePublicKey: phoneKeys.publicKey,
      authorizedByDeviceIds: [status.ownerDeviceId],
    });

    const membershipStore = openMembershipStore(dataDir);
    const eventService = await SyncEventService.initialize({
      dataDir,
      secureStorage: desktopStorage,
      membershipStore,
    });

    const sharedRelay = new MemoryRelayBackend();
    const clients = new Map<string, SyncRelayClient>();
    const desktopClient = new SyncRelayClient({
      rootId: status.rootId,
      deviceId: status.ownerDeviceId,
      membershipEpoch: status.membershipEpoch,
      relayTransport: sharedRelay,
      directPeerTransport: createDirectPeerBridge(clients),
    });
    const phoneClient = new SyncRelayClient({
      rootId: status.rootId,
      deviceId: 'device-phone-001',
      membershipEpoch: status.membershipEpoch,
      relayTransport: sharedRelay,
      directPeerTransport: createDirectPeerBridge(clients),
    });
    clients.set(status.ownerDeviceId, desktopClient);
    clients.set('device-phone-001', phoneClient);

    const relayPush = await eventService.pushEvents({
      domainId: 'documents',
      events: [{ eventType: 'document.upsert', payload: { id: 'relay-doc', title: 'Relay' } }],
    });
    await desktopClient.pushViaRelay(relayPush.pushed);
    const relayPull = await phoneClient.pullViaRelay();
    const relayEventId = (relayPush.pushed[0]!.payload as { eventId: string }).eventId;
    expect(
      relayPull.envelopes.map((env) => (env.payload as { eventId: string }).eventId),
    ).toContain(relayEventId);

    const directPush = await eventService.pushEvents({
      domainId: 'documents',
      events: [{ eventType: 'document.upsert', payload: { id: 'direct-doc', title: 'Direct' } }],
    });
    const directSync = await phoneClient.syncViaDirectPeer(status.ownerDeviceId, directPush.pushed);
    const directEventId = (directPush.pushed[0]!.payload as { eventId: string }).eventId;
    expect(
      directSync.envelopes.map((env) => (env.payload as { eventId: string }).eventId),
    ).toContain(directEventId);

    rootService.close();
    eventService.close();
    membershipStore.close();
  });

  it('compute handoff produces proof and compute is not data-authoritative', async () => {
    const router = new ComputeMeshRouter({
      localDeviceId: 'device-phone-001',
      localDeviceType: 'mobile',
      localModelTier: '3B',
      localHealth: {
        reachable: true,
        batteryPercent: 55,
        memoryPressure: 'normal',
        lastSeenAt: new Date().toISOString(),
      },
    });

    router.registerPeer(
      {
        deviceId: 'device-desktop-001',
        deviceType: 'desktop',
        reachable: true,
        modelTier: '7B',
        memoryPressure: 'normal',
        lastSeenAt: new Date().toISOString(),
      },
      {
        deviceId: 'device-desktop-001',
        supportsInference: true,
        supportsEmbedding: true,
        supportsAnalysis: true,
        maxContextTokens: 8192,
      },
    );

    const computePayload = { taskRef: 'document.analyze', inputHash: 'abc123' };
    const decision = router.routeTask({
      taskType: 'analysis',
      complexity: 'heavy',
      computePayload,
    });
    expect(decision.targetDeviceId).toBe('device-desktop-001');

    const keys = generateEd25519KeyMaterial();
    const receipt = buildComputeExecutionReceipt({
      receiptId: 'slice11-receipt-001',
      taskType: 'analysis',
      executedOnDeviceId: decision.targetDeviceId,
      executedOnDeviceType: 'desktop',
      modelId: 'llama-3.1-8b-q4',
      modelProvenance: 'local-ollama',
      computePayload,
      routeReason: decision.reason,
      devicePrivateKey: keys.privateKey,
    });

    expect(receipt.payload.dataAuthoritative).toBe(false);
    expect(receipt.signature.length).toBeGreaterThan(0);
    expect(() => assertComputeNotDataAuthoritative({ sourceData: 'secret' })).toThrow();
  });

  it('states offline-decrypted deletion caveat without false remote-erasure claim', async () => {
    const secureStorage = createMemorySyncSecureStorage();
    const deletionService = createDeletionPropagationService(secureStorage);

    const pending = await deletionService.registerPendingOfflineDeletion({
      tombstoneEventId: 'tombstone-offline-001',
      deviceId: 'device-phone-001',
    });

    expect(pending.remoteErasureClaimed).toBe(false);
    expect(pending.caveat).toBe(OFFLINE_DECRYPTED_DELETION_CAVEAT);
    expect(deletionService.getOfflineDecryptedCaveat()).toContain('cannot be remotely erased');
  });

  it('mobile sovereign node client initializes as a live peer', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'slice11-mobile-peer-'));
    tempDirs.push(dataDir);

    const client = await createSovereignNodeClient({
      dataDir,
      deviceType: 'mobile',
      modelTier: '3B',
    });

    const status = await client.getStatus();
    expect(status.syncReady).toBe(true);
    expect(status.computeReady).toBe(true);
    expect(status.root.membershipEpoch).toBeGreaterThanOrEqual(1);

    const pushed = await client.pushVaultEvents({
      domainId: 'documents',
      events: [{ eventType: 'document.upsert', payload: { id: 'mobile-doc', title: 'Mobile Peer' } }],
    });
    expect(pushed.length).toBe(1);

    const route = client.routeComputeTask({
      taskType: 'inference',
      complexity: 'lightweight',
      computePayload: { taskRef: 'chat.respond', inputHash: 'mobile-hash' },
    });
    expect(route.targetDeviceId.length).toBeGreaterThan(0);

    const receipt = await client.buildExecutionReceipt({
      receiptId: 'mobile-receipt-001',
      taskType: 'inference',
      modelId: 'llama-3.2-3b-q4',
      modelProvenance: 'on-device-mobile',
      computePayload: { taskRef: 'chat.respond' },
      routeReason: route.reason,
    });
    expect(receipt.payload.dataAuthoritative).toBe(false);

    await client.shutdown();
  });
});
