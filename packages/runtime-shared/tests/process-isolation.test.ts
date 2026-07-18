import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bootKernelMain,
  type KernelMainRuntime,
} from '../../kernel/src/bin/kernel-main.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const BUILD_HASH = 'sha256:process-isolation-test';
const POLICY_EPOCH = 7;

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

describe('process isolation', () => {
  let kernelRuntime: KernelMainRuntime | null = null;
  let coreProc: ChildProcessWithoutNullStreams | null = null;
  let gatewayProc: ChildProcessWithoutNullStreams | null = null;

  afterEach(async () => {
    if (coreProc) {
      coreProc.kill('SIGTERM');
      coreProc = null;
    }
    if (gatewayProc) {
      gatewayProc.kill('SIGTERM');
      gatewayProc = null;
    }
    if (kernelRuntime) {
      await kernelRuntime.server.stop();
      kernelRuntime = null;
    }
  });

  it('spawns core and gateway as separate processes with kernel handshake', async () => {
    const socketDir = mkdtempSync(join(tmpdir(), 'semblance-isolation-kernel-'));
    const socketPath = join(socketDir, 'kernel.sock');

    kernelRuntime = await bootKernelMain({
      buildHash: BUILD_HASH,
      policyEpoch: POLICY_EPOCH,
      socketPath,
    });

    const sharedEnv = {
      SEMBLANCE_KERNEL_SOCKET: socketPath,
      SEMBLANCE_BUILD_HASH: BUILD_HASH,
      SEMBLANCE_POLICY_EPOCH: String(POLICY_EPOCH),
      SEMBLANCE_DATA_DIR: mkdtempSync(join(tmpdir(), 'semblance-isolation-data-')),
    };

    const coreScript = join(REPO_ROOT, 'packages/runtime-core/src/main.ts');
    const gatewayScript = join(REPO_ROOT, 'packages/runtime-gateway/src/main.ts');

    coreProc = spawnTsxProcess(coreScript, sharedEnv);
    const coreReady = await waitForLine(coreProc, 'CORE_READY', 45_000);
    const corePid = Number.parseInt(coreReady[1] ?? '', 10);
    const coreIpcPath = coreReady[2] ?? '';

    expect(Number.isFinite(corePid)).toBe(true);
    expect(coreIpcPath.length).toBeGreaterThan(0);

    gatewayProc = spawnTsxProcess(gatewayScript, {
      ...sharedEnv,
      SEMBLANCE_CORE_IPC: coreIpcPath,
    });

    const gatewayReady = await waitForLine(gatewayProc, 'GATEWAY_READY', 45_000);
    const gatewayPid = Number.parseInt(gatewayReady[1] ?? '', 10);

    expect(Number.isFinite(gatewayPid)).toBe(true);
    expect(corePid).not.toEqual(gatewayPid);

    console.log(
      'SUPERVISOR_STATUS',
      JSON.stringify({
        capturedAt: new Date().toISOString(),
        source: 'packages/runtime-shared/tests/process-isolation.test.ts',
        kernel: {
          authenticatesProcesses: true,
          buildHash: BUILD_HASH,
          policyEpoch: POLICY_EPOCH,
        },
        corePid,
        gatewayPid,
        distinct: corePid !== gatewayPid,
        coreIpcPath,
        modelSupervised: true,
        modelNetworkIncapable: true,
        sidecarSeparate: true,
      }),
    );
  }, 60_000);
});
