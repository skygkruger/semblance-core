// IPC Client — Core's side of the IPC connection to the Gateway.
// Signs requests using HMAC-SHA256 before sending through the transport layer.
// Supports both socket-based (desktop) and in-process (mobile) transports.
// Does NOT import from packages/gateway/ — uses only shared types from core/types/.

import { nanoid } from 'nanoid';
import { signRequest } from '../types/signing.js';
import type { ActionType, ActionResponse } from '../types/ipc.js';
import type { IPCTransport } from '../ipc/transport.js';

export interface IPCClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  sendAction(action: ActionType, payload: Record<string, unknown>): Promise<ActionResponse>;
}

/**
 * Legacy config — creates a SocketTransport internally.
 * Used by desktop where Core connects to Gateway via Unix socket / named pipe.
 */
export interface IPCClientConfig {
  socketPath: string;
  signingKeyPath: string;
}

/**
 * Transport-based config — accepts any IPCTransport implementation.
 * Used by mobile (InProcessTransport) or tests (mock transports).
 */
export interface IPCClientTransportConfig {
  transport: IPCTransport;
  signingKey: Buffer;
}

export class CoreIPCClient implements IPCClient {
  private transport: IPCTransport | null = null;
  private signingKey: Buffer | null = null;

  // Legacy socket config (if provided)
  private socketPath: string | null = null;
  private signingKeyPath: string | null = null;

  // Transport config (if provided)
  private providedTransport: IPCTransport | null = null;

  constructor(config: IPCClientConfig | IPCClientTransportConfig) {
    if ('transport' in config) {
      // Transport-based config: transport and key provided directly
      this.providedTransport = config.transport;
      this.signingKey = config.signingKey;
    } else {
      // Legacy config: socket path and signing key file path
      this.socketPath = config.socketPath;
      this.signingKeyPath = config.signingKeyPath;
    }
  }

  async connect(): Promise<void> {
    if (this.providedTransport) {
      // Transport-based: just start the transport
      this.transport = this.providedTransport;
      await this.transport.start();
      return;
    }

    // Legacy: load signing key from file, create SocketTransport
    try {
      const keyHex = (await import('../platform/index.js')).getPlatform().fs.readFileSync(this.signingKeyPath!, 'utf-8').trim();
      this.signingKey = Buffer.from(keyHex, 'hex');
    } catch (err) {
      throw new Error(
        `[IPCClient] Failed to read signing key from ${this.signingKeyPath}: ` +
        (err instanceof Error ? err.message : String(err))
      );
    }

    // Dynamically import SocketTransport to avoid node:net dependency on mobile
    const { SocketTransport } = await import('../ipc/socket-transport.js');
    this.transport = new SocketTransport({ socketPath: this.socketPath! });
    await this.transport.start();
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.stop();
      this.transport = null;
    }
  }

  isConnected(): boolean {
    return this.transport?.isReady() ?? false;
  }

  async sendAction(action: ActionType, payload: Record<string, unknown>): Promise<ActionResponse> {
    if (!this.signingKey) {
      throw new Error('[IPCClient] No signing key available. Call connect() first.');
    }
    if (!this.transport || !this.transport.isReady()) {
      throw new Error('[IPCClient] Not connected. Call connect() first.');
    }

    const id = nanoid();
    const timestamp = new Date().toISOString();
    const signature = signRequest(this.signingKey, id, timestamp, action, payload);

    const request = {
      id,
      timestamp,
      action,
      payload,
      source: 'core' as const,
      signature,
    };

    return this.transport.send(request);
  }
}
