// Peer Discovery — Orchestrates mDNS peer discovery via Gateway IPC.
// CRITICAL: No networking imports. All mDNS operations happen in Gateway.
// This module sends IPC actions (network.startDiscovery, network.stopDiscovery)
// and maintains a local list of discovered peers.

import type { DiscoveredPeer } from './types.js';
import { NETWORK_MDNS_SERVICE_TYPE, NETWORK_PROTOCOL_VERSION } from './types.js';

/**
 * IPC client interface — matches the pattern used by other core modules.
 * The actual IPC client is injected at construction.
 */
export interface NetworkIPCClient {
  send(action: string, payload: Record<string, unknown>): Promise<{
    status: string;
    data?: unknown;
  }>;
}

/**
 * PeerDiscovery — Discovers Semblance Network peers via Gateway IPC.
 *
 * Flow:
 * 1. Core calls startDiscovery() → sends 'network.startDiscovery' IPC action
 * 2. Gateway starts mDNS broadcast + listen on _semblance-network._tcp.local.
 * 3. Gateway reports discovered peers via callback/polling
 * 4. Core maintains local discovered peers list
 */
export class PeerDiscovery {
  private ipcClient: NetworkIPCClient | null;
  private discoveredPeers: Map<string, DiscoveredPeer> = new Map();
  private isActive = false;
  private localDeviceId: string;

  constructor(config: {
    ipcClient?: NetworkIPCClient;
    localDeviceId: string;
  }) {
    this.ipcClient = config.ipcClient ?? null;
    this.localDeviceId = config.localDeviceId;
  }

  /**
   * Start peer discovery via Gateway IPC.
   */
  async startDiscovery(): Promise<boolean> {
    if (!this.ipcClient || this.isActive) return false;

    const result = await this.ipcClient.send('network.startDiscovery', {
      serviceType: NETWORK_MDNS_SERVICE_TYPE,
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      localDeviceId: this.localDeviceId,
    });

    if (result.status === 'success') {
      this.isActive = true;
      return true;
    }
    return false;
  }

  /**
   * Stop peer discovery via Gateway IPC.
   */
  async stopDiscovery(): Promise<boolean> {
    if (!this.ipcClient || !this.isActive) return false;

    const result = await this.ipcClient.send('network.stopDiscovery', {
      serviceType: NETWORK_MDNS_SERVICE_TYPE,
    });

    if (result.status === 'success') {
      this.isActive = false;
      this.discoveredPeers.clear();
      return true;
    }
    return false;
  }

  /**
   * Report a discovered peer (called by Gateway callback).
   */
  onPeerDiscovered(peer: DiscoveredPeer): void {
    if (peer.deviceId === this.localDeviceId) return; // Ignore self
    this.discoveredPeers.set(peer.deviceId, peer);
  }

  /**
   * Report a lost peer (called by Gateway callback).
   */
  onPeerLost(deviceId: string): void {
    this.discoveredPeers.delete(deviceId);
  }

  /**
   * Get all currently discovered peers.
   */
  getDiscoveredPeers(): DiscoveredPeer[] {
    return [...this.discoveredPeers.values()];
  }

  /**
   * Check if discovery is currently active.
   */
  isDiscoveryActive(): boolean {
    return this.isActive;
  }

  /**
   * Get a specific peer by device ID.
   */
  getPeer(deviceId: string): DiscoveredPeer | null {
    return this.discoveredPeers.get(deviceId) ?? null;
  }
}
