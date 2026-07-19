import type { KeyStore } from './keys/key-store.js';
import { createMemoryKeyStore } from './keys/memory-key-store.js';
import { createDeviceIdentity } from './identity/device-identity.js';
import {
  REGISTERED_KERNEL_PROCESS_TYPES,
  createProcessRegistry,
} from './identity/process-registry.js';
import { createConsentStore } from './policy/consent-store.js';
import { createCapabilityIssuer } from './policy/capability-issuer.js';
import { createSessionStore } from './session/session-store.js';
import { createKernelReadiness, type KernelReadiness } from './readiness.js';
import { createKernelIpcHandlers } from './ipc/handlers.js';
import { createKernelIpcServer, type KernelIpcServer } from './ipc/server.js';
import { createEntitlementService } from './entitlement/service.js';

export interface KernelConfig {
  keyStore?: KeyStore;
  buildHash: string;
  policyEpoch: number;
  defaultSessionTtlMs?: number;
  defaultCapabilityTtlMs?: number;
}

export interface Kernel {
  readonly readiness: KernelReadiness;
  readonly ipc: KernelIpcServer['handlers'];
  readonly processRegistry: ReturnType<typeof createProcessRegistry>;
  readonly consentStore: ReturnType<typeof createConsentStore>;
}

export async function createKernel(config: KernelConfig): Promise<Kernel> {
  const keyStore = config.keyStore ?? createMemoryKeyStore();
  const identity = await createDeviceIdentity(keyStore);
  const sessions = createSessionStore();
  const capabilityIssuer = createCapabilityIssuer(
    identity,
    sessions,
    config.policyEpoch,
    config.defaultCapabilityTtlMs,
  );
  const entitlement = createEntitlementService(keyStore, { deviceId: identity.deviceId });

  const ipcHandlers = createKernelIpcHandlers({
    buildHash: config.buildHash,
    policyEpoch: config.policyEpoch,
    defaultSessionTtlMs: config.defaultSessionTtlMs ?? 3_600_000,
    identity,
    sessions,
    capabilityIssuer,
    entitlement,
  });

  createKernelIpcServer(ipcHandlers);

  return {
    readiness: createKernelReadiness({
      buildHash: config.buildHash,
      policyEpoch: config.policyEpoch,
      deviceId: identity.deviceId,
      registeredProcessTypes: REGISTERED_KERNEL_PROCESS_TYPES,
    }),
    ipc: ipcHandlers,
    processRegistry: createProcessRegistry(),
    consentStore: createConsentStore(),
  };
}
