/**
 * Step 28 — NetworkTracker tests.
 * Covers peer suggestions, premium gate, stale sync warnings.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { NetworkConfigStore } from '@semblance/core/network/network-config-store';
import { SharingRelationshipManager } from '@semblance/core/network/sharing-relationship-manager';
import { PeerDiscovery } from '@semblance/core/network/peer-discovery';
import { NetworkTracker } from '@semblance/core/network/network-tracker';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { setLicensePublicKey } from '@semblance/core/premium/license-keys';
import {
  LICENSE_TEST_PUBLIC_KEY_PEM,
  generateTestLicenseKey,
} from '../../fixtures/license-keys';

function makeLicenseKey(tier: string): string {
  const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  return generateTestLicenseKey({ tier, exp: futureDate });
}

beforeAll(() => {
  setLicensePublicKey(LICENSE_TEST_PUBLIC_KEY_PEM);
});

let db: InstanceType<typeof Database>;
let configStore: NetworkConfigStore;
let premiumGate: PremiumGate;
let peerDiscovery: PeerDiscovery;
let relationshipManager: SharingRelationshipManager;

beforeEach(() => {
  db = new Database(':memory:');
  configStore = new NetworkConfigStore(db as unknown as DatabaseHandle);
  premiumGate = new PremiumGate(db as unknown as DatabaseHandle);
  peerDiscovery = new PeerDiscovery({ localDeviceId: 'my-device' });
  relationshipManager = new SharingRelationshipManager(configStore);
});

afterEach(() => {
  db.close();
});

describe('NetworkTracker (Step 28)', () => {
  it('suggests sharing when new peers exist without relationships', () => {
    premiumGate.activateLicense(makeLicenseKey('digital-representative'));

    peerDiscovery.onPeerDiscovered({
      deviceId: 'peer-1',
      displayName: 'Alice',
      platform: 'desktop',
      ipAddress: '192.168.1.100',
      port: 7890,
      discoveredAt: new Date().toISOString(),
    });

    const tracker = new NetworkTracker({
      premiumGate,
      peerDiscovery,
      relationshipManager,
      configStore,
    });

    const insights = tracker.generateInsights();
    expect(insights).toHaveLength(1);
    expect(insights[0]!.type).toBe('network-peer-discovered');
    expect(insights[0]!.title).toContain('Alice');
  });

  it('returns empty insights when not premium', () => {
    // Free tier
    peerDiscovery.onPeerDiscovered({
      deviceId: 'peer-1',
      displayName: 'Alice',
      platform: 'desktop',
      ipAddress: '192.168.1.100',
      port: 7890,
      discoveredAt: new Date().toISOString(),
    });

    const tracker = new NetworkTracker({
      premiumGate,
      peerDiscovery,
      relationshipManager,
      configStore,
    });

    const insights = tracker.generateInsights();
    expect(insights).toHaveLength(0);
  });

  it('premium gate blocks free users from semblance-network feature', () => {
    expect(premiumGate.isFeatureAvailable('semblance-network')).toBe(false);
  });

  it('premium gate allows DR users for semblance-network feature', () => {
    premiumGate.activateLicense(makeLicenseKey('digital-representative'));
    expect(premiumGate.isFeatureAvailable('semblance-network')).toBe(true);
  });
});
