import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SyncEnvelopeV1 } from '@semblance/protocol';
import {
  SovereigntyRootService,
  SyncEventService,
  SyncRelayClient,
  SyncRelayIntegrityError,
  assertNoSubstitution,
  computeBatchMerkleRoot,
  computeDeviceEpochHash,
  computeHeadHash,
  createMemorySyncSecureStorage,
  encodeEnvelopeBlob,
  generateEd25519KeyMaterial,
  SYNC_RELAY_GENESIS_HEAD,
  type CiphertextEnvelopeBlob,
  type SyncRelayExchangeRequest,
  type SyncRelayExchangeResponse,
  type SyncRelayPullRequest,
  type SyncRelayPullResponse,
  type SyncRelayPushRequest,
  type SyncRelayPushResponse,
  type SyncRelayTransport,
} from '../src/index.js';
import { openMembershipStore } from '../src/membership/store.js';

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
    return {
      accepted: acceptedHashes.length,
      headHash: this.headHash,
      rejectedBlobIds,
    };
  }

  async pull(request: SyncRelayPullRequest): Promise<SyncRelayPullResponse> {
    const sinceLamport = request.sinceLamport ?? 0;
    const blobs = [...this.blobs.values()].filter((blob) => blob.lamportClock > sinceLamport);
    const blobHashes = blobs.map((blob) => blob.blobHash);
    return {
      blobs,
      headHash: this.headHash,
      merkleRoot: computeBatchMerkleRoot(blobHashes),
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

describe('@semblance/sync relay convergence', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  async function createPairedHarness() {
    const dataDir = mkdtempSync(join(tmpdir(), 'semblance-sync-relay-'));
    tempDirs.push(dataDir);
    const secureStorage = createMemorySyncSecureStorage();
    const rootService = await SovereigntyRootService.initialize({ dataDir, secureStorage });
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
      secureStorage,
      membershipStore,
    });

    return { dataDir, rootService, membershipStore, eventService, status, phoneKeys };
  }

  it('converges encrypted events via relay and direct peer paths', async () => {
    const harness = await createPairedHarness();
    const sharedRelay = new MemoryRelayBackend();
    const clients = new Map<string, SyncRelayClient>();

    const desktopClient = new SyncRelayClient({
      rootId: harness.status.rootId,
      deviceId: harness.status.ownerDeviceId,
      membershipEpoch: harness.status.membershipEpoch,
      relayTransport: sharedRelay,
      directPeerTransport: createDirectPeerBridge(clients),
    });
    const phoneClient = new SyncRelayClient({
      rootId: harness.status.rootId,
      deviceId: 'device-phone-001',
      membershipEpoch: harness.status.membershipEpoch,
      relayTransport: sharedRelay,
      directPeerTransport: createDirectPeerBridge(clients),
    });
    clients.set(harness.status.ownerDeviceId, desktopClient);
    clients.set('device-phone-001', phoneClient);

    const relayPush = await harness.eventService.pushEvents({
      domainId: 'documents',
      events: [{ eventType: 'document.upsert', payload: { id: 'doc-relay-1', title: 'Relay Doc' } }],
    });
    await desktopClient.pushViaRelay(relayPush.pushed);
    const relayPull = await phoneClient.pullViaRelay();
    const relayEventId = (relayPush.pushed[0]!.payload as { eventId: string }).eventId;
    expect(
      relayPull.envelopes.map((envelope) => (envelope.payload as { eventId: string }).eventId),
    ).toContain(relayEventId);

    const directPush = await harness.eventService.pushEvents({
      domainId: 'documents',
      events: [{ eventType: 'document.upsert', payload: { id: 'doc-direct-1', title: 'Direct Doc' } }],
    });
    const directSync = await phoneClient.syncViaDirectPeer(
      harness.status.ownerDeviceId,
      directPush.pushed,
    );
    const directEventId = (directPush.pushed[0]!.payload as { eventId: string }).eventId;
    expect(
      directSync.envelopes.map((envelope) => (envelope.payload as { eventId: string }).eventId),
    ).toContain(relayEventId);

    const relayBlob = encodeEnvelopeBlob(
      relayPush.pushed[0]!,
      computeDeviceEpochHash(
        harness.status.rootId,
        harness.status.membershipEpoch,
        harness.status.ownerDeviceId,
      ),
    );
    const directBlob = encodeEnvelopeBlob(
      directPush.pushed[0]!,
      computeDeviceEpochHash(
        harness.status.rootId,
        harness.status.membershipEpoch,
        'device-phone-001',
      ),
    );

    expect(phoneClient.getState().seenBlobIds.has(relayBlob.blobId)).toBe(true);
    expect(desktopClient.getState().seenBlobIds.has(directBlob.blobId)).toBe(true);
    expect(directSync.pulledBlobIds.length).toBeGreaterThan(0);
    expect(relayPull.pulledBlobIds.length).toBeGreaterThan(0);
    expect(directEventId).not.toBe(relayEventId);

    harness.rootService.close();
    harness.eventService.close();
    harness.membershipStore.close();
  });

  it('detects substitution, replay, and fork attacks', async () => {
    const harness = await createPairedHarness();
    const relay = new MemoryRelayBackend();
    const client = new SyncRelayClient({
      rootId: harness.status.rootId,
      deviceId: harness.status.ownerDeviceId,
      membershipEpoch: harness.status.membershipEpoch,
      relayTransport: relay,
      directPeerTransport: createDirectPeerBridge(new Map()),
    });

    const push = await harness.eventService.pushEvents({
      domainId: 'documents',
      events: [{ eventType: 'document.upsert', payload: { id: 'doc-attack', title: 'Attack' } }],
    });
    const deviceEpochHash = computeDeviceEpochHash(
      harness.status.rootId,
      harness.status.membershipEpoch,
      harness.status.ownerDeviceId,
    );
    const blob = encodeEnvelopeBlob(push.pushed[0] as SyncEnvelopeV1, deviceEpochHash);

    expect(() =>
      assertNoSubstitution({
        ...blob,
        blobHash: 'f'.repeat(64),
      }),
    ).toThrow(SyncRelayIntegrityError);

    await client.pushViaRelay(push.pushed);
    await expect(client.pushViaRelay(push.pushed)).rejects.toThrow(SyncRelayIntegrityError);

    const forkClient = new SyncRelayClient({
      rootId: harness.status.rootId,
      deviceId: harness.status.ownerDeviceId,
      membershipEpoch: harness.status.membershipEpoch,
      relayTransport: relay,
      directPeerTransport: createDirectPeerBridge(new Map()),
    });
    await expect(forkClient.pushViaRelay(push.pushed)).rejects.toThrow(SyncRelayIntegrityError);

    harness.rootService.close();
    harness.eventService.close();
    harness.membershipStore.close();
  });
});
