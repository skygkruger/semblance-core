import { chmodSync, existsSync, unlinkSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { platform } from 'node:os';
import type { ProcessSessionV1 } from '@semblance/protocol';
import { decodeRuntimeRpcMessage, encodeRuntimeRpcMessage, type RuntimeRpcResponse } from './framing.js';
import { validateKernelSession } from './kernel-client.js';

export interface RuntimeIpcAuthFrame {
  type: 'auth';
  sessionId: string;
}

export interface RuntimeIpcAuthOkFrame {
  type: 'auth-ok';
  peerProcessType: string;
}

export interface RuntimeIpcAuthErrorFrame {
  type: 'auth-error';
  message: string;
}

export type RuntimeIpcServerHandler = (params: unknown, peer: ProcessSessionV1) => Promise<unknown>;

export interface RuntimeIpcServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly socketPath: string;
}

export interface RuntimeIpcServerConfig {
  socketPath: string;
  kernelSocketPath: string;
  expectedPeerType: 'gateway' | 'core';
  handlers: Record<string, RuntimeIpcServerHandler>;
}

function writeFrame(socket: Socket, payload: unknown): void {
  socket.write(encodeRuntimeRpcMessage(payload));
}

async function authenticatePeer(
  socket: Socket,
  kernelSocketPath: string,
  expectedPeerType: 'gateway' | 'core',
): Promise<ProcessSessionV1> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);

    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk]);
      const decoded = decodeRuntimeRpcMessage(buffer);
      if (!decoded) {
        return;
      }

      socket.off('data', onData);

      const frame = decoded.message.result as RuntimeIpcAuthFrame | undefined;
      if (!frame || frame.type !== 'auth' || typeof frame.sessionId !== 'string') {
        reject(new Error('Peer did not send auth frame'));
        return;
      }

      void (async () => {
        try {
          const session = await validateKernelSession(kernelSocketPath, frame.sessionId);
          if (session.processType !== expectedPeerType) {
            const errorFrame: RuntimeIpcAuthErrorFrame = {
              type: 'auth-error',
              message: `Expected peer type ${expectedPeerType}, got ${session.processType}`,
            };
            writeFrame(socket, { id: 0, result: errorFrame });
            reject(new Error(errorFrame.message));
            return;
          }

          const okFrame: RuntimeIpcAuthOkFrame = {
            type: 'auth-ok',
            peerProcessType: session.processType,
          };
          writeFrame(socket, { id: 0, result: okFrame });
          resolve(session);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          writeFrame(socket, { id: 0, result: { type: 'auth-error', message } satisfies RuntimeIpcAuthErrorFrame });
          reject(error);
        }
      })();
    };

    socket.on('data', onData);
    socket.on('error', reject);
  });
}

class RuntimeIpcServerImpl implements RuntimeIpcServer {
  readonly socketPath: string;
  private readonly kernelSocketPath: string;
  private readonly expectedPeerType: 'gateway' | 'core';
  private readonly handlers: Record<string, RuntimeIpcServerHandler>;
  private server: Server | null = null;
  private peerSession: ProcessSessionV1 | null = null;

  constructor(config: RuntimeIpcServerConfig) {
    this.socketPath = config.socketPath;
    this.kernelSocketPath = config.kernelSocketPath;
    this.expectedPeerType = config.expectedPeerType;
    this.handlers = config.handlers;
  }

  async start(): Promise<void> {
    if (platform() !== 'win32' && existsSync(this.socketPath)) {
      unlinkSync(this.socketPath);
    }

    await new Promise<void>((resolve, reject) => {
      this.server = createServer((socket) => {
        void this.handleConnection(socket);
      });

      this.server.on('error', reject);
      this.server.listen(this.socketPath, () => {
        if (platform() !== 'win32') {
          chmodSync(this.socketPath, 0o600);
        }
        resolve();
      });
    });
  }

  private async handleConnection(socket: Socket): Promise<void> {
    try {
      this.peerSession = await authenticatePeer(socket, this.kernelSocketPath, this.expectedPeerType);
      let buffer = Buffer.alloc(0);

      socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        let decoded = decodeRuntimeRpcMessage(buffer);
        while (decoded) {
          buffer = Buffer.from(decoded.remainder);
          void this.dispatchRpc(socket, decoded.message, this.peerSession!);
          decoded = decodeRuntimeRpcMessage(buffer);
        }
      });
    } catch (error) {
      socket.destroy();
    }
  }

  private async dispatchRpc(
    socket: Socket,
    request: { id: number | string; method?: string; params?: unknown },
    peer: ProcessSessionV1,
  ): Promise<void> {
    if (typeof request.method !== 'string') {
      return;
    }

    const handler = this.handlers[request.method];
    if (!handler) {
      const response: RuntimeRpcResponse = {
        id: request.id,
        error: { code: 'METHOD_NOT_FOUND', message: `Unknown method "${request.method}"` },
      };
      writeFrame(socket, response);
      return;
    }

    try {
      const result = await handler(request.params ?? {}, peer);
      writeFrame(socket, { id: request.id, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeFrame(socket, {
        id: request.id,
        error: { code: 'INTERNAL_ERROR', message },
      });
    }
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });

    if (platform() !== 'win32' && existsSync(this.socketPath)) {
      unlinkSync(this.socketPath);
    }
    this.server = null;
    this.peerSession = null;
  }
}

export function createRuntimeIpcServer(config: RuntimeIpcServerConfig): RuntimeIpcServer {
  return new RuntimeIpcServerImpl(config);
}

export function createInprocessTransportPair(): {
  coreSocketPath: string;
  gatewayConnectPath: string;
} {
  const id = `${process.pid}-${Date.now()}`;
  const base = platform() === 'win32'
    ? `\\\\.\\pipe\\semblance-inprocess-${id}`
    : `/tmp/semblance-inprocess-${id}.sock`;
  return {
    coreSocketPath: base,
    gatewayConnectPath: base,
  };
}
