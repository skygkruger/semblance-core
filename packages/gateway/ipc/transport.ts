// IPC Transport — Local inter-process communication between Core and Gateway.
// Named pipe on Windows, Unix domain socket on macOS/Linux.
// Length-prefixed JSON messages: 4-byte big-endian length header + UTF-8 JSON payload.
// Single connection only. Gateway listens; Core connects as client.

import { createServer, type Server, type Socket } from 'node:net';
import { join } from 'node:path';
import { homedir, platform, userInfo } from 'node:os';
import { mkdirSync, existsSync, unlinkSync, chmodSync } from 'node:fs';

export interface TransportConfig {
  socketPath?: string;
  onMessage: (data: unknown) => Promise<unknown>;
  onError?: (error: Error) => void;
  onConnection?: () => void;
  onDisconnection?: () => void;
}

/**
 * Get the default socket path for the current platform.
 * SECURITY: Windows uses per-user pipe name to prevent cross-user access.
 * Unix uses a socket in the user's home directory with 0600 permissions.
 */
export function getDefaultSocketPath(): string {
  if (platform() === 'win32') {
    // Per-user pipe name — prevents other users from connecting to our pipe
    const uid = userInfo().uid;
    const userSuffix = uid >= 0 ? `-${uid}` : `-${userInfo().username}`;
    return `\\\\.\\pipe\\semblance-gateway${userSuffix}`;
  }
  const dir = join(homedir(), '.semblance');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, 'gateway.sock');
}

/**
 * Encode a message as a length-prefixed buffer.
 * Format: 4-byte big-endian length + UTF-8 JSON payload.
 */
export function encodeMessage(data: unknown): Buffer {
  const json = JSON.stringify(data);
  const payload = Buffer.from(json, 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

/**
 * Gateway IPC listener. Accepts a single connection from the Core process.
 */
export class GatewayTransport {
  private server: Server | null = null;
  private client: Socket | null = null;
  private socketPath: string;
  private onMessage: (data: unknown) => Promise<unknown>;
  private onError: (error: Error) => void;
  private onConnection: () => void;
  private onDisconnection: () => void;
  private buffer: Buffer = Buffer.alloc(0);

  constructor(config: TransportConfig) {
    this.socketPath = config.socketPath ?? getDefaultSocketPath();
    this.onMessage = config.onMessage;
    this.onError = config.onError ?? (() => {});
    this.onConnection = config.onConnection ?? (() => {});
    this.onDisconnection = config.onDisconnection ?? (() => {});
  }

  /**
   * Start listening for IPC connections.
   */
  async start(): Promise<void> {
    // Clean up stale socket file (Unix only)
    if (platform() !== 'win32' && existsSync(this.socketPath)) {
      unlinkSync(this.socketPath);
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => {
        // Single connection only — reject if already connected
        if (this.client) {
          socket.end();
          return;
        }

        this.client = socket;
        this.buffer = Buffer.alloc(0);
        this.onConnection();

        socket.on('data', (chunk: Buffer) => {
          this.buffer = Buffer.concat([this.buffer, chunk]);
          this.processBuffer(socket);
        });

        socket.on('close', () => {
          this.client = null;
          this.buffer = Buffer.alloc(0);
          this.onDisconnection();
        });

        socket.on('error', (err) => {
          this.onError(err);
        });
      });

      this.server.on('error', reject);

      this.server.listen(this.socketPath, () => {
        // SECURITY: Restrict socket file permissions to owner only (Unix).
        // Prevents other local users from connecting to the Gateway IPC.
        if (platform() !== 'win32') {
          try { chmodSync(this.socketPath, 0o600); } catch { /* best-effort */ }
        }
        resolve();
      });
    });
  }

  /**
   * Stop the IPC listener and clean up.
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.client) {
        this.client.destroy();
        this.client = null;
      }

      if (this.server) {
        this.server.close(() => {
          // Clean up socket file (Unix only)
          if (platform() !== 'win32' && existsSync(this.socketPath)) {
            try { unlinkSync(this.socketPath); } catch { /* ignore */ }
          }
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Check if a client is currently connected.
   */
  isConnected(): boolean {
    return this.client !== null;
  }

  /**
   * Process the internal buffer, extracting complete messages.
   */
  private processBuffer(socket: Socket): void {
    while (this.buffer.length >= 4) {
      const messageLength = this.buffer.readUInt32BE(0);

      // Guard against corrupt length values
      if (messageLength > 10_000_000) {
        this.onError(new Error(`Message too large: ${messageLength} bytes`));
        socket.destroy();
        return;
      }

      if (this.buffer.length < 4 + messageLength) {
        // Incomplete message — wait for more data
        return;
      }

      const jsonPayload = this.buffer.subarray(4, 4 + messageLength).toString('utf-8');
      this.buffer = this.buffer.subarray(4 + messageLength);

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonPayload);
      } catch {
        this.onError(new Error('Invalid JSON in IPC message'));
        continue;
      }

      // Process message and send response
      this.onMessage(parsed)
        .then((response) => {
          if (socket.writable) {
            socket.write(encodeMessage(response));
          }
        })
        .catch((err) => {
          this.onError(err instanceof Error ? err : new Error(String(err)));
        });
    }
  }
}
