import { createConnection, type Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import type { ProcessSessionV1 } from '@semblance/protocol';
import {
  decodeRuntimeRpcMessage,
  encodeRuntimeRpcMessage,
  type RuntimeRpcResponse,
} from './framing.js';
import type { RuntimeIpcAuthFrame, RuntimeIpcAuthOkFrame } from './ipc-server.js';

export interface RuntimeIpcClient {
  call(method: string, params?: unknown): Promise<unknown>;
  close(): void;
}

export async function connectAuthenticatedIpcClient(
  socketPath: string,
  session: ProcessSessionV1,
): Promise<RuntimeIpcClient> {
  const socket: Socket = await new Promise((resolve, reject) => {
    const client = createConnection(socketPath);
    client.once('connect', () => resolve(client));
    client.once('error', reject);
  });

  const authFrame: RuntimeIpcAuthFrame = {
    type: 'auth',
    sessionId: session.sessionId,
  };

  await new Promise<void>((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    socket.write(encodeRuntimeRpcMessage({ id: 0, result: authFrame }));

    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk]);
      const decoded = decodeRuntimeRpcMessage(buffer);
      if (!decoded) {
        return;
      }

      socket.off('data', onData);
      const frame = decoded.message.result as RuntimeIpcAuthOkFrame | { type: 'auth-error'; message: string };
      if (!frame || frame.type !== 'auth-ok') {
        reject(new Error(frame && 'message' in frame ? frame.message : 'Authentication rejected'));
        return;
      }
      resolve();
    };

    socket.on('data', onData);
    socket.on('error', reject);
  });

  let nextId = 1;
  const pending = new Map<number | string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    let decoded = decodeRuntimeRpcMessage(buffer);
    while (decoded) {
      buffer = Buffer.from(decoded.remainder);
      const message = decoded.message as RuntimeRpcResponse;
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        if (message.error) {
          waiter.reject(new Error(`${message.error.code}: ${message.error.message}`));
        } else {
          waiter.resolve(message.result);
        }
      }
      decoded = decodeRuntimeRpcMessage(buffer);
    }
  });

  socket.on('error', (error) => {
    for (const waiter of pending.values()) {
      waiter.reject(error);
    }
    pending.clear();
  });

  return {
    async call(method: string, params?: unknown): Promise<unknown> {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.write(encodeRuntimeRpcMessage({ id, method, params }));
      });
    },
    close(): void {
      socket.destroy();
    },
  };
}

export function createInprocessIpcClient(session: ProcessSessionV1): RuntimeIpcClient {
  return {
    async call(method: string, params?: unknown): Promise<unknown> {
      return { method, params, sessionId: session.sessionId, transport: 'inprocess' };
    },
    close(): void {
      /* no-op for in-process transport */
    },
  };
}

export function createEphemeralSessionPublicKey(): string {
  return `ed25519:${randomUUID()}`;
}
