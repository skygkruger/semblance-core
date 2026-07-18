import { randomUUID } from 'node:crypto';
import {
  createRuntimeLogger,
  performKernelHandshake,
  readRuntimeEnv,
  registerGracefulShutdown,
  registerShutdownHook,
} from '@semblance/runtime-shared';
import { GATEWAY_TYPED_MODEL_CAPABILITIES } from './download-contract.js';
import { validateLocalInventory, type ModelFileEntry } from './inventory.js';
import { clearModelBuffers } from './memory-clear.js';
import { MODEL_RUNTIME_NETWORK_ENTITLEMENT } from './network-policy.js';
import {
  parseResourceLimitConfig,
  ResourceLimitGuard,
  type ResourceLimitConfig,
} from './resource-limits.js';

export interface ModelRuntimeReadiness {
  processType: 'model';
  pid: number;
  sessionId: string;
  networkEntitlement: false;
  modelStatus: 'ready' | 'degraded';
  inventoryCount: number;
  resourceLimits: ResourceLimitConfig;
  downloadCapabilities: readonly string[];
}

let activeResourceGuard: ResourceLimitGuard | null = null;

export function getActiveResourceGuard(): ResourceLimitGuard | null {
  return activeResourceGuard;
}

export async function runModelRuntime(): Promise<ModelRuntimeReadiness> {
  const env = readRuntimeEnv();
  const log = createRuntimeLogger('model');

  if (!env.kernelSocketPath) {
    throw new Error('SEMBLANCE_KERNEL_SOCKET is required for supervised model runtime');
  }

  const processId = `model-${randomUUID()}`;
  const session = await performKernelHandshake({
    socketPath: env.kernelSocketPath,
    processType: 'model',
    processId,
    buildHash: env.buildHash,
    policyEpoch: env.policyEpoch,
  });
  log.info('Kernel handshake complete', { sessionId: session.sessionId });

  let inventory: ModelFileEntry[] = [];
  let modelStatus: ModelRuntimeReadiness['modelStatus'] = 'ready';

  try {
    inventory = validateLocalInventory(env.dataDir);
    log.info('Model inventory validated', { count: inventory.length });
  } catch (error) {
    modelStatus = 'degraded';
    const message = error instanceof Error ? error.message : String(error);
    log.warn('Model inventory validation failed', { error: message });
    throw error;
  }

  const resourceLimits = parseResourceLimitConfig(process.env);
  activeResourceGuard = new ResourceLimitGuard(resourceLimits);

  registerShutdownHook({
    name: 'model-memory-clear',
    run: () => {
      clearModelBuffers();
      activeResourceGuard = null;
    },
  });

  const readiness: ModelRuntimeReadiness = {
    processType: 'model',
    pid: process.pid,
    sessionId: session.sessionId,
    networkEntitlement: MODEL_RUNTIME_NETWORK_ENTITLEMENT,
    modelStatus,
    inventoryCount: inventory.length,
    resourceLimits,
    downloadCapabilities: GATEWAY_TYPED_MODEL_CAPABILITIES,
  };

  process.stdout.write(`MODEL_READY ${readiness.pid}\n`);
  log.info('Reported MODEL_READY', readiness);

  registerGracefulShutdown(async (signal) => {
    log.info('Shutting down model runtime', { signal });
    clearModelBuffers();
    activeResourceGuard = null;
  });

  return readiness;
}

const entryPath = process.argv[1] ?? '';
if (entryPath.includes('runtime-model') || entryPath.includes('main')) {
  runModelRuntime().catch((error: unknown) => {
    console.error('[runtime-model] Fatal error:', error);
    process.exit(1);
  });
}
