// Cross-Device State Sync — Encrypted local-network sync between paired devices.
//
// After devices are paired via mDNS discovery, this module handles syncing:
//   - Preferences and settings (autonomy tiers, per-domain config)
//   - Action trail (audit trail entries — append-only merge)
//   - Style profile (desktop takes precedence)
//   - Reminder state (merge by ID, last-write-wins)
//   - Quick capture entries (merge by ID)
//   - Device capabilities (for task routing)
//
// What does NOT sync: raw email/calendar content, model weights, embeddings,
// full knowledge graph. Each device fetches/builds its own.
//
// CRITICAL: All sync is local network only. No cloud relay.
// Transport is encrypted using a shared secret derived during pairing.

import { nanoid } from 'nanoid';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SyncItemType =
  | 'preference'
  | 'action_trail'
  | 'style_profile'
  | 'reminder'
  | 'capture'
  | 'device_capability';

export interface SyncItem {
  id: string;
  type: SyncItemType;
  data: unknown;
  updatedAt: string;
  sourceDeviceId: string;
}

export interface SyncManifest {
  deviceId: string;
  deviceName: string;
  /** Last successful sync timestamp with this device */
  lastSyncAt: string | null;
  /** Items changed since lastSyncAt */
  items: SyncItem[];
  /** Protocol version for forward compatibility */
  protocolVersion: number;
}

export interface SyncResult {
  accepted: number;
  rejected: number;
  conflicts: SyncConflict[];
  syncedAt: string;
}

export interface SyncConflict {
  itemId: string;
  type: SyncItemType;
  resolution: 'local_wins' | 'remote_wins' | 'merged';
  reason: string;
}

/**
 * Encryption envelope for sync data in transit.
 */
export interface EncryptedSyncPayload {
  /** Encrypted JSON of SyncManifest */
  ciphertext: string;
  /** Initialization vector (base64) */
  iv: string;
  /** HMAC of ciphertext for integrity verification */
  hmac: string;
  /** Sender device ID (plaintext for routing) */
  senderDeviceId: string;
}

/**
 * Abstract crypto provider for sync encryption.
 * Platform implementations inject this.
 */
export interface SyncCryptoProvider {
  encrypt(plaintext: string, sharedSecret: string): Promise<{ ciphertext: string; iv: string }>;
  decrypt(ciphertext: string, iv: string, sharedSecret: string): Promise<string>;
  hmac(data: string, key: string): Promise<string>;
}

/**
 * Abstract transport for sync communication.
 * Platform implementations provide TCP/TLS transport.
 */
export interface SyncTransport {
  send(deviceId: string, payload: EncryptedSyncPayload): Promise<EncryptedSyncPayload | null>;
  onReceive(handler: (payload: EncryptedSyncPayload) => Promise<EncryptedSyncPayload>): void;
  isDeviceReachable(deviceId: string): boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Sync protocol version */
export const SYNC_PROTOCOL_VERSION = 1;

/** Default sync interval when both devices are on network (ms) */
export const SYNC_INTERVAL_MS = 60_000;

/** Maximum age of items to sync on first connection (7 days) */
export const MAX_INITIAL_SYNC_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Conflict Resolution ────────────────────────────────────────────────────

/**
 * Resolve a conflict between local and remote sync items.
 * Rules:
 *   - preference: last-write-wins (most recent timestamp)
 *   - action_trail: merge (union by ID, append-only — no conflict possible)
 *   - style_profile: desktop takes precedence
 *   - reminder: last-write-wins by timestamp
 *   - capture: merge (union by ID)
 *   - device_capability: always accept remote (it's about the remote device)
 */
export function resolveConflict(
  local: SyncItem,
  remote: SyncItem,
  localDeviceType: 'desktop' | 'mobile',
  remoteDeviceType: 'desktop' | 'mobile',
): SyncConflict & { winner: 'local' | 'remote' } {
  // Style profile: desktop takes precedence
  if (local.type === 'style_profile') {
    if (localDeviceType === 'desktop' && remoteDeviceType === 'mobile') {
      return {
        itemId: local.id,
        type: local.type,
        resolution: 'local_wins',
        reason: 'Desktop style profile takes precedence over mobile',
        winner: 'local',
      };
    }
    if (remoteDeviceType === 'desktop' && localDeviceType === 'mobile') {
      return {
        itemId: local.id,
        type: local.type,
        resolution: 'remote_wins',
        reason: 'Desktop style profile takes precedence over mobile',
        winner: 'remote',
      };
    }
  }

  // Action trail and captures: always merge (no real conflict)
  if (local.type === 'action_trail' || local.type === 'capture') {
    return {
      itemId: local.id,
      type: local.type,
      resolution: 'merged',
      reason: 'Append-only items merged by union',
      winner: 'remote', // Accept remote to merge
    };
  }

  // Device capabilities: always accept remote
  if (local.type === 'device_capability') {
    return {
      itemId: local.id,
      type: local.type,
      resolution: 'remote_wins',
      reason: 'Device capabilities describe the remote device',
      winner: 'remote',
    };
  }

  // Preferences and reminders: last-write-wins
  const localTime = new Date(local.updatedAt).getTime();
  const remoteTime = new Date(remote.updatedAt).getTime();

  if (remoteTime > localTime) {
    return {
      itemId: local.id,
      type: local.type,
      resolution: 'remote_wins',
      reason: 'Remote item has more recent timestamp',
      winner: 'remote',
    };
  }

  return {
    itemId: local.id,
    type: local.type,
    resolution: 'local_wins',
    reason: 'Local item has more recent or equal timestamp',
    winner: 'local',
  };
}

// ─── Sync Engine ────────────────────────────────────────────────────────────

/**
 * SyncEngine manages bidirectional state sync between paired devices.
 * Handles encryption, delta sync, conflict resolution, and interval scheduling.
 */
export class SyncEngine {
  private localItems: Map<string, SyncItem> = new Map();
  private lastSyncTimes: Map<string, string> = new Map();
  private crypto: SyncCryptoProvider | null;
  private transport: SyncTransport | null;
  private deviceId: string;
  private deviceType: 'desktop' | 'mobile';
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private pairedSecrets: Map<string, string> = new Map();

  constructor(config: {
    deviceId: string;
    deviceType: 'desktop' | 'mobile';
    crypto?: SyncCryptoProvider;
    transport?: SyncTransport;
  }) {
    this.deviceId = config.deviceId;
    this.deviceType = config.deviceType;
    this.crypto = config.crypto ?? null;
    this.transport = config.transport ?? null;
  }

  /**
   * Register a paired device's shared secret for encrypted sync.
   */
  registerPairedDevice(deviceId: string, sharedSecret: string): void {
    this.pairedSecrets.set(deviceId, sharedSecret);
  }

  /**
   * Remove a paired device (unpair).
   */
  removePairedDevice(deviceId: string): void {
    this.pairedSecrets.delete(deviceId);
    this.lastSyncTimes.delete(deviceId);
  }

  /**
   * Add or update a local sync item.
   */
  upsertItem(item: SyncItem): void {
    this.localItems.set(item.id, item);
  }

  /**
   * Get all local items.
   */
  getItems(): SyncItem[] {
    return [...this.localItems.values()];
  }

  /**
   * Get items of a specific type.
   */
  getItemsByType(type: SyncItemType): SyncItem[] {
    return this.getItems().filter(i => i.type === type);
  }

  /**
   * Get items changed since a given timestamp (delta sync).
   */
  getChangedSince(since: string | null): SyncItem[] {
    if (!since) {
      // First sync: return items within MAX_INITIAL_SYNC_AGE
      const cutoff = new Date(Date.now() - MAX_INITIAL_SYNC_AGE_MS).toISOString();
      return this.getItems().filter(i => i.updatedAt >= cutoff);
    }
    return this.getItems().filter(i => i.updatedAt > since);
  }

  /**
   * Build a sync manifest for a specific paired device (delta).
   */
  buildManifest(targetDeviceId: string, deviceName: string): SyncManifest {
    const lastSync = this.lastSyncTimes.get(targetDeviceId) ?? null;
    return {
      deviceId: this.deviceId,
      deviceName,
      lastSyncAt: lastSync,
      items: this.getChangedSince(lastSync),
      protocolVersion: SYNC_PROTOCOL_VERSION,
    };
  }

  /**
   * Apply a received sync manifest from a remote device.
   * Returns the sync result with conflict details.
   */
  applyManifest(
    manifest: SyncManifest,
    remoteDeviceType: 'desktop' | 'mobile',
  ): SyncResult {
    let accepted = 0;
    let rejected = 0;
    const conflicts: SyncConflict[] = [];

    for (const remoteItem of manifest.items) {
      const localItem = this.localItems.get(remoteItem.id);

      if (!localItem) {
        // New item — accept directly
        this.localItems.set(remoteItem.id, remoteItem);
        accepted++;
        continue;
      }

      // Item exists locally — resolve conflict
      const resolution = resolveConflict(
        localItem,
        remoteItem,
        this.deviceType,
        remoteDeviceType,
      );
      conflicts.push(resolution);

      if (resolution.winner === 'remote') {
        this.localItems.set(remoteItem.id, remoteItem);
        accepted++;
      } else {
        rejected++;
      }
    }

    const syncedAt = new Date().toISOString();
    this.lastSyncTimes.set(manifest.deviceId, syncedAt);

    return { accepted, rejected, conflicts, syncedAt };
  }

  /**
   * Encrypt a sync manifest for transit.
   */
  async encryptManifest(
    manifest: SyncManifest,
    targetDeviceId: string,
  ): Promise<EncryptedSyncPayload | null> {
    if (!this.crypto) return null;

    const secret = this.pairedSecrets.get(targetDeviceId);
    if (!secret) return null;

    const plaintext = JSON.stringify(manifest);
    const { ciphertext, iv } = await this.crypto.encrypt(plaintext, secret);
    const hmac = await this.crypto.hmac(ciphertext, secret);

    return {
      ciphertext,
      iv,
      hmac,
      senderDeviceId: this.deviceId,
    };
  }

  /**
   * Decrypt a received sync payload.
   */
  async decryptPayload(payload: EncryptedSyncPayload): Promise<SyncManifest | null> {
    if (!this.crypto) return null;

    const secret = this.pairedSecrets.get(payload.senderDeviceId);
    if (!secret) return null;

    // Verify HMAC first
    const expectedHmac = await this.crypto.hmac(payload.ciphertext, secret);
    if (expectedHmac !== payload.hmac) return null;

    const plaintext = await this.crypto.decrypt(payload.ciphertext, payload.iv, secret);
    return JSON.parse(plaintext) as SyncManifest;
  }

  /**
   * Perform a full sync with a specific paired device.
   * Sends local changes, receives remote changes, resolves conflicts.
   */
  async syncWithDevice(
    targetDeviceId: string,
    deviceName: string,
    remoteDeviceType: 'desktop' | 'mobile',
  ): Promise<SyncResult | null> {
    if (!this.transport || !this.crypto) return null;
    if (!this.pairedSecrets.has(targetDeviceId)) return null;
    if (!this.transport.isDeviceReachable(targetDeviceId)) return null;

    // Build and encrypt our manifest
    const manifest = this.buildManifest(targetDeviceId, deviceName);
    const encrypted = await this.encryptManifest(manifest, targetDeviceId);
    if (!encrypted) return null;

    // Send and receive response
    const response = await this.transport.send(targetDeviceId, encrypted);
    if (!response) return null;

    // Decrypt response
    const remoteManifest = await this.decryptPayload(response);
    if (!remoteManifest) return null;

    // Apply remote changes
    return this.applyManifest(remoteManifest, remoteDeviceType);
  }

  /**
   * Start periodic sync with all reachable paired devices.
   */
  startPeriodicSync(
    pairedDevices: Array<{ deviceId: string; deviceName: string; deviceType: 'desktop' | 'mobile' }>,
    intervalMs: number = SYNC_INTERVAL_MS,
  ): void {
    this.stopPeriodicSync();
    this.syncInterval = setInterval(() => {
      for (const device of pairedDevices) {
        if (this.transport?.isDeviceReachable(device.deviceId)) {
          this.syncWithDevice(device.deviceId, device.deviceName, device.deviceType).catch(() => {
            // Sync failures are silent — will retry next interval
          });
        }
      }
    }, intervalMs);
  }

  /**
   * Stop periodic sync.
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Get the last sync time for a device.
   */
  getLastSyncTime(deviceId: string): string | null {
    return this.lastSyncTimes.get(deviceId) ?? null;
  }

  /**
   * Check if a device is reachable.
   */
  isDeviceReachable(deviceId: string): boolean {
    return this.transport?.isDeviceReachable(deviceId) ?? false;
  }
}
