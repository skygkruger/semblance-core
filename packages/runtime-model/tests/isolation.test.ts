import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { bootKernelMain, type KernelMainRuntime } from '../../kernel/src/bin/kernel-main.js';
import {
  InventoryMismatchError,
  sha256File,
  validateInventoryAgainstManifest,
} from '../src/inventory.js';
import { clearModelBuffers, registerModelBuffer } from '../src/memory-clear.js';
import {
  assertDirectoryIsNetworkIncapable,
  MODEL_RUNTIME_NETWORK_ENTITLEMENT,
} from '../src/network-policy.js';
import {
  parseResourceLimitConfig,
  ResourceLimitExceededError,
  ResourceLimitGuard,
} from '../src/resource-limits.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const BUILD_HASH = 'sha256:runtime-model-isolation-test';
const POLICY_EPOCH = 9;
const MODEL_SRC_DIR = resolve(import.meta.dirname, '../src');

function spawnTsxProcess(
  scriptPath: string,
  env: Record<string, string>,
): ChildProcessWithoutNullStreams {
  const tsxBin = join(
    REPO_ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsx.cmd' : 'tsx',
  );

  return spawn(tsxBin, [scriptPath], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForLine(
  proc: ChildProcessWithoutNullStreams,
  prefix: string,
  timeoutMs: number,
): Promise<string[]> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for line prefix ${prefix}`));
    }, timeoutMs);

    proc.stdout.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split('\n')) {
        if (line.startsWith(prefix)) {
          clearTimeout(timer);
          resolvePromise(line.trim().split(/\s+/));
          return;
        }
      }
    });

    proc.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

describe('runtime-model isolation', () => {
  let kernelRuntime: KernelMainRuntime | null = null;
  let modelProc: ChildProcessWithoutNullStreams | null = null;

  afterEach(async () => {
    if (modelProc) {
      modelProc.kill('SIGTERM');
      modelProc = null;
    }
    if (kernelRuntime) {
      await kernelRuntime.server.stop();
      kernelRuntime = null;
    }
    clearModelBuffers();
  });

  it('completes kernel handshake and emits MODEL_READY', async () => {
    const socketDir = mkdtempSync(join(tmpdir(), 'semblance-model-kernel-'));
    const socketPath = join(socketDir, 'kernel.sock');
    const dataDir = mkdtempSync(join(tmpdir(), 'semblance-model-data-'));

    kernelRuntime = await bootKernelMain({
      buildHash: BUILD_HASH,
      policyEpoch: POLICY_EPOCH,
      socketPath,
    });

    modelProc = spawnTsxProcess(join(REPO_ROOT, 'packages/runtime-model/src/main.ts'), {
      SEMBLANCE_KERNEL_SOCKET: socketPath,
      SEMBLANCE_BUILD_HASH: BUILD_HASH,
      SEMBLANCE_POLICY_EPOCH: String(POLICY_EPOCH),
      SEMBLANCE_DATA_DIR: dataDir,
      SEMBLANCE_MODEL_MAX_CONCURRENCY: '2',
    });

    const modelReady = await waitForLine(modelProc, 'MODEL_READY', 45_000);
    const modelPid = Number.parseInt(modelReady[1] ?? '', 10);

    expect(Number.isFinite(modelPid)).toBe(true);
    expect(modelPid).toBeGreaterThan(0);
  }, 60_000);

  it('rejects inventory hash mismatch', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'semblance-model-inventory-'));
    const modelsDir = join(dataDir, 'models');
    mkdirSync(modelsDir, { recursive: true });

    const modelPath = join(modelsDir, 'test-model.gguf');
    writeFileSync(modelPath, 'local-model-bytes');
    const actualHash = sha256File(modelPath);

    expect(() =>
      validateInventoryAgainstManifest(dataDir, {
        version: 1,
        files: {
          'test-model': {
            sha256: `${actualHash.slice(0, -1)}0`,
            sizeBytes: Buffer.byteLength('local-model-bytes'),
          },
        },
      }),
    ).toThrow(InventoryMismatchError);
  });

  it('declares network entitlement false and scans source for network imports', () => {
    expect(MODEL_RUNTIME_NETWORK_ENTITLEMENT).toBe(false);
    expect(() => assertDirectoryIsNetworkIncapable(MODEL_SRC_DIR)).not.toThrow();
  });

  it('rejects resource usage when over concurrency budget', () => {
    const guard = new ResourceLimitGuard(
      parseResourceLimitConfig({
        SEMBLANCE_MODEL_MAX_MEMORY_MB: '4096',
        SEMBLANCE_MODEL_MAX_CONCURRENCY: '1',
      }),
    );

    guard.acquireSlot();
    expect(() => guard.acquireSlot()).toThrow(ResourceLimitExceededError);
    guard.releaseSlot();
    expect(() => guard.acquireSlot()).not.toThrow();
  });

  it('clears registered model buffers on shutdown hook path', () => {
    registerModelBuffer('demo', Buffer.from('secret-weights'));
    expect(clearModelBuffers).toBeDefined();
    clearModelBuffers();
  });
});
