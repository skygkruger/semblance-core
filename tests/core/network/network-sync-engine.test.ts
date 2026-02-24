/**
 * Step 28 — NetworkSyncEngine tests.
 * Covers outbound assembly, inbound storage, isDue check, lastSyncAt update, revocation block.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { NetworkConfigStore } from '@semblance/core/network/network-config-store';
import { SharedContextStore } from '@semblance/core/network/shared-context-store';
import { SharingRelationshipManager } from '@semblance/core/network/sharing-relationship-manager';
import { ContextAssembler } from '@semblance/core/network/context-assembler';
import { RevocationHandler } from '@semblance/core/network/revocation-handler';
import { NetworkSyncEngine } from '@semblance/core/network/network-sync-engine';
import { AttestationSigner } from '@semblance/core/attestation/attestation-signer';

const SIGNING_KEY = Buffer.from('test-signing-key-32-bytes-long!!');

let db: InstanceType<typeof Database>;
let configStore: NetworkConfigStore;
let sharedContextStore: SharedContextStore;
let relationshipManager: SharingRelationshipManager;
let revocationHandler: RevocationHandler;
let syncEngine: NetworkSyncEngine;

beforeEach(() => {
  db = new Database(':memory:');
  configStore = new NetworkConfigStore(db as unknown as DatabaseHandle);
  sharedContextStore = new SharedContextStore(db as unknown as DatabaseHandle);
  relationshipManager = new SharingRelationshipManager(configStore);

  revocationHandler = new RevocationHandler({
    configStore,
    sharedContextStore,
    signer: new AttestationSigner({
      signingKey: SIGNING_KEY,
      deviceIdentity: { id: 'device-a', platform: 'desktop' },
    }),
    localDeviceId: 'device-a',
  });

  // Create assembler with mock calendar indexer
  const assembler = new ContextAssembler({
    calendarIndexer: {
      getUpcomingEvents: () => [
        {
          id: 'id-1', uid: 'uid-1', calendarId: 'cal-1',
          title: 'Meeting', description: '',
          startTime: '2026-02-25T09:00:00Z', endTime: '2026-02-25T10:00:00Z',
          isAllDay: false, location: '', attendees: '[]', organizer: '',
          status: 'confirmed' as const, recurrenceRule: null,
          accountId: 'acc-1', indexedAt: new Date().toISOString(),
        },
      ],
    } as never,
  });

  syncEngine = new NetworkSyncEngine({
    contextAssembler: assembler,
    sharedContextStore,
    relationshipManager,
    configStore,
    revocationHandler,
  });
});

afterEach(() => {
  syncEngine.stopPeriodicSync();
  db.close();
});

describe('NetworkSyncEngine (Step 28)', () => {
  it('assembles outbound context for shared categories', async () => {
    const rel = configStore.createRelationship({
      localUserId: 'user-a',
      peerId: 'peer-b',
      peerDisplayName: 'Bob',
      initiatedBy: 'local',
      outboundCategories: ['calendar-availability'],
      inboundCategories: [],
    });

    const result = await syncEngine.syncWithPeer(rel);
    expect(result).not.toBeNull();
    expect(result!.peerId).toBe('peer-b');
    expect(result!.outboundCategories).toBe(1);
  });

  it('stores received inbound context', () => {
    configStore.createRelationship({
      localUserId: 'user-a',
      peerId: 'peer-b',
      peerDisplayName: 'Bob',
      initiatedBy: 'peer',
      outboundCategories: [],
      inboundCategories: ['project-context', 'communication-style'],
    });

    const stored = syncEngine.storeReceivedContext('peer-b', [
      {
        category: 'project-context',
        summaryText: '15 documents indexed',
        structuredData: { totalDocuments: 15 },
      },
      {
        category: 'communication-style',
        summaryText: 'Casual, warm',
      },
      {
        category: 'calendar-availability', // Not authorized — should be skipped
        summaryText: 'Very busy',
      },
    ]);

    expect(stored).toBe(2); // Only 2 authorized categories stored
    expect(sharedContextStore.getContext('peer-b', 'project-context')).not.toBeNull();
    expect(sharedContextStore.getContext('peer-b', 'communication-style')).not.toBeNull();
    expect(sharedContextStore.getContext('peer-b', 'calendar-availability')).toBeNull();
  });

  it('skips sync for relationships that are not due', async () => {
    configStore.updateConfig({ enabled: true, syncFrequencyHours: 4 });

    const rel = configStore.createRelationship({
      localUserId: 'user-a',
      peerId: 'peer-b',
      peerDisplayName: 'Bob',
      initiatedBy: 'local',
      outboundCategories: ['calendar-availability'],
    });

    // Sync once
    await syncEngine.syncWithPeer(rel);

    // Run scheduled sync — should skip since we just synced
    const results = await syncEngine.runScheduledSync();
    expect(results).toHaveLength(0);
  });

  it('updates lastSyncAt on successful sync', async () => {
    const rel = configStore.createRelationship({
      localUserId: 'user-a',
      peerId: 'peer-b',
      peerDisplayName: 'Bob',
      initiatedBy: 'local',
      outboundCategories: ['calendar-availability'],
    });

    expect(rel.lastSyncAt).toBeNull();

    await syncEngine.syncWithPeer(rel);

    const updated = configStore.getRelationship(rel.id)!;
    expect(updated.lastSyncAt).not.toBeNull();
  });

  it('blocks sync for revoked relationships', async () => {
    const rel = configStore.createRelationship({
      localUserId: 'user-a',
      peerId: 'peer-b',
      peerDisplayName: 'Bob',
      initiatedBy: 'local',
      outboundCategories: ['calendar-availability'],
    });

    revocationHandler.revokeRelationship(rel.id);

    const result = await syncEngine.syncWithPeer(rel);
    expect(result).toBeNull();
  });
});
