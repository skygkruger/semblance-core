// Network Tracker — ExtensionInsightTracker for Semblance Network.
// Generates proactive insights about sharing opportunities and stale syncs.
// CRITICAL: No networking imports. Pure insight generation.

import { nanoid } from 'nanoid';
import type { ExtensionInsightTracker } from '../extensions/types.js';
import type { ProactiveInsight } from '../agent/proactive-engine.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { PeerDiscovery } from './peer-discovery.js';
import type { SharingRelationshipManager } from './sharing-relationship-manager.js';
import type { NetworkConfigStore } from './network-config-store.js';

export interface NetworkTrackerDeps {
  premiumGate: PremiumGate;
  peerDiscovery: PeerDiscovery;
  relationshipManager: SharingRelationshipManager;
  configStore: NetworkConfigStore;
}

/**
 * NetworkTracker — Proactive insight tracker for Semblance Network.
 *
 * Generates insights for:
 * 1. New peers discovered on the network (sharing suggestion)
 * 2. Stale syncs (relationship hasn't synced in 2x the configured frequency)
 *
 * All insights are premium-gated: free users see nothing.
 */
export class NetworkTracker implements ExtensionInsightTracker {
  private premiumGate: PremiumGate;
  private peerDiscovery: PeerDiscovery;
  private relationshipManager: SharingRelationshipManager;
  private configStore: NetworkConfigStore;

  constructor(deps: NetworkTrackerDeps) {
    this.premiumGate = deps.premiumGate;
    this.peerDiscovery = deps.peerDiscovery;
    this.relationshipManager = deps.relationshipManager;
    this.configStore = deps.configStore;
  }

  /**
   * Generate proactive insights about sharing opportunities.
   */
  generateInsights(): ProactiveInsight[] {
    if (!this.premiumGate.isPremium()) return [];

    const insights: ProactiveInsight[] = [];

    // 1. New peers without relationships — suggest sharing
    const peers = this.peerDiscovery.getDiscoveredPeers();
    for (const peer of peers) {
      const existing = this.relationshipManager.getByPeer(peer.deviceId);
      if (!existing) {
        insights.push({
          id: nanoid(),
          type: 'network-peer-discovered',
          priority: 'low',
          title: `New Semblance peer: ${peer.displayName}`,
          summary: `${peer.displayName} is on your local network. You can share context categories like calendar availability or communication style.`,
          sourceIds: [peer.deviceId],
          suggestedAction: null,
          createdAt: new Date().toISOString(),
          expiresAt: null,
          estimatedTimeSavedSeconds: 0,
        });
      }
    }

    // 2. Stale syncs — relationships that haven't synced in 2x the configured frequency
    const config = this.configStore.getConfig();
    if (config.enabled) {
      const relationships = this.relationshipManager.getActiveRelationships();
      const staleThresholdMs = config.syncFrequencyHours * 2 * 60 * 60 * 1000;

      for (const rel of relationships) {
        if (rel.lastSyncAt) {
          const lastSync = new Date(rel.lastSyncAt).getTime();
          const now = Date.now();
          if ((now - lastSync) > staleThresholdMs) {
            insights.push({
              id: nanoid(),
              type: 'network-stale-sync',
              priority: 'normal',
              title: `Stale sync with ${rel.peerDisplayName}`,
              summary: `Last synced with ${rel.peerDisplayName} more than ${config.syncFrequencyHours * 2} hours ago. They may be offline.`,
              sourceIds: [rel.id],
              suggestedAction: null,
              createdAt: new Date().toISOString(),
              expiresAt: null,
              estimatedTimeSavedSeconds: 0,
            });
          }
        }
      }
    }

    return insights;
  }
}
