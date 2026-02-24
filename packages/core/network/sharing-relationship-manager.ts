// Sharing Relationship Manager — Queries and updates active sharing relationships.
// CRITICAL: No networking imports. Pure data access layer.

import type { NetworkConfigStore } from './network-config-store.js';
import type { SharingRelationship, SharingCategory } from './types.js';

/**
 * SharingRelationshipManager — Active relationship queries and lastSync updates.
 *
 * Provides a clean query interface over NetworkConfigStore for sync operations.
 */
export class SharingRelationshipManager {
  private configStore: NetworkConfigStore;

  constructor(configStore: NetworkConfigStore) {
    this.configStore = configStore;
  }

  /**
   * Get all active relationships.
   */
  getActiveRelationships(): SharingRelationship[] {
    return this.configStore.getActiveRelationships();
  }

  /**
   * Get a relationship by peer ID.
   */
  getByPeer(peerId: string): SharingRelationship | null {
    return this.configStore.getRelationshipByPeer(peerId);
  }

  /**
   * Get a relationship by ID.
   */
  getById(id: string): SharingRelationship | null {
    return this.configStore.getRelationship(id);
  }

  /**
   * Update the last sync timestamp for a relationship.
   */
  markSynced(relationshipId: string): void {
    this.configStore.updateLastSync(relationshipId);
  }

  /**
   * Check if a sync is due for a relationship (based on sync frequency).
   */
  isSyncDue(relationship: SharingRelationship, syncFrequencyHours: number): boolean {
    if (!relationship.lastSyncAt) return true; // Never synced

    const lastSync = new Date(relationship.lastSyncAt).getTime();
    const now = Date.now();
    const freqMs = syncFrequencyHours * 60 * 60 * 1000;

    return (now - lastSync) >= freqMs;
  }

  /**
   * Get outbound categories for a specific peer.
   */
  getOutboundCategories(peerId: string): SharingCategory[] {
    const rel = this.configStore.getRelationshipByPeer(peerId);
    if (!rel || rel.status !== 'active') return [];
    return rel.outboundCategories;
  }

  /**
   * Get inbound categories for a specific peer.
   */
  getInboundCategories(peerId: string): SharingCategory[] {
    const rel = this.configStore.getRelationshipByPeer(peerId);
    if (!rel || rel.status !== 'active') return [];
    return rel.inboundCategories;
  }
}
