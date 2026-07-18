import { describe, expect, it } from 'vitest';
import { ProcessHelloV1 } from '@semblance/protocol';
import { createMemoryKeyStore } from '../src/keys/memory-key-store.js';
import { createKernel } from '../src/main.js';
import { KernelError } from '../src/errors.js';

const BUILD_HASH = 'sha256:abc123def456';
const POLICY_EPOCH = 3;

async function issueSession(
  kernel: Awaited<ReturnType<typeof createKernel>>,
  nonce: string,
  expiresInMs = 60_000,
) {
  const hello = ProcessHelloV1.parse({
    protocolVersion: 1,
    processId: 'core-01HXYZ',
    processType: 'core',
    buildHash: BUILD_HASH,
    nonce,
  });

  return kernel.ipc.handleProcessHello({
    hello,
    policyEpoch: POLICY_EPOCH,
    sessionPublicKey: 'ed25519:test-session-pub',
    sessionTtlMs: expiresInMs,
  });
}

describe('kernel session lifecycle', () => {
  it('rejects replayed nonce', async () => {
    const kernel = await createKernel({
      keyStore: createMemoryKeyStore(),
      buildHash: BUILD_HASH,
      policyEpoch: POLICY_EPOCH,
    });

    const nonce = `nonce-${crypto.randomUUID()}`;
    await issueSession(kernel, nonce);

    await expect(issueSession(kernel, nonce)).rejects.toMatchObject({
      code: 'REPLAYED_NONCE',
    } satisfies Partial<KernelError>);
  });

  it('rejects expired session validation', async () => {
    const kernel = await createKernel({
      keyStore: createMemoryKeyStore(),
      buildHash: BUILD_HASH,
      policyEpoch: POLICY_EPOCH,
    });

    const session = await issueSession(kernel, `nonce-${crypto.randomUUID()}`, 1);
    await new Promise((resolve) => setTimeout(resolve, 5));

    await expect(kernel.ipc.validateSession(session.sessionId)).rejects.toMatchObject({
      code: 'EXPIRED_SESSION',
    } satisfies Partial<KernelError>);
  });

  it('accepts a non-expired session', async () => {
    const kernel = await createKernel({
      keyStore: createMemoryKeyStore(),
      buildHash: BUILD_HASH,
      policyEpoch: POLICY_EPOCH,
    });

    const session = await issueSession(kernel, `nonce-${crypto.randomUUID()}`);
    const validated = await kernel.ipc.validateSession(session.sessionId);

    expect(validated.sessionId).toBe(session.sessionId);
    expect(validated.processId).toBe(session.processId);
  });
});
