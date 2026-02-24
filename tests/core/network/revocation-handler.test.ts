/**
 * Step 28 — RevocationHandler tests.
 * Covers category removal, full revocation, inbound processing, audit trail.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { NetworkConfigStore } from '@semblance/core/network/network-config-store';
import { SharedContextStore } from '@semblance/core/network/shared-context-store';
import { RevocationHandler } from '@semblance/core/network/revocation-handler';
import { AttestationSigner } from '@semblance/core/attestation/attestation-signer';

const SIGNING_KEY = Buffer.from('test-signing-key-32-bytes-long!!');

let db: InstanceType<typeof Database>;
let configStore: NetworkConfigStore;
let sharedContextStore: SharedContextStore;

beforeEach(() => {
  db = new Database(':memory:');
  configStore = new NetworkConfigStore(db as unknown as DatabaseHandle);
  sharedContextStore = new SharedContextStore(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

function createHandler(deviceId = 'device-a') {
  return new RevocationHandler({
    configStore,
    sharedContextStore,
    signer: new AttestationSigner({
      signingKey: SIGNING_KEY,
      deviceIdentity: { id: deviceId, platform: 'desktop' },
    }),
    localDeviceId: deviceId,
  });
}

describe('RevocationHandler (Step 28)', () => {
  it('removes a single category from outbound sharing', () => {
    const rel = configStore.createRelationship({
      localUserId: 'user-a',
      peerId: 'peer-b',
      peerDisplayName: 'Bob',
      initiatedBy: 'local',
      outboundCategories: ['calendar-availability', 'communication-style', 'project-context'],
      inboundCategories: ['topic-expertise'],
    });

    const handler = createHandler();
    const revocation = handler.revokeCategory(rel.id, 'communication-style');

    expect(revocation).not.toBeNull();
    expect(revocation!.revokedCategory).toBe('communication-style');
    expect(revocation!.signature).toBeTruthy();

    const updated = configStore.getRelationship(rel.id)!;
    expect(updated.outboundCategories).toEqual(['calendar-availability', 'project-context']);
    expect(updated.status).toBe('active'); // Still active, just fewer categories
  });

  it('fully revokes a relationship and deletes all cached context', () => {
    const rel = configStore.createRelationship({
      localUserId: 'user-a',
      peerId: 'peer-b',
      peerDisplayName: 'Bob',
      initiatedBy: 'local',
      outboundCategories: ['calendar-availability'],
      inboundCategories: ['project-context'],
    });

    // Store some cached context from this peer
    sharedContextStore.storeContext({
      peerId: 'peer-b',
      category: 'project-context',
      summaryText: '10 docs indexed',
    });
    sharedContextStore.storeContext({
      peerId: 'peer-b',
      category: 'topic-expertise',
      summaryText: 'Expert in TypeScript',
    });

    const handler = createHandler();
    const revocation = handler.revokeRelationship(rel.id);

    expect(revocation).not.toBeNull();
    expect(revocation!.revokedCategory).toBeNull(); // null = full revocation

    // Relationship marked as revoked
    const updated = configStore.getRelationship(rel.id)!;
    expect(updated.status).toBe('revoked');

    // All cached context deleted (hard delete)
    expect(sharedContextStore.getContextFromPeer('peer-b')).toHaveLength(0);
  });

  it('processes inbound revocation by deleting cached context', () => {
    configStore.createRelationship({
      localUserId: 'user-a',
      peerId: 'peer-b',
      peerDisplayName: 'Bob',
      initiatedBy: 'peer',
      inboundCategories: ['calendar-availability', 'communication-style'],
    });

    sharedContextStore.storeContext({
      peerId: 'peer-b',
      category: 'calendar-availability',
      summaryText: '5 events',
    });
    sharedContextStore.storeContext({
      peerId: 'peer-b',
      category: 'communication-style',
      summaryText: 'Formal, direct',
    });

    const handler = createHandler();

    // Peer revokes calendar-availability only
    const result = handler.processInboundRevocation({
      relationshipId: 'some-id',
      fromDeviceId: 'peer-b',
      revokedCategory: 'calendar-availability',
      signature: 'sig',
      createdAt: new Date().toISOString(),
    });

    expect(result).toBe(true);
    expect(sharedContextStore.getContext('peer-b', 'calendar-availability')).toBeNull();
    expect(sharedContextStore.getContext('peer-b', 'communication-style')).not.toBeNull();
  });

  it('signs revocation payloads with attestation', () => {
    const rel = configStore.createRelationship({
      localUserId: 'user-a',
      peerId: 'peer-b',
      peerDisplayName: 'Bob',
      initiatedBy: 'local',
      outboundCategories: ['calendar-availability'],
    });

    const handler = createHandler();
    const revocation = handler.revokeCategory(rel.id, 'calendar-availability');

    expect(revocation).not.toBeNull();
    expect(revocation!.signature).toBeTruthy();
    expect(revocation!.fromDeviceId).toBe('device-a');
    expect(revocation!.createdAt).toBeTruthy();
  });

  it('records revocation events in audit trail', () => {
    const rel = configStore.createRelationship({
      localUserId: 'user-a',
      peerId: 'peer-b',
      peerDisplayName: 'Bob',
      initiatedBy: 'local',
      outboundCategories: ['calendar-availability', 'communication-style'],
    });

    const handler = createHandler();
    handler.revokeCategory(rel.id, 'calendar-availability');
    handler.revokeRelationship(rel.id);

    const events = handler.getRevocationEvents();
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe('category-revoked');
    expect(events[0]!.revokedCategory).toBe('calendar-availability');
    expect(events[1]!.type).toBe('relationship-revoked');
    expect(events[1]!.revokedCategory).toBeNull();
  });

  it('blocks sync after revocation', () => {
    const rel = configStore.createRelationship({
      localUserId: 'user-a',
      peerId: 'peer-b',
      peerDisplayName: 'Bob',
      initiatedBy: 'local',
      outboundCategories: ['calendar-availability'],
    });

    const handler = createHandler();
    expect(handler.isRevoked(rel.id)).toBe(false);

    handler.revokeRelationship(rel.id);
    expect(handler.isRevoked(rel.id)).toBe(true);
  });
});
