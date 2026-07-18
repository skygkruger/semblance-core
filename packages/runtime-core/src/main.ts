import { randomUUID } from 'node:crypto';
import type { ProcessSessionV1 } from '@semblance/protocol';
import {
  createRuntimeIpcServer,
  createRuntimeLogger,
  performKernelHandshake,
  readRuntimeEnv,
  registerGracefulShutdown,
  registerShutdownHook,
} from '@semblance/runtime-shared';
import { bootCoreRuntime, resolveCoreIpcPath } from './boot.js';

export interface CoreRuntimeReadiness {
  processType: 'core';
  pid: number;
  ipcSocketPath: string;
  sessionId: string;
  coreStatus: 'ready' | 'degraded';
}

let activeSession: ProcessSessionV1 | null = null;

export async function runCoreRuntime(): Promise<CoreRuntimeReadiness> {
  const env = readRuntimeEnv();
  const log = createRuntimeLogger('core');

  if (!env.kernelSocketPath) {
    throw new Error('SEMBLANCE_KERNEL_SOCKET is required for supervised core runtime');
  }

  const processId = `core-${randomUUID()}`;
  activeSession = await performKernelHandshake({
    socketPath: env.kernelSocketPath,
    processType: 'core',
    processId,
    buildHash: env.buildHash,
    policyEpoch: env.policyEpoch,
  });
  log.info('Kernel handshake complete', { sessionId: activeSession.sessionId });

  const ipcSocketPath = resolveCoreIpcPath(env.inprocessTransport);
  const ipcServer = createRuntimeIpcServer({
    socketPath: ipcSocketPath,
    kernelSocketPath: env.kernelSocketPath,
    expectedPeerType: 'gateway',
    handlers: {
      'core.ping': async () => ({ ok: true, pid: process.pid }),
      'core.readiness': async () => ({
        processType: 'core',
        pid: process.pid,
        sessionId: activeSession?.sessionId ?? null,
        networkEntitlement: false,
      }),
    },
  });

  await ipcServer.start();
  registerShutdownHook({
    name: 'core-ipc-server',
    run: async () => ipcServer.stop(),
  });

  const readiness: CoreRuntimeReadiness = {
    processType: 'core',
    pid: process.pid,
    ipcSocketPath,
    sessionId: activeSession.sessionId,
    coreStatus: 'degraded',
  };

  process.stdout.write(`CORE_READY ${readiness.pid} ${readiness.ipcSocketPath}\n`);
  log.info('Reported CORE_READY', readiness);

  const boot = await bootCoreRuntime({ dataDir: env.dataDir });
  readiness.coreStatus = boot.status;
  if (boot.status === 'ready') {
    log.info('Core boot complete');
  } else {
    log.warn('Core boot degraded', { error: boot.error });
  }

  registerShutdownHook({
    name: 'core-instance',
    run: async () => {
      if (boot.core) {
        await boot.core.shutdown();
      }
    },
  });

  registerGracefulShutdown(async (signal) => {
    log.info('Shutting down', { signal });
  });

  return readiness;
}

const entryPath = process.argv[1] ?? '';
if (entryPath.includes('runtime-core') || entryPath.includes('main')) {
  runCoreRuntime().catch((error: unknown) => {
    console.error('[runtime-core] Fatal error:', error);
    process.exit(1);
  });
}
