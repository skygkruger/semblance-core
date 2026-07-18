import { ProcessHelloV1 } from '@semblance/protocol';
import { createKernel, type Kernel } from '../main.js';
import { createOsKeyStore, isFileKeyStoreFallbackAllowed } from '../keys/os-key-store.js';
import { createMemoryKeyStore } from '../keys/memory-key-store.js';
import type { ProcessHelloRequest } from '../ipc/handlers.js';
import { createKernelSocketServer, type KernelSocketServer } from '../ipc/socket-server.js';
import { getDefaultKernelSocketPath } from '../ipc/socket-path.js';

const DEFAULT_BUILD_HASH = 'sha256:local-dev';
const DEFAULT_POLICY_EPOCH = 1;

function parsePolicyEpoch(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? String(DEFAULT_POLICY_EPOCH), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid SEMBLANCE_POLICY_EPOCH: ${raw ?? '(empty)'}`);
  }
  return parsed;
}

function createSupervisedKeyStore() {
  if (isFileKeyStoreFallbackAllowed()) {
    return createOsKeyStore({ allowFileFallback: true });
  }
  return createMemoryKeyStore();
}

function buildRpcHandlers(kernel: Kernel) {
  return {
    'kernel.readiness': async () => kernel.readiness,
    'kernel.hello': async (params: unknown) => {
      const record = params as Partial<ProcessHelloRequest>;
      if (!record.hello || typeof record.sessionPublicKey !== 'string') {
        throw new Error('kernel.hello requires hello and sessionPublicKey');
      }
      if (typeof record.policyEpoch !== 'number') {
        throw new Error('kernel.hello requires policyEpoch');
      }

      const hello = ProcessHelloV1.parse(record.hello);
      return kernel.ipc.handleProcessHello({
        hello,
        policyEpoch: record.policyEpoch,
        sessionPublicKey: record.sessionPublicKey,
        extensionInstanceId: record.extensionInstanceId ?? null,
        sessionTtlMs: record.sessionTtlMs,
      });
    },
    'kernel.validateSession': async (params: unknown) => {
      const record = params as { sessionId?: string };
      if (typeof record.sessionId !== 'string' || record.sessionId.length === 0) {
        throw new Error('kernel.validateSession requires sessionId');
      }
      return kernel.ipc.validateSession(record.sessionId);
    },
    'kernel.entitlement.snapshot': async () => kernel.ipc.getEntitlementSnapshot(),
    'kernel.entitlement.activate': async (params: unknown) => {
      const record = params as { bearer?: string; entitlement?: unknown };
      return kernel.ipc.activateEntitlement(record);
    },
  };
}

export interface KernelMainOptions {
  buildHash?: string;
  policyEpoch?: number;
  socketPath?: string;
}

export interface KernelMainRuntime {
  kernel: Kernel;
  server: KernelSocketServer;
  socketPath: string;
}

export async function bootKernelMain(options: KernelMainOptions = {}): Promise<KernelMainRuntime> {
  const buildHash = options.buildHash ?? process.env.SEMBLANCE_BUILD_HASH ?? DEFAULT_BUILD_HASH;
  const policyEpoch = options.policyEpoch ?? parsePolicyEpoch(process.env.SEMBLANCE_POLICY_EPOCH);
  const socketPath = options.socketPath ?? process.env.SEMBLANCE_KERNEL_SOCKET ?? getDefaultKernelSocketPath();

  const kernel = await createKernel({
    keyStore: createSupervisedKeyStore(),
    buildHash,
    policyEpoch,
  });

  const server = createKernelSocketServer({
    socketPath,
    handlers: buildRpcHandlers(kernel),
  });

  await server.start();

  return { kernel, server, socketPath };
}

export async function runKernelMain(options: KernelMainOptions = {}): Promise<void> {
  const runtime = await bootKernelMain(options);

  process.stdout.write(`KERNEL_READY ${runtime.socketPath}\n`);

  const shutdown = async (signal: string): Promise<void> => {
    console.error(`[kernel-main] Received ${signal}, shutting down`);
    await runtime.server.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

const entryPath = process.argv[1] ?? '';
if (entryPath.includes('kernel-main')) {
  runKernelMain().catch((error: unknown) => {
    console.error('[kernel-main] Fatal error:', error);
    process.exit(1);
  });
}
