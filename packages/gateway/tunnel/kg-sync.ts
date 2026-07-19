// Knowledge Graph Merkle Delta Sync — Sovereignty-preserving sync over tunnel.
//
// Gateway transports ciphertext envelopes only — it never decrypts sync payloads.
// Decryption and merge authority live in @semblance/sync on the receiving device.

import { sha256 } from '@semblance/core';
import type { SyncEnvelopeV1 } from '@semblance/sync';
import type { SemblanceEventBus } from '../events/event-bus.js';

export type KGSyncCategory = 'contacts' | 'calendar' | 'preferences' | 'named_sessions';

// ─── Merkle Tree Utilities ──────────────────────────────────────────────────

/**
 * Compute a Merkle root from an array of document/entity IDs.
 * Produces a single SHA-256 hash that represents the complete set of IDs.
 * If the set changes by even one ID, the root changes — enabling cheap diff detection.
 *
 * Algorithm: binary Merkle tree. Leaf nodes are sha256(id). If odd count,
 * the last leaf is duplicated. Internal nodes are sha256(left + right).
 */
export function computeMerkleRoot(documentIds: string[]): string {
  if (documentIds.length === 0) {
    return sha256('empty');
  }

  // Sort for deterministic ordering
  const sorted = [...documentIds].sort();

  // Compute leaf hashes
  let level: string[] = sorted.map((id) => sha256(id));

  // Build tree bottom-up
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left; // Duplicate last if odd
      next.push(sha256(left + right));
    }
    level = next;
  }

  return level[0]!;
}

/**
 * Compute the delta between local and remote document sets.
 * Returns which document IDs need to be added, removed, or updated
 * on the local side to match the remote.
 *
 * @param localRoot - Merkle root of local document IDs.
 * @param remoteRoot - Merkle root of remote document IDs.
 * @param localDocIds - All local document IDs.
 * @param remoteDocIds - All remote document IDs.
 * @returns A delta describing what changed, or null if roots match (no sync needed).
 */
export function computeDelta(
  localRoot: string,
  remoteRoot: string,
  localDocIds: string[],
  remoteDocIds: string[],
): KGSyncDeltaSet | null {
  // Fast path: roots match, no sync needed
  if (localRoot === remoteRoot) {
    return null;
  }

  const localSet = new Set(localDocIds);
  const remoteSet = new Set(remoteDocIds);

  const addedDocIds: string[] = [];
  const removedDocIds: string[] = [];
  const commonDocIds: string[] = [];

  // IDs present remotely but not locally → need to add
  for (const id of remoteDocIds) {
    if (!localSet.has(id)) {
      addedDocIds.push(id);
    } else {
      commonDocIds.push(id);
    }
  }

  // IDs present locally but not remotely → were removed on remote
  for (const id of localDocIds) {
    if (!remoteSet.has(id)) {
      removedDocIds.push(id);
    }
  }

  return {
    addedDocIds,
    removedDocIds,
    // Common IDs may have updated content — caller should compare per-doc hashes
    updatedDocIds: commonDocIds,
    merkleRoot: remoteRoot,
    timestamp: new Date().toISOString(),
  };
}

/**
 * The set-level delta between two document collections.
 * Used by the sync protocol to determine what needs fetching/pruning.
 */
export interface KGSyncDeltaSet {
  /** Document IDs present on remote but missing locally. */
  addedDocIds: string[];
  /** Document IDs present locally but removed on remote. */
  removedDocIds: string[];
  /** Document IDs present on both — may need content-level comparison. */
  updatedDocIds: string[];
  /** The remote Merkle root that this delta brings us to. */
  merkleRoot: string;
  /** When this delta was computed. */
  timestamp: string;
}

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
  /** Ciphertext-only envelopes relayed — Gateway never decrypts these. */
  relayedEnvelopes?: SyncEnvelopeV1[];
}

interface KGSyncStore {
  getEntitiesByCategory(category: string): Array<{ id: string; data: Record<string, unknown>; updatedAt: string }>;
  applyDelta(delta: KGSyncDelta): void;
  getMerkleRoot(): string;
}

/** Ciphertext envelope transport — Gateway relays without decryption. */
export interface CiphertextEnvelopeTransport {
  pushEnvelopes(envelopes: SyncEnvelopeV1[]): Promise<{ accepted: number }>;
  pullEnvelopes(sinceLamport?: number): Promise<SyncEnvelopeV1[]>;
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
  private eventBus: SemblanceEventBus | null;
  private lastSyncMerkleRoot: string = '';
  private lastSyncAt: string | null = null;
  private totalDeltasSent = 0;
  private totalDeltasReceived = 0;
  private peerOnline = false;

  constructor(config: {
    store?: KGSyncStore;
    deviceId: string;
    eventBus?: SemblanceEventBus;
  }) {
    this.store = config.store ?? null;
    this.deviceId = config.deviceId;
    this.eventBus = config.eventBus ?? null;
  }

  /**
   * Relay ciphertext sync envelopes without decrypting.
   * Gateway is transport-only — merge authority stays on devices.
   */
  async relayEncryptedEnvelopes(
    transport: CiphertextEnvelopeTransport,
    outgoing: SyncEnvelopeV1[],
  ): Promise<{ accepted: number; pulled: SyncEnvelopeV1[] }> {
    const pushResult = await transport.pushEnvelopes(outgoing);
    const pulled = await transport.pullEnvelopes();
    return { accepted: pushResult.accepted, pulled };
  }

  /**
   * Called by the CronScheduler tunnel-sync job.
   * Sends local changes to the remote device and receives remote changes.
   */
  async sync(tunnelTransport: TunnelTransportLike): Promise<KGSyncResult> {
    if (!tunnelTransport.isReady()) {
      // Peer went offline — emit disconnected if was previously online
      if (this.peerOnline && this.eventBus) {
        this.peerOnline = false;
        this.eventBus.emit('tunnel.disconnected', { deviceId: this.deviceId });
      }
      return {
        success: false,
        deltasSent: 0,
        deltasReceived: 0,
        syncedAt: new Date().toISOString(),
        error: 'Tunnel not ready',
      };
    }

    // Peer is online — emit connected if first time seeing it online
    if (!this.peerOnline && this.eventBus) {
      this.peerOnline = true;
      this.eventBus.emit('tunnel.connected', { deviceId: this.deviceId });
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
