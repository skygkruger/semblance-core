import { randomUUID } from 'node:crypto';
import { createConnection, type Socket } from 'node:net';
import { ProcessHelloV1, type ProcessSessionV1, type ProcessType } from '@semblance/protocol';
import { decodeRuntimeRpcMessage, encodeRuntimeRpcMessage } from './framing.js';

export interface KernelHandshakeOptions {
  socketPath: string;
  processType: Extract<ProcessType, 'core' | 'gateway' | 'model'>;
  processId: string;
  buildHash: string;
  policyEpoch: number;
  sessionPublicKey?: string;
}

export interface KernelReadiness {
  protocolVersion: number;
  buildHash: string;
  policyEpoch: number;
  deviceId: string;
  registeredProcessTypes: string[];
}

async function kernelRpcCall(
  socketPath: string,
  method: string,
  params: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket: Socket = createConnection(socketPath);
    const request = encodeRuntimeRpcMessage({ id: randomUUID(), method, params });
    let buffer = Buffer.alloc(0);

    socket.on('connect', () => {
      socket.write(request);
    });

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const decoded = decodeRuntimeRpcMessage(buffer);
      if (decoded) {
        if (decoded.message.error) {
          socket.destroy();
          reject(new Error(`${decoded.message.error.code}: ${decoded.message.error.message}`));
          return;
        }
        const result = decoded.message.result;
        socket.end();
        socket.on('close', () => resolve(result));
      }
    });

    socket.on('error', reject);
  });
}

export async function queryKernelReadiness(socketPath: string): Promise<KernelReadiness> {
  const readiness = await kernelRpcCall(socketPath, 'kernel.readiness', {}) as KernelReadiness;
  return readiness;
}

export async function performKernelHandshake(
  options: KernelHandshakeOptions,
): Promise<ProcessSessionV1> {
  const hello = ProcessHelloV1.parse({
    protocolVersion: 1,
    processId: options.processId,
    processType: options.processType,
    buildHash: options.buildHash,
    nonce: `nonce-${randomUUID()}`,
  });

  const session = await kernelRpcCall(options.socketPath, 'kernel.hello', {
    hello,
    policyEpoch: options.policyEpoch,
    sessionPublicKey: options.sessionPublicKey ?? `ed25519:${options.processId}-session`,
  }) as ProcessSessionV1;

  return session;
}

export async function validateKernelSession(
  socketPath: string,
  sessionId: string,
): Promise<ProcessSessionV1> {
  const session = await kernelRpcCall(socketPath, 'kernel.validateSession', {
    sessionId,
  }) as ProcessSessionV1;
  return session;
}
