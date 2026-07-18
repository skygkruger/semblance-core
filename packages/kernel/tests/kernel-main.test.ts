import { createConnection, type Socket } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { ProcessHelloV1 } from '@semblance/protocol';
import {
  bootKernelMain,
  type KernelMainRuntime,
} from '../src/bin/kernel-main.js';
import {
  decodeKernelRpcMessage,
  encodeKernelRpcMessage,
} from '../src/ipc/socket-server.js';

const BUILD_HASH = 'sha256:kernel-main-test';
const POLICY_EPOCH = 4;

async function rpcCall(
  socketPath: string,
  method: string,
  params: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket: Socket = createConnection(socketPath);
    const request = encodeKernelRpcMessage({ id: 42, method, params });
    let buffer = Buffer.alloc(0);

    socket.on('connect', () => {
      socket.write(request);
    });

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const decoded = decodeKernelRpcMessage(buffer);
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

describe('kernel-main readiness protocol', () => {
  let runtime: KernelMainRuntime | null = null;

  afterEach(async () => {
    if (runtime) {
      await runtime.server.stop();
      runtime = null;
    }
  });

  it('serves kernel.readiness over the Unix domain socket', async () => {
    const socketDir = mkdtempSync(join(tmpdir(), 'semblance-kernel-test-'));
    const socketPath = join(socketDir, 'kernel.sock');

    runtime = await bootKernelMain({
      buildHash: BUILD_HASH,
      policyEpoch: POLICY_EPOCH,
      socketPath,
    });

    const readiness = await rpcCall(socketPath, 'kernel.readiness', {}) as {
      protocolVersion: number;
      buildHash: string;
      policyEpoch: number;
      deviceId: string;
      registeredProcessTypes: string[];
    };

    expect(readiness.protocolVersion).toBe(1);
    expect(readiness.buildHash).toBe(BUILD_HASH);
    expect(readiness.policyEpoch).toBe(POLICY_EPOCH);
    expect(readiness.deviceId.length).toBeGreaterThan(0);
    expect(readiness.registeredProcessTypes).toContain('kernel');
  });

  it('serves kernel.hello handshake over the Unix domain socket', async () => {
    const socketDir = mkdtempSync(join(tmpdir(), 'semblance-kernel-test-'));
    const socketPath = join(socketDir, 'kernel.sock');

    runtime = await bootKernelMain({
      buildHash: BUILD_HASH,
      policyEpoch: POLICY_EPOCH,
      socketPath,
    });

    const hello = ProcessHelloV1.parse({
      protocolVersion: 1,
      processId: 'host-supervisor-test',
      processType: 'core',
      buildHash: BUILD_HASH,
      nonce: `nonce-${crypto.randomUUID()}`,
    });

    const session = await rpcCall(socketPath, 'kernel.hello', {
      hello,
      policyEpoch: POLICY_EPOCH,
      sessionPublicKey: 'ed25519:test-session-pub',
    }) as { sessionId: string; kernelSignature: string };

    expect(session.sessionId).toMatch(/^session-/);
    expect(session.kernelSignature).toMatch(/^ed25519:/);
  });

  it('serves kernel.validateSession over the Unix domain socket', async () => {
    const socketDir = mkdtempSync(join(tmpdir(), 'semblance-kernel-test-'));
    const socketPath = join(socketDir, 'kernel.sock');

    runtime = await bootKernelMain({
      buildHash: BUILD_HASH,
      policyEpoch: POLICY_EPOCH,
      socketPath,
    });

    const hello = ProcessHelloV1.parse({
      protocolVersion: 1,
      processId: 'gateway-validate-test',
      processType: 'gateway',
      buildHash: BUILD_HASH,
      nonce: `nonce-${crypto.randomUUID()}`,
    });

    const session = await rpcCall(socketPath, 'kernel.hello', {
      hello,
      policyEpoch: POLICY_EPOCH,
      sessionPublicKey: 'ed25519:validate-session-pub',
    }) as { sessionId: string };

    const validated = await rpcCall(socketPath, 'kernel.validateSession', {
      sessionId: session.sessionId,
    }) as { sessionId: string; processType: string };

    expect(validated.sessionId).toBe(session.sessionId);
    expect(validated.processType).toBe('gateway');
  });
});
