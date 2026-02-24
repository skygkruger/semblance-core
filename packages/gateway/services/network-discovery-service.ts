// Network Discovery Service — Gateway adapter for mDNS peer discovery.
// Wraps MDNSProvider for the Semblance Network feature (Step 28).
// Uses service type _semblance-network._tcp.local. (distinct from Step 12 sync).
//
// This is the Gateway side — it has network access.

import type { ServiceAdapter } from './types.js';
import type { ActionType } from '@semblance/core';

/**
 * MDNSProvider interface (mirrors packages/core/routing/discovery.ts).
 * Injected at construction — the Gateway holds the actual mDNS implementation.
 */
export interface NetworkMDNSProvider {
  advertise(service: {
    deviceId: string;
    deviceName: string;
    syncPort: number;
    serviceType: string;
  }): Promise<void>;
  stopAdvertising(): Promise<void>;
  startDiscovery(
    onFound: (device: { deviceId: string; displayName: string; platform: string; ipAddress: string; port: number }) => void,
    onLost: (deviceId: string) => void,
    serviceType: string,
  ): Promise<void>;
  stopDiscovery(): Promise<void>;
}

/**
 * NetworkDiscoveryService — Gateway service for mDNS peer discovery.
 * Handles 'network.startDiscovery' and 'network.stopDiscovery' IPC actions.
 */
export class NetworkDiscoveryService implements ServiceAdapter {
  private mdns: NetworkMDNSProvider | null;
  private onPeerFound: ((device: { deviceId: string; displayName: string; platform: string; ipAddress: string; port: number }) => void) | null = null;
  private onPeerLost: ((deviceId: string) => void) | null = null;

  constructor(config?: {
    mdns?: NetworkMDNSProvider;
    onPeerFound?: (device: { deviceId: string; displayName: string; platform: string; ipAddress: string; port: number }) => void;
    onPeerLost?: (deviceId: string) => void;
  }) {
    this.mdns = config?.mdns ?? null;
    this.onPeerFound = config?.onPeerFound ?? null;
    this.onPeerLost = config?.onPeerLost ?? null;
  }

  async execute(action: ActionType, payload: unknown): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const p = payload as Record<string, unknown>;

    switch (action) {
      case 'network.startDiscovery':
        return this.startDiscovery(p);
      case 'network.stopDiscovery':
        return this.stopDiscovery();
      default:
        return {
          success: false,
          error: { code: 'UNSUPPORTED_ACTION', message: `NetworkDiscoveryService does not handle ${action}` },
        };
    }
  }

  private async startDiscovery(payload: Record<string, unknown>): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    if (!this.mdns) {
      return {
        success: false,
        error: { code: 'NO_MDNS', message: 'mDNS provider not available on this platform' },
      };
    }

    const serviceType = (payload.serviceType as string) ?? '_semblance-network._tcp.local.';

    await this.mdns.startDiscovery(
      (device) => this.onPeerFound?.(device),
      (deviceId) => this.onPeerLost?.(deviceId),
      serviceType,
    );

    return { success: true };
  }

  private async stopDiscovery(): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    if (!this.mdns) {
      return {
        success: false,
        error: { code: 'NO_MDNS', message: 'mDNS provider not available' },
      };
    }

    await this.mdns.stopDiscovery();
    return { success: true };
  }
}
