// Knowledge Graph Merkle Delta Sync — Sovereignty-preserving sync over tunnel.
//
// Only derived metadata and entity relationships sync between devices.
// Raw document content, email bodies, and message content NEVER sync.
// Delta-based: Merkle root comparison identifies changes, only deltas transmitted.
//
// What syncs: contacts, calendar events, preferences, named session metadata.
// What never syncs: raw document chunks, email bodies, conversation history.

import { sha256 } from '@semblance/core';

export type KGSyncCategory = 'contacts' | 'calendar' | 'preferences' | 'named_sessions';

export interface KGSyncRequest {
  deviceId: string;
  localMerkleRoot: string;
  lastSyncMerkleRoot: string;
  requestedCategories: KGSyncCategory[];
}

export interface KGSyncResponse {
  remoteMerkleRoot: string;
  deltas: KGSyncDelta[];
}

export interface KGSyncDelta {
  category: KGSyncCategory;
  operation: 'add' | 'update' | 'delete';
  nodeId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface KGSyncResult {
  success: boolean;
  deltasSent: number;
  deltasReceived: number;
  syncedAt: string;
  error?: string;
}

interface KGSyncStore {
  getEntitiesByCategory(category: string): Array<{ id: string; data: Record<string, unknown>; updatedAt: string }>;
  applyDelta(delta: KGSyncDelta): void;
  getMerkleRoot(): string;
}

// Transport interface (subset of TunnelTransport)
interface TunnelTransportLike {
  isReady(): boolean;
  send(request: unknown): Promise<unknown>;
  getBaseUrl(): string;
}

/**
 * TunnelKGSync implements delta-based knowledge graph synchronization
 * between paired devices over the WireGuard tunnel.
 */
export class TunnelKGSync {
  private store: KGSyncStore | null;
  private deviceId: string;
  private lastSyncMerkleRoot: string = '';
  private lastSyncAt: string | null = null;
  private totalDeltasSent = 0;
  private totalDeltasReceived = 0;

  constructor(config: {
    store?: KGSyncStore;
    deviceId: string;
  }) {
    this.store = config.store ?? null;
    this.deviceId = config.deviceId;
  }

  /**
   * Called by the CronScheduler tunnel-sync job.
   * Sends local changes to the remote device and receives remote changes.
   */
  async sync(tunnelTransport: TunnelTransportLike): Promise<KGSyncResult> {
    if (!tunnelTransport.isReady()) {
      return {
        success: false,
        deltasSent: 0,
        deltasReceived: 0,
        syncedAt: new Date().toISOString(),
        error: 'Tunnel not ready',
      };
    }

    const localMerkleRoot = this.store?.getMerkleRoot() ?? sha256(this.deviceId);

    // If merkle roots match, no sync needed
    if (localMerkleRoot === this.lastSyncMerkleRoot) {
      return {
        success: true,
        deltasSent: 0,
        deltasReceived: 0,
        syncedAt: new Date().toISOString(),
      };
    }

    try {
      // Compute local deltas to send
      const localDeltas = this.computeLocalDeltas();

      // Send sync request to remote device
      const request: KGSyncRequest = {
        deviceId: this.deviceId,
        localMerkleRoot,
        lastSyncMerkleRoot: this.lastSyncMerkleRoot,
        requestedCategories: ['contacts', 'calendar', 'preferences', 'named_sessions'],
      };

      const response = await tunnelTransport.send({
        id: `kg-sync-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'network.sync_knowledge_delta',
        payload: { syncRequest: request, deltas: localDeltas },
        source: 'core',
        signature: sha256(JSON.stringify(request)),
      }) as { data?: KGSyncResponse };

      // Apply received deltas
      const receivedDeltas = response.data?.deltas ?? [];
      for (const delta of receivedDeltas) {
        // Sovereignty filter: never accept raw content
        if (this.isSafeToSync(delta)) {
          this.store?.applyDelta(delta);
        }
      }

      // Update sync state
      this.lastSyncMerkleRoot = localMerkleRoot;
      this.lastSyncAt = new Date().toISOString();
      this.totalDeltasSent += localDeltas.length;
      this.totalDeltasReceived += receivedDeltas.length;

      return {
        success: true,
        deltasSent: localDeltas.length,
        deltasReceived: receivedDeltas.length,
        syncedAt: this.lastSyncAt,
      };
    } catch (error) {
      return {
        success: false,
        deltasSent: 0,
        deltasReceived: 0,
        syncedAt: new Date().toISOString(),
        error: (error as Error).message,
      };
    }
  }

  /**
   * Handle an incoming sync request from a remote device.
   */
  async handleIncomingSync(request: KGSyncRequest, incomingDeltas: KGSyncDelta[]): Promise<KGSyncResponse> {
    // Apply incoming deltas from the remote device
    for (const delta of incomingDeltas) {
      if (this.isSafeToSync(delta)) {
        this.store?.applyDelta(delta);
      }
    }

    // Compute our deltas to send back
    const localDeltas = this.computeLocalDeltas(request.requestedCategories);

    return {
      remoteMerkleRoot: this.store?.getMerkleRoot() ?? sha256(this.deviceId),
      deltas: localDeltas,
    };
  }

  /**
   * Get sync status for display in Settings.
   */
  getSyncStatus(): {
    lastSyncAt: string | null;
    deltasSent: number;
    deltasReceived: number;
    nextSyncAt: string;
  } {
    return {
      lastSyncAt: this.lastSyncAt,
      deltasSent: this.totalDeltasSent,
      deltasReceived: this.totalDeltasReceived,
      nextSyncAt: this.lastSyncAt
        ? new Date(new Date(this.lastSyncAt).getTime() + 15 * 60 * 1000).toISOString()
        : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private computeLocalDeltas(categories?: KGSyncCategory[]): KGSyncDelta[] {
    if (!this.store) return [];

    const cats = categories ?? ['contacts', 'calendar', 'preferences', 'named_sessions'];
    const deltas: KGSyncDelta[] = [];

    for (const category of cats) {
      const entities = this.store.getEntitiesByCategory(category);
      for (const entity of entities) {
        // Only include entities updated since last sync
        if (!this.lastSyncAt || entity.updatedAt > this.lastSyncAt) {
          const sanitized = this.sanitizePayload(category, entity.data);
          if (sanitized) {
            deltas.push({
              category,
              operation: 'update',
              nodeId: entity.id,
              payload: sanitized,
              timestamp: entity.updatedAt,
            });
          }
        }
      }
    }

    return deltas;
  }

  /**
   * Sovereignty filter: ensure a delta is safe to sync.
   * Raw document content, email bodies, and message content are NEVER synced.
   */
  private isSafeToSync(delta: KGSyncDelta): boolean {
    const validCategories: KGSyncCategory[] = ['contacts', 'calendar', 'preferences', 'named_sessions'];
    if (!validCategories.includes(delta.category)) return false;

    // Check for forbidden fields
    const forbidden = ['emailBody', 'messageContent', 'documentContent', 'rawContent', 'body'];
    for (const key of Object.keys(delta.payload)) {
      if (forbidden.includes(key)) return false;
    }

    return true;
  }

  /**
   * Strip raw content from sync payloads.
   * Only derived metadata and entity relationships cross the tunnel.
   */
  private sanitizePayload(category: KGSyncCategory, data: Record<string, unknown>): Record<string, unknown> | null {
    const sanitized = { ...data };

    // Remove any raw content fields
    delete sanitized['emailBody'];
    delete sanitized['messageContent'];
    delete sanitized['documentContent'];
    delete sanitized['rawContent'];
    delete sanitized['body'];
    delete sanitized['content'];
    delete sanitized['htmlBody'];

    return sanitized;
  }
}
