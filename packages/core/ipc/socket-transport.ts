// SocketTransport — Desktop IPC transport using Unix domain socket / named pipe.
// Wraps the existing length-prefixed JSON protocol.
// This file uses node:net — it is NOT safe for React Native / mobile.

import { createConnection, type Socket } from 'node:net';
import type { ActionRequest, ActionResponse } from '../types/ipc.js';
import type { IPCTransport } from './transport.js';

export interface SocketTransportConfig {
  /** Path to the Unix domain socket or Windows named pipe. */
  socketPath: string;
  /** Connection timeout in milliseconds. Default: 5000. */
  connectTimeoutMs?: number;
  /** Request timeout in milliseconds. Default: 30000. */
  requestTimeoutMs?: number;
}

/**
 * Encode a message as a length-prefixed buffer.
 * Format: 4-byte big-endian length + UTF-8 JSON payload.
 */
function encodeMessage(data: unknown): Buffer {
  const json = JSON.stringify(data);
  const payload = Buffer.from(json, 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

/**
 * SocketTransport — Sends ActionRequests over a Unix domain socket / named pipe.
 * Used on desktop where Core and Gateway run as separate processes.
 * Preserves the existing length-prefixed JSON framing protocol.
 */
export class SocketTransport implements IPCTransport {
  private socket: Socket | null = null;
  private socketPath: string;
  private connectTimeoutMs: number;
  private requestTimeoutMs: number;
  private buffer: Buffer = Buffer.alloc(0);
  private pendingRequests: Map<string, {
    resolve: (response: ActionResponse) => void;
    reject: (error: Error) => void;
  }> = new Map();

  constructor(config: SocketTransportConfig) {
    this.socketPath = config.socketPath;
    this.connectTimeoutMs = config.connectTimeoutMs ?? 5000;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 30_000;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`[SocketTransport] Connection timed out after ${this.connectTimeoutMs}ms`));
      }, this.connectTimeoutMs);

      this.socket = createConnection(this.socketPath, () => {
        clearTimeout(timeout);
        resolve();
      });

      this.socket.on('data', (chunk: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this.processBuffer();
      });

      this.socket.on('error', (err) => {
        clearTimeout(timeout);
        if (this.socket && !this.socket.connecting) {
          // Post-connection error — reject any pending requests
          for (const [, pending] of this.pendingRequests) {
            pending.reject(new Error(`IPC connection error: ${err.message}`));
          }
          this.pendingRequests.clear();
        } else {
          reject(new Error(`[SocketTransport] Connection failed: ${err.message}`));
        }
      });

      this.socket.on('close', () => {
        for (const [, pending] of this.pendingRequests) {
          pending.reject(new Error('IPC connection closed'));
        }
        this.pendingRequests.clear();
        this.socket = null;
        this.buffer = Buffer.alloc(0);
      });
    });
  }

  async stop(): Promise<void> {
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

  isReady(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  async send(request: ActionRequest): Promise<ActionResponse> {
    if (!this.socket) {
      throw new Error('[SocketTransport] Not connected. Call start() first.');
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(request.id, { resolve, reject });

      const encoded = encodeMessage(request);
      this.socket!.write(encoded, (err) => {
        if (err) {
          this.pendingRequests.delete(request.id);
          reject(new Error(`[SocketTransport] Write failed: ${err.message}`));
        }
      });

      // Timeout for this request
      setTimeout(() => {
        if (this.pendingRequests.has(request.id)) {
          this.pendingRequests.delete(request.id);
          reject(new Error(`[SocketTransport] Request ${request.id} timed out after ${this.requestTimeoutMs}ms`));
        }
      }, this.requestTimeoutMs);
    });
  }

  /**
   * Process the internal buffer, extracting complete length-prefixed JSON messages.
   */
  private processBuffer(): void {
    while (this.buffer.length >= 4) {
      const messageLength = this.buffer.readUInt32BE(0);

      // Guard against corrupt length values
      if (messageLength > 10_000_000) {
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
