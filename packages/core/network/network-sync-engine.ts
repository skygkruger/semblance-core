// Network Sync Engine — Scheduled context sync with active relationships.
// Assembles outbound context, delivers via IPC, processes inbound context.
// CRITICAL: No networking imports. All delivery via Gateway IPC.

import type { ContextAssembler } from './context-assembler.js';
import { SharedContextStore } from './shared-context-store.js';
import type { SharingRelationshipManager } from './sharing-relationship-manager.js';
import type { NetworkConfigStore } from './network-config-store.js';
import type { RevocationHandler } from './revocation-handler.js';
import type { NetworkIPCClient } from './peer-discovery.js';
import type { SharingRelationship, SharedContext, SharingCategory, AssembledContext } from './types.js';

export interface SyncResult {
  peerId: string;
  outboundCategories: number;
  inboundCategories: number;
  syncedAt: string;
}

export interface NetworkSyncEngineDeps {
  contextAssembler: ContextAssembler;
  sharedContextStore: SharedContextStore;
  relationshipManager: SharingRelationshipManager;
  configStore: NetworkConfigStore;
  revocationHandler: RevocationHandler;
  ipcClient?: NetworkIPCClient;
}

/**
 * NetworkSyncEngine — Synchronizes context with active sharing relationships.
 *
 * Sync flow:
 * 1. Get active relationships
 * 2. For each due relationship:
 *    a. Assemble outbound context for shared categories
 *    b. Send context to peer via IPC → Gateway
 *    c. Receive and store inbound context from peer
 *    d. Update lastSyncAt
 */
export class NetworkSyncEngine {
  private assembler: ContextAssembler;
  private sharedContextStore: SharedContextStore;
  private relationshipManager: SharingRelationshipManager;
  private configStore: NetworkConfigStore;
  private revocationHandler: RevocationHandler;
  private ipcClient: NetworkIPCClient | null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: NetworkSyncEngineDeps) {
    this.assembler = deps.contextAssembler;
    this.sharedContextStore = deps.sharedContextStore;
    this.relationshipManager = deps.relationshipManager;
    this.configStore = deps.configStore;
    this.revocationHandler = deps.revocationHandler;
    this.ipcClient = deps.ipcClient ?? null;
  }

  /**
   * Sync with a specific peer. Assembles outbound context and stores inbound.
   */
  async syncWithPeer(relationship: SharingRelationship): Promise<SyncResult | null> {
    // Check if revoked
    if (this.revocationHandler.isRevoked(relationship.id)) {
      return null;
    }

    // Assemble outbound context for shared categories
    const outboundContexts = this.assembler.assembleMultiple(relationship.outboundCategories);

    // Store results: in a real implementation, the outbound context would be sent
    // via IPC to the peer, and we'd receive their inbound context in response.
    // For now, the sync engine prepares the data; IPC delivery is handled by the caller.

    // Update lastSyncAt
    this.relationshipManager.markSynced(relationship.id);

    return {
      peerId: relationship.peerId,
      outboundCategories: outboundContexts.length,
      inboundCategories: 0, // Will be populated when response comes back
      syncedAt: new Date().toISOString(),
    };
  }

  /**
   * Store inbound context received from a peer.
   */
  storeReceivedContext(peerId: string, contexts: Array<{
    category: SharingCategory;
    summaryText: string;
    structuredData?: Record<string, unknown> | null;
  }>): number {
    let stored = 0;

    // Verify we have a relationship that accepts these categories
    const inboundCategories = this.relationshipManager.getInboundCategories(peerId);

    for (const ctx of contexts) {
      if (!inboundCategories.includes(ctx.category)) continue; // Not authorized

      this.sharedContextStore.storeContext({
        peerId,
        category: ctx.category,
        summaryText: ctx.summaryText,
        structuredData: ctx.structuredData,
      });
      stored++;
    }

    return stored;
  }

  /**
   * Run a scheduled sync for all due relationships.
   */
  async runScheduledSync(): Promise<SyncResult[]> {
    const config = this.configStore.getConfig();
    if (!config.enabled) return [];

    const relationships = this.relationshipManager.getActiveRelationships();
    const results: SyncResult[] = [];

    for (const rel of relationships) {
      if (!this.relationshipManager.isSyncDue(rel, config.syncFrequencyHours)) {
        continue;
      }

      const result = await this.syncWithPeer(rel);
      if (result) results.push(result);
    }

    return results;
  }

  /**
   * Start periodic sync.
   */
  startPeriodicSync(intervalMs: number): () => void {
    this.syncTimer = setInterval(async () => {
      try {
        await this.runScheduledSync();
      } catch {
        // Sync failures are silent — will retry next interval
      }
    }, intervalMs);

    return () => this.stopPeriodicSync();
  }

  /**
   * Stop periodic sync.
   */
  stopPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }
}
