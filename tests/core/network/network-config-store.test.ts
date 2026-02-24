/**
 * Step 28 — NetworkConfigStore tests.
 * Covers schema creation, default config, relationship CRUD, offer expiration, sync frequency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { NetworkConfigStore } from '@semblance/core/network/network-config-store';
import type { SharingCategory } from '@semblance/core/network/types';

let db: InstanceType<typeof Database>;
let store: NetworkConfigStore;

beforeEach(() => {
  db = new Database(':memory:');
  store = new NetworkConfigStore(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('NetworkConfigStore (Step 28)', () => {
  it('creates all 4 tables on init', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('network_config');
    expect(tableNames).toContain('sharing_relationships');
    expect(tableNames).toContain('sharing_offers');
    expect(tableNames).toContain('shared_context_cache');
  });

  it('network is disabled by default with 4-hour sync', () => {
    const config = store.getConfig();
    expect(config.enabled).toBe(false);
    expect(config.syncFrequencyHours).toBe(4);
  });

  it('creates and retrieves sharing relationships', () => {
    const categories: SharingCategory[] = ['calendar-availability', 'communication-style'];

    const rel = store.createRelationship({
      localUserId: 'user-1',
      peerId: 'peer-1',
      peerDisplayName: 'Alice',
      initiatedBy: 'local',
      outboundCategories: categories,
      inboundCategories: ['project-context'],
    });

    expect(rel.id).toMatch(/^sr_/);
    expect(rel.status).toBe('active');
    expect(rel.outboundCategories).toEqual(categories);
    expect(rel.inboundCategories).toEqual(['project-context']);
    expect(rel.initiatedBy).toBe('local');

    const fetched = store.getRelationship(rel.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.peerId).toBe('peer-1');
    expect(fetched!.peerDisplayName).toBe('Alice');

    const byPeer = store.getRelationshipByPeer('peer-1');
    expect(byPeer).not.toBeNull();
    expect(byPeer!.id).toBe(rel.id);

    const active = store.getActiveRelationships();
    expect(active).toHaveLength(1);
  });

  it('expires offers past their expiration time', () => {
    const pastTime = new Date(Date.now() - 1000).toISOString();
    const futureTime = new Date(Date.now() + 86400000).toISOString();

    store.createOffer({
      id: 'offer-expired',
      fromDeviceId: 'device-1',
      fromDisplayName: 'Bob',
      offeredCategories: ['calendar-availability'],
      requestedCategories: ['communication-style'],
      expiresAt: pastTime,
      signature: 'sig-1',
      status: 'pending',
      createdAt: new Date(Date.now() - 2000).toISOString(),
    });

    store.createOffer({
      id: 'offer-valid',
      fromDeviceId: 'device-2',
      fromDisplayName: 'Carol',
      offeredCategories: ['project-context'],
      requestedCategories: ['topic-expertise'],
      expiresAt: futureTime,
      signature: 'sig-2',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    const expired = store.expireOffers();
    expect(expired).toBe(1);

    const expiredOffer = store.getOffer('offer-expired');
    expect(expiredOffer!.status).toBe('expired');

    const validOffer = store.getOffer('offer-valid');
    expect(validOffer!.status).toBe('pending');
  });

  it('updates sync frequency and config', () => {
    store.updateConfig({ syncFrequencyHours: 8, enabled: true });
    const config = store.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.syncFrequencyHours).toBe(8);
  });
});
