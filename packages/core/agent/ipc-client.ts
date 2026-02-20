// IPC Client — Core's side of the IPC connection to the Gateway.
// Connects to the Gateway's named pipe / Unix domain socket.
// Signs requests using HMAC-SHA256 before sending.
// Does NOT import from packages/gateway/ — uses only shared types from core/types/.

import { createConnection, type Socket } from 'node:net';
import { readFileSync } from 'node:fs';
import { nanoid } from 'nanoid';
import { signRequest } from '../types/signing.js';
import type { ActionType, ActionResponse } from '../types/ipc.js';

export interface IPCClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  sendAction(action: ActionType, payload: Record<string, unknown>): Promise<ActionResponse>;
}

export interface IPCClientConfig {
  socketPath: string;
  signingKeyPath: string;
}

/**
 * Encode a message as a length-prefixed buffer.
 * Same protocol as Gateway: 4-byte big-endian length + UTF-8 JSON payload.
 */
function encodeMessage(data: unknown): Buffer {
  const json = JSON.stringify(data);
  const payload = Buffer.from(json, 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

export class CoreIPCClient implements IPCClient {
  private socket: Socket | null = null;
  private socketPath: string;
  private signingKey: Buffer | null = null;
  private signingKeyPath: string;
  private buffer: Buffer = Buffer.alloc(0);
  private pendingRequests: Map<string, {
    resolve: (response: ActionResponse) => void;
    reject: (error: Error) => void;
  }> = new Map();

  constructor(config: IPCClientConfig) {
    this.socketPath = config.socketPath;
    this.signingKeyPath = config.signingKeyPath;
  }

  async connect(): Promise<void> {
    // Load signing key
    try {
      const keyHex = readFileSync(this.signingKeyPath, 'utf-8').trim();
      this.signingKey = Buffer.from(keyHex, 'hex');
    } catch (err) {
      throw new Error(
        `[IPCClient] Failed to read signing key from ${this.signingKeyPath}: ` +
        (err instanceof Error ? err.message : String(err))
      );
    }

    return new Promise((resolve, reject) => {
      this.socket = createConnection(this.socketPath, () => {
        resolve();
      });

      this.socket.on('data', (chunk: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this.processBuffer();
      });

      this.socket.on('error', (err) => {
        // If we haven't connected yet, reject the connect promise
        if (!this.socket?.connecting) {
          // Post-connection error — reject any pending requests
          for (const [, pending] of this.pendingRequests) {
            pending.reject(new Error(`IPC connection error: ${err.message}`));
          }
          this.pendingRequests.clear();
        } else {
          reject(new Error(`[IPCClient] Connection failed: ${err.message}`));
        }
      });

      this.socket.on('close', () => {
        // Reject any pending requests
        for (const [, pending] of this.pendingRequests) {
          pending.reject(new Error('IPC connection closed'));
        }
        this.pendingRequests.clear();
        this.socket = null;
        this.buffer = Buffer.alloc(0);
      });
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve();
        return;
      }
      this.socket.end(() => {
        this.socket = null;
        resolve();
      });
    });
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  async sendAction(action: ActionType, payload: Record<string, unknown>): Promise<ActionResponse> {
    if (!this.socket || !this.signingKey) {
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

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const encoded = encodeMessage(request);
      this.socket!.write(encoded, (err) => {
        if (err) {
          this.pendingRequests.delete(id);
          reject(new Error(`[IPCClient] Write failed: ${err.message}`));
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`[IPCClient] Request ${id} timed out after 30s`));
        }
      }, 30_000);
    });
  }

  /**
   * Process the internal buffer, extracting complete responses.
   */
  private processBuffer(): void {
    while (this.buffer.length >= 4) {
      const messageLength = this.buffer.readUInt32BE(0);

      if (messageLength > 10_000_000) {
        // Corrupt message — disconnect
        this.socket?.destroy();
        return;
      }

      if (this.buffer.length < 4 + messageLength) {
        return; // Incomplete message
      }

      const jsonPayload = this.buffer.subarray(4, 4 + messageLength).toString('utf-8');
      this.buffer = this.buffer.subarray(4 + messageLength);

      let parsed: ActionResponse;
      try {
        parsed = JSON.parse(jsonPayload) as ActionResponse;
      } catch {
        continue; // Invalid JSON — skip
      }

      // Route response to the pending request
      const pending = this.pendingRequests.get(parsed.requestId);
      if (pending) {
        this.pendingRequests.delete(parsed.requestId);
        pending.resolve(parsed);
      }
    }
  }
}
