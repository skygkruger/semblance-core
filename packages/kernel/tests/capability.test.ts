import { describe, expect, it } from 'vitest';
import { CapabilityGrantV1, ProcessHelloV1 } from '@semblance/protocol';
import { createMemoryKeyStore } from '../src/keys/memory-key-store.js';
import { createKernel } from '../src/main.js';
import { KernelError } from '../src/errors.js';

const BUILD_HASH = 'sha256:abc123def456';
const POLICY_EPOCH = 3;

describe('kernel capability issuance', () => {
  it('issues a capability grant only for a valid session', async () => {
    const kernel = await createKernel({
      keyStore: createMemoryKeyStore(),
      buildHash: BUILD_HASH,
      policyEpoch: POLICY_EPOCH,
    });

    const hello = ProcessHelloV1.parse({
      protocolVersion: 1,
      processId: 'core-01HXYZ',
      processType: 'core',
      buildHash: BUILD_HASH,
      nonce: `nonce-${crypto.randomUUID()}`,
    });

    const session = await kernel.ipc.handleProcessHello({
      hello,
      policyEpoch: POLICY_EPOCH,
      sessionPublicKey: 'ed25519:test-session-pub',
    });

    const grant = await kernel.ipc.issueCapability({
      sessionId: session.sessionId,
      workflowId: 'wf-inbox-triage',
      executionDestination: 'gateway',
      resource: 'gateway',
      operations: ['email.fetch'],
      purpose: 'Fetch inbox messages for triage',
      constraints: { resultLimit: 50 },
      capabilityTtlMs: 300_000,
    });

    expect(CapabilityGrantV1.parse(grant)).toMatchObject({
      sessionId: session.sessionId,
      processId: session.processId,
      deviceId: session.deviceId,
      policyEpoch: POLICY_EPOCH,
      resource: 'gateway',
    });
    expect(grant.signature).toMatch(/^ed25519:/);
  });

  it('rejects capability issuance for unknown session', async () => {
    const kernel = await createKernel({
      keyStore: createMemoryKeyStore(),
      buildHash: BUILD_HASH,
      policyEpoch: POLICY_EPOCH,
    });

    await expect(
      kernel.ipc.issueCapability({
        sessionId: 'session-does-not-exist',
        workflowId: 'wf-inbox-triage',
        executionDestination: 'gateway',
        resource: 'gateway',
        operations: ['email.fetch'],
        purpose: 'Fetch inbox messages for triage',
        constraints: {},
        capabilityTtlMs: 300_000,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_SESSION',
    } satisfies Partial<KernelError>);
  });

  it('rejects capability issuance for expired session', async () => {
    const kernel = await createKernel({
      keyStore: createMemoryKeyStore(),
      buildHash: BUILD_HASH,
      policyEpoch: POLICY_EPOCH,
    });

    const hello = ProcessHelloV1.parse({
      protocolVersion: 1,
      processId: 'core-01HXYZ',
      processType: 'core',
      buildHash: BUILD_HASH,
      nonce: `nonce-${crypto.randomUUID()}`,
    });

    const session = await kernel.ipc.handleProcessHello({
      hello,
      policyEpoch: POLICY_EPOCH,
      sessionPublicKey: 'ed25519:test-session-pub',
      sessionTtlMs: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    await expect(
      kernel.ipc.issueCapability({
        sessionId: session.sessionId,
        workflowId: 'wf-inbox-triage',
        executionDestination: 'gateway',
        resource: 'gateway',
        operations: ['email.fetch'],
        purpose: 'Fetch inbox messages for triage',
        constraints: {},
        capabilityTtlMs: 300_000,
      }),
    ).rejects.toMatchObject({
      code: 'EXPIRED_SESSION',
    } satisfies Partial<KernelError>);
  });
});
