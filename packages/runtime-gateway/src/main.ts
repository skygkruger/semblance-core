import { randomUUID } from 'node:crypto';
import {
  connectAuthenticatedIpcClient,
  createInprocessIpcClient,
  createRuntimeLogger,
  performKernelHandshake,
  readRuntimeEnv,
  registerGracefulShutdown,
  registerShutdownHook,
  type RuntimeIpcClient,
} from '@semblance/runtime-shared';
import type { ProcessSessionV1 } from '@semblance/protocol';
import { bootGatewayRuntime } from './boot.js';

export interface GatewayRuntimeReadiness {
  processType: 'gateway';
  pid: number;
  sessionId: string;
  networkEntitlement: true;
  gatewayStatus: 'ready' | 'degraded';
  coreReachable: boolean;
}

async function connectToCore(
  env: ReturnType<typeof readRuntimeEnv>,
  session: ProcessSessionV1,
  log: ReturnType<typeof createRuntimeLogger>,
): Promise<{ client: RuntimeIpcClient | null; reachable: boolean }> {
  if (env.inprocessTransport) {
    log.info('Using in-process transport (test/migration only)');
    return { client: createInprocessIpcClient(session), reachable: true };
  }

  if (!env.coreIpcPath) {
    log.warn('SEMBLANCE_CORE_IPC not set — gateway cannot reach core IPC yet');
    return { client: null, reachable: false };
  }

  try {
    const client = await connectAuthenticatedIpcClient(env.coreIpcPath, session);
    const ping = await client.call('core.ping', {}) as { ok?: boolean };
    return { client, reachable: ping.ok === true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn('Core IPC connection failed', { error: message });
    return { client: null, reachable: false };
  }
}

export async function runGatewayRuntime(): Promise<GatewayRuntimeReadiness> {
  const env = readRuntimeEnv();
  const log = createRuntimeLogger('gateway');

  if (!env.kernelSocketPath) {
    throw new Error('SEMBLANCE_KERNEL_SOCKET is required for supervised gateway runtime');
  }

  const processId = `gateway-${randomUUID()}`;
  const session = await performKernelHandshake({
    socketPath: env.kernelSocketPath,
    processType: 'gateway',
    processId,
    buildHash: env.buildHash,
    policyEpoch: env.policyEpoch,
  });
  log.info('Kernel handshake complete', { sessionId: session.sessionId });

  const coreLink = await connectToCore(env, session, log);
  if (coreLink.client) {
    registerShutdownHook({
      name: 'gateway-core-ipc',
      run: () => coreLink.client?.close(),
    });
  }

  const readiness: GatewayRuntimeReadiness = {
    processType: 'gateway',
    pid: process.pid,
    sessionId: session.sessionId,
    networkEntitlement: true,
    gatewayStatus: 'degraded',
    coreReachable: coreLink.reachable,
  };

  process.stdout.write(`GATEWAY_READY ${readiness.pid}\n`);
  log.info('Reported GATEWAY_READY', readiness);

  const boot = await bootGatewayRuntime();
  readiness.gatewayStatus = boot.status;
  if (boot.status === 'ready') {
    log.info('Gateway boot complete');
  } else {
    log.warn('Gateway boot degraded', { error: boot.error });
  }

  registerShutdownHook({
    name: 'gateway-instance',
    run: async () => {
      if (boot.gateway) {
        await boot.gateway.stop();
      }
    },
  });

  registerGracefulShutdown(async (signal) => {
    log.info('Shutting down', { signal });
  });

  return readiness;
}

const entryPath = process.argv[1] ?? '';
if (entryPath.includes('runtime-gateway') || entryPath.includes('main')) {
  runGatewayRuntime().catch((error: unknown) => {
    console.error('[runtime-gateway] Fatal error:', error);
    process.exit(1);
  });
}
