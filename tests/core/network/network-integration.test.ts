/**
 * Step 28 — Semblance Network Integration tests.
 * End-to-end flow tests wiring all components together.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { NetworkConfigStore } from '@semblance/core/network/network-config-store';
import { SharedContextStore } from '@semblance/core/network/shared-context-store';
import { SharingOfferHandler } from '@semblance/core/network/sharing-offer-handler';
import { RevocationHandler } from '@semblance/core/network/revocation-handler';
import { SharingRelationshipManager } from '@semblance/core/network/sharing-relationship-manager';
import { ContextAssembler } from '@semblance/core/network/context-assembler';
import { NetworkSyncEngine } from '@semblance/core/network/network-sync-engine';
import { PeerDiscovery } from '@semblance/core/network/peer-discovery';
import { AttestationSigner } from '@semblance/core/attestation/attestation-signer';
import { AttestationVerifier } from '@semblance/core/attestation/attestation-verifier';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { ActionType } from '@semblance/core/types/ipc';

const SIGNING_KEY = Buffer.from('test-signing-key-32-bytes-long!!');

function makeLicenseKey(tier: string): string {
  const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const payload = JSON.stringify({ tier, exp: futureDate });
  const encoded = Buffer.from(payload).toString('base64');
  return `sem_header.${encoded}.signature`;
}

let dbA: InstanceType<typeof Database>;
let dbB: InstanceType<typeof Database>;

beforeEach(() => {
  dbA = new Database(':memory:');
  dbB = new Database(':memory:');
});

afterEach(() => {
  dbA.close();
  dbB.close();
});

function createInstance(db: InstanceType<typeof Database>, deviceId: string, displayName: string) {
  const dbHandle = db as unknown as DatabaseHandle;
  const configStore = new NetworkConfigStore(dbHandle);
  const sharedContextStore = new SharedContextStore(dbHandle);
  const premiumGate = new PremiumGate(dbHandle);
  premiumGate.activateLicense(makeLicenseKey('digital-representative'));

  const signer = new AttestationSigner({
    signingKey: SIGNING_KEY,
    deviceIdentity: { id: deviceId, platform: 'desktop' },
  });

  const offerHandler = new SharingOfferHandler({
    configStore,
    signer,
    verifier: new AttestationVerifier(),
    premiumGate,
    localDeviceId: deviceId,
    localDisplayName: displayName,
    signingKey: SIGNING_KEY,
  });

  const revocationHandler = new RevocationHandler({
    configStore,
    sharedContextStore,
    signer,
    localDeviceId: deviceId,
  });

  const relationshipManager = new SharingRelationshipManager(configStore);

  const assembler = new ContextAssembler({
    calendarIndexer: {
      getUpcomingEvents: () => [{
        id: `id-${deviceId}`, uid: `uid-${deviceId}`, calendarId: 'cal-1',
        title: 'Event', description: '', startTime: '2026-02-25T09:00:00Z',
        endTime: '2026-02-25T10:00:00Z', isAllDay: false, location: '',
        attendees: '[]', organizer: '', status: 'confirmed' as const,
        recurrenceRule: null, accountId: 'acc-1', indexedAt: new Date().toISOString(),
      }],
    } as never,
  });

  const syncEngine = new NetworkSyncEngine({
    contextAssembler: assembler,
    sharedContextStore,
    relationshipManager,
    configStore,
    revocationHandler,
  });

  return {
    configStore,
    sharedContextStore,
    premiumGate,
    offerHandler,
    revocationHandler,
    relationshipManager,
    syncEngine,
  };
}

describe('Semblance Network Integration (Step 28)', () => {
  it('full flow: discover → offer → accept → sync → verify', async () => {
    const alice = createInstance(dbA, 'device-a', 'Alice');
    const bob = createInstance(dbB, 'device-b', 'Bob');

    // 1. Alice discovers Bob (simulated via PeerDiscovery)
    const aliceDiscovery = new PeerDiscovery({ localDeviceId: 'device-a' });
    aliceDiscovery.onPeerDiscovered({
      deviceId: 'device-b',
      displayName: 'Bob',
      platform: 'desktop',
      ipAddress: '192.168.1.101',
      port: 7890,
      discoveredAt: new Date().toISOString(),
    });
    expect(aliceDiscovery.getDiscoveredPeers()).toHaveLength(1);

    // 2. Alice creates offer
    const offer = alice.offerHandler.createOffer({
      offeredCategories: ['calendar-availability'],
      requestedCategories: ['communication-style'],
    })!;
    expect(offer).not.toBeNull();
    expect(offer.signature).toBeTruthy();

    // 3. Bob receives and accepts offer
    const received = bob.offerHandler.receiveOffer(offer, SIGNING_KEY);
    expect(received).toBe(true);

    const acceptance = bob.offerHandler.acceptOffer(offer.id, {
      acceptedInboundCategories: ['calendar-availability'],
      reciprocalOutboundCategories: ['communication-style'],
    });
    expect(acceptance).not.toBeNull();
    expect(acceptance!.relationship.status).toBe('active');

    // 4. Alice processes acceptance
    const aliceRel = alice.offerHandler.processAcceptance(acceptance!.acceptance);
    expect(aliceRel).not.toBeNull();

    // 5. Sync: Alice sends context to Bob
    const syncResult = await alice.syncEngine.syncWithPeer(aliceRel!);
    expect(syncResult).not.toBeNull();
    expect(syncResult!.outboundCategories).toBe(1);

    // 6. Bob stores received context
    const stored = bob.syncEngine.storeReceivedContext('device-a', [
      { category: 'calendar-availability', summaryText: '1 event this week' },
    ]);
    expect(stored).toBe(1);

    const cached = bob.sharedContextStore.getContext('device-a', 'calendar-availability');
    expect(cached).not.toBeNull();
    expect(cached!.summaryText).toBe('1 event this week');
  });

  it('establish → revoke → verify cached data deleted', async () => {
    const alice = createInstance(dbA, 'device-a', 'Alice');
    const bob = createInstance(dbB, 'device-b', 'Bob');

    // Establish relationship (shortcut — directly create)
    const aliceRel = alice.configStore.createRelationship({
      localUserId: 'device-a',
      peerId: 'device-b',
      peerDisplayName: 'Bob',
      initiatedBy: 'local',
      outboundCategories: ['calendar-availability'],
      inboundCategories: ['communication-style'],
    });

    bob.configStore.createRelationship({
      localUserId: 'device-b',
      peerId: 'device-a',
      peerDisplayName: 'Alice',
      initiatedBy: 'peer',
      outboundCategories: ['communication-style'],
      inboundCategories: ['calendar-availability'],
    });

    // Store some context
    bob.sharedContextStore.storeContext({
      peerId: 'device-a',
      category: 'calendar-availability',
      summaryText: '3 events',
    });
    expect(bob.sharedContextStore.getContext('device-a', 'calendar-availability')).not.toBeNull();

    // Alice revokes
    const revocation = alice.revocationHandler.revokeRelationship(aliceRel.id);
    expect(revocation).not.toBeNull();

    // Bob processes inbound revocation
    const processed = bob.revocationHandler.processInboundRevocation(revocation!);
    expect(processed).toBe(true);

    // Cached data is gone
    expect(bob.sharedContextStore.getContext('device-a', 'calendar-availability')).toBeNull();
    expect(bob.sharedContextStore.getContextFromPeer('device-a')).toHaveLength(0);
  });

  it('all events recorded in audit trail', () => {
    const alice = createInstance(dbA, 'device-a', 'Alice');

    const rel = alice.configStore.createRelationship({
      localUserId: 'device-a',
      peerId: 'device-b',
      peerDisplayName: 'Bob',
      initiatedBy: 'local',
      outboundCategories: ['calendar-availability', 'communication-style'],
    });

    alice.revocationHandler.revokeCategory(rel.id, 'calendar-availability');
    alice.revocationHandler.revokeRelationship(rel.id);

    const events = alice.revocationHandler.getRevocationEvents();
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe('category-revoked');
    expect(events[0]!.peerId).toBe('device-b');
    expect(events[1]!.type).toBe('relationship-revoked');
  });

  it('verifies correct IPC action types exist', () => {
    // Validate all 6 network action types parse correctly
    const networkActions = [
      'network.startDiscovery',
      'network.stopDiscovery',
      'network.sendOffer',
      'network.sendAcceptance',
      'network.sendRevocation',
      'network.syncContext',
    ];

    for (const action of networkActions) {
      const result = ActionType.safeParse(action);
      expect(result.success, `ActionType '${action}' should be valid`).toBe(true);
    }
  });
});
