// Network Transport Service — Gateway adapter for peer-to-peer encrypted payload delivery.
// Wraps EncryptedSyncTransport for Semblance Network (Step 28).
//
// This is the Gateway side — it has network access.

import type { ServiceAdapter } from './types.js';
import type { ActionType } from '@semblance/core';

/**
 * Abstract transport interface for peer-to-peer communication.
 * Injected at construction — the Gateway holds the actual TCP implementation.
 */
export interface PeerTransport {
  sendPayload(peerId: string, ipAddress: string, port: number, payload: string): Promise<string | null>;
  startListening(port: number, handler: (payload: string) => Promise<string>): Promise<void>;
  stopListening(): Promise<void>;
}

/**
 * NetworkTransportService — Gateway service for peer-to-peer payload delivery.
 * Handles 'network.sendOffer', 'network.sendAcceptance', 'network.sendRevocation',
 * and 'network.syncContext' IPC actions.
 */
export class NetworkTransportService implements ServiceAdapter {
  private transport: PeerTransport | null;

  constructor(config?: { transport?: PeerTransport }) {
    this.transport = config?.transport ?? null;
  }

  async execute(action: ActionType, payload: unknown): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const p = payload as Record<string, unknown>;

    switch (action) {
      case 'network.sendOffer':
      case 'network.sendAcceptance':
      case 'network.sendRevocation':
      case 'network.syncContext':
        return this.sendToPeer(p);
      default:
        return {
          success: false,
          error: { code: 'UNSUPPORTED_ACTION', message: `NetworkTransportService does not handle ${action}` },
        };
    }
  }

  private async sendToPeer(payload: Record<string, unknown>): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    if (!this.transport) {
      return {
        success: false,
        error: { code: 'NO_TRANSPORT', message: 'Peer transport not available' },
      };
    }

    const peerId = payload.peerId as string;
    const ipAddress = payload.ipAddress as string;
    const port = payload.port as number;
    const data = payload.data as string;

    if (!peerId || !ipAddress || !port || !data) {
      return {
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'Missing peerId, ipAddress, port, or data' },
      };
    }

    const response = await this.transport.sendPayload(peerId, ipAddress, port, data);

    if (response === null) {
      return {
        success: false,
        error: { code: 'PEER_UNREACHABLE', message: `Could not reach peer ${peerId}` },
      };
    }

    return {
      success: true,
      data: { response },
    };
  }
}
