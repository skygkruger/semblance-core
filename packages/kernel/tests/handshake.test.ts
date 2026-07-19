import { describe, expect, it } from 'vitest';
import { ProcessHelloV1 } from '@semblance/protocol';
import { createMemoryKeyStore } from '../src/keys/memory-key-store.js';
import { createKernel } from '../src/main.js';
import { KernelError } from '../src/errors.js';

const BUILD_HASH = 'sha256:abc123def456';
const POLICY_EPOCH = 3;

function validHello(overrides: Partial<ReturnType<typeof baseHello>> = {}) {
  return { ...baseHello(), ...overrides };
}

function baseHello() {
  return ProcessHelloV1.parse({
    protocolVersion: 1,
    processId: 'core-01HXYZ',
    processType: 'core',
    buildHash: BUILD_HASH,
    nonce: `nonce-${crypto.randomUUID()}`,
  });
}

describe('kernel handshake', () => {
  it('rejects unknown process types', async () => {
    const kernel = await createKernel({
      keyStore: createMemoryKeyStore(),
      buildHash: BUILD_HASH,
      policyEpoch: POLICY_EPOCH,
    });

    await expect(
      kernel.ipc.handleProcessHello({
        hello: validHello({ processType: 'vault' }),
        policyEpoch: POLICY_EPOCH,
        sessionPublicKey: 'ed25519:test-session-pub',
      }),
    ).rejects.toMatchObject({
      code: 'UNKNOWN_PROCESS',
    } satisfies Partial<KernelError>);
  });

  it('rejects wrong build hash', async () => {
    const kernel = await createKernel({
      keyStore: createMemoryKeyStore(),
      buildHash: BUILD_HASH,
      policyEpoch: POLICY_EPOCH,
    });

    await expect(
      kernel.ipc.handleProcessHello({
        hello: validHello({ buildHash: 'sha256:wrong' }),
        policyEpoch: POLICY_EPOCH,
        sessionPublicKey: 'ed25519:test-session-pub',
      }),
    ).rejects.toMatchObject({
      code: 'BUILD_HASH_MISMATCH',
    } satisfies Partial<KernelError>);
  });

  it('rejects lower policy epoch than kernel', async () => {
    const kernel = await createKernel({
      keyStore: createMemoryKeyStore(),
      buildHash: BUILD_HASH,
      policyEpoch: POLICY_EPOCH,
    });

    await expect(
      kernel.ipc.handleProcessHello({
        hello: validHello(),
        policyEpoch: POLICY_EPOCH - 1,
        sessionPublicKey: 'ed25519:test-session-pub',
      }),
    ).rejects.toMatchObject({
      code: 'POLICY_EPOCH_STALE',
    } satisfies Partial<KernelError>);
  });

  it('issues a signed session for a valid hello', async () => {
    const kernel = await createKernel({
      keyStore: createMemoryKeyStore(),
      buildHash: BUILD_HASH,
      policyEpoch: POLICY_EPOCH,
    });

    const hello = validHello();
    const session = await kernel.ipc.handleProcessHello({
      hello,
      policyEpoch: POLICY_EPOCH,
      sessionPublicKey: 'ed25519:test-session-pub',
    });

    expect(session.protocolVersion).toBe(1);
    expect(session.helloNonce).toBe(hello.nonce);
    expect(session.processId).toBe(hello.processId);
    expect(session.buildHash).toBe(BUILD_HASH);
    expect(session.policyEpoch).toBe(POLICY_EPOCH);
    expect(session.kernelSignature).toMatch(/^ed25519:/);
    expect(session.deviceId.length).toBeGreaterThan(0);
    expect(session.principalId.length).toBeGreaterThan(0);
  });
});
