import { chmodSync, existsSync, unlinkSync } from 'node:fs';
import { createServer as createNetServer, type Server as NetServer, type Socket as NetSocket } from 'node:net';
import { platform } from 'node:os';
import { KernelError } from '../errors.js';

export interface KernelRpcRequest {
  id: number | string;
  method: string;
  params?: unknown;
}

export interface KernelRpcError {
  code: string;
  message: string;
}

export interface KernelRpcResponse {
  id: number | string;
  result?: unknown;
  error?: KernelRpcError;
}

export type KernelRpcHandler = (params: unknown) => Promise<unknown>;

export interface KernelSocketServerConfig {
  socketPath: string;
  handlers: Record<string, KernelRpcHandler>;
}

export interface KernelSocketServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly socketPath: string;
}

function encodeMessage(data: unknown): Buffer {
  const json = JSON.stringify(data);
  const payload = Buffer.from(json, 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

function rpcErrorFromUnknown(error: unknown): KernelRpcError {
  if (error instanceof KernelError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { code: 'INTERNAL_ERROR', message: error.message };
  }
  return { code: 'INTERNAL_ERROR', message: String(error) };
}

function isRpcRequest(value: unknown): value is KernelRpcRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    (typeof record.id === 'number' || typeof record.id === 'string')
    && typeof record.method === 'string'
  );
}

class KernelSocketServerImpl implements KernelSocketServer {
  readonly socketPath: string;
  private readonly handlers: Record<string, KernelRpcHandler>;
  private server: NetServer | null = null;
  private client: NetSocket | null = null;
  private buffer: Buffer = Buffer.alloc(0);

  constructor(config: KernelSocketServerConfig) {
    this.socketPath = config.socketPath;
    this.handlers = config.handlers;
  }

  async start(): Promise<void> {
    if (platform() !== 'win32' && existsSync(this.socketPath)) {
      unlinkSync(this.socketPath);
    }

    await new Promise<void>((resolve, reject) => {
      this.server = createNetServer((socket) => {
        if (this.client) {
          socket.end();
          return;
        }

        this.client = socket;
        this.buffer = Buffer.alloc(0);

        socket.on('data', (chunk: Buffer) => {
          this.buffer = Buffer.concat([this.buffer, chunk]);
          void this.processBuffer(socket);
        });

        socket.on('close', () => {
          this.client = null;
          this.buffer = Buffer.alloc(0);
        });

        socket.on('error', () => {
          this.client = null;
          this.buffer = Buffer.alloc(0);
        });
      });

      this.server.on('error', reject);

      this.server.listen(this.socketPath, () => {
        if (platform() !== 'win32') {
          try {
            chmodSync(this.socketPath, 0o600);
          } catch {
            // Best effort on platforms without chmod semantics.
          }
        }
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.client) {
        this.client.destroy();
        this.client = null;
      }

      if (!this.server) {
        resolve();
        return;
      }

      this.server.close(() => {
        if (platform() !== 'win32' && existsSync(this.socketPath)) {
          try {
            unlinkSync(this.socketPath);
          } catch {
            // Ignore cleanup errors during shutdown.
          }
        }
        this.server = null;
        resolve();
      });
    });
  }

  private async processBuffer(socket: NetSocket): Promise<void> {
    while (this.buffer.length >= 4) {
      const messageLength = this.buffer.readUInt32BE(0);
      if (messageLength > 10_000_000) {
        socket.destroy();
        return;
      }

      if (this.buffer.length < 4 + messageLength) {
        return;
      }

      const jsonPayload = this.buffer.subarray(4, 4 + messageLength).toString('utf-8');
      this.buffer = this.buffer.subarray(4 + messageLength);

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonPayload) as unknown;
      } catch {
        continue;
      }

      if (!isRpcRequest(parsed)) {
        continue;
      }

      const handler = this.handlers[parsed.method];
      if (!handler) {
        socket.write(
          encodeMessage({
            id: parsed.id,
            error: { code: 'METHOD_NOT_FOUND', message: `Unknown method "${parsed.method}"` },
          } satisfies KernelRpcResponse),
        );
        continue;
      }

      try {
        const result = await handler(parsed.params ?? {});
        socket.write(
          encodeMessage({
            id: parsed.id,
            result,
          } satisfies KernelRpcResponse),
        );
      } catch (error) {
        socket.write(
          encodeMessage({
            id: parsed.id,
            error: rpcErrorFromUnknown(error),
          } satisfies KernelRpcResponse),
        );
      }
    }
  }
}

export function createKernelSocketServer(config: KernelSocketServerConfig): KernelSocketServer {
  return new KernelSocketServerImpl(config);
}

/** Encode a length-prefixed RPC message for kernel socket clients (tests / host). */
export function encodeKernelRpcMessage(data: unknown): Buffer {
  return encodeMessage(data);
}

/** Decode one length-prefixed RPC message from a buffer; returns remainder. */
export function decodeKernelRpcMessage(buffer: Buffer): { message: KernelRpcResponse; remainder: Buffer } | null {
  if (buffer.length < 4) {
    return null;
  }

  const messageLength = buffer.readUInt32BE(0);
  if (buffer.length < 4 + messageLength) {
    return null;
  }

  const jsonPayload = buffer.subarray(4, 4 + messageLength).toString('utf-8');
  const remainder = buffer.subarray(4 + messageLength);
  return {
    message: JSON.parse(jsonPayload) as KernelRpcResponse,
    remainder,
  };
}
