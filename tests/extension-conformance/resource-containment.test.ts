import { describe, expect, it } from 'vitest';
import { SandboxViolationError, createExtensionSandbox } from '@semblance/extension-runner';

describe('extension conformance — resource containment', () => {
  it('terminates runaway CPU with execution timeout', async () => {
    const sandbox = createExtensionSandbox({
      allowedWritePaths: [],
      executionTimeoutMs: 100,
    });
    await expect(
      sandbox.run(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('blocks runaway memory growth', async () => {
    const sandbox = createExtensionSandbox({
      allowedWritePaths: [],
      maxHeapDeltaMiB: 4,
      executionTimeoutMs: 5_000,
    });
    await expect(
      sandbox.run(async () => {
        const chunks: unknown[] = [];
        for (let index = 0; index < 256; index += 1) {
          chunks.push(new Array(10_000).fill({ payload: 'x'.repeat(128) }));
          await Promise.resolve();
        }
        return chunks.length;
      }),
    ).rejects.toMatchObject({ kind: 'memory' });
  });

  it('restores sandbox patches after extension crash', async () => {
    const sandbox = createExtensionSandbox({ allowedWritePaths: [] });
    await expect(
      sandbox.run(async () => {
        throw new Error('extension crash');
      }),
    ).rejects.toThrow(/extension crash/);

    sandbox.assertFetchBlocked();
    sandbox.assertSecretEnvBlocked();
  });

  it('contains thrown errors without leaking sandbox state', async () => {
    const sandbox = createExtensionSandbox({ allowedWritePaths: ['/tmp/allowed'] });
    let violation: SandboxViolationError | undefined;
    try {
      await sandbox.run(async () => {
        await fetch('https://example.com');
      });
    } catch (error) {
      violation = error as SandboxViolationError;
    }
    expect(violation?.kind).toBe('network');
    sandbox.assertWriteOutsideAllowlistBlocked('/tmp/allowed');
  });
});
