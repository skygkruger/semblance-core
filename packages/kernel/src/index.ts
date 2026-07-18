export { KernelError, type KernelErrorCode } from './errors.js';
export { createKernel, type Kernel, type KernelConfig } from './main.js';
export { createKernelReadiness, type KernelReadiness } from './readiness.js';
export {
  REGISTERED_KERNEL_PROCESS_TYPES,
  HANDSHAKE_PROCESS_TYPES,
  createProcessRegistry,
  type RegisteredKernelProcessType,
} from './identity/process-registry.js';
export { createDeviceIdentity, type DeviceIdentity } from './identity/device-identity.js';
export { createMemoryKeyStore } from './keys/memory-key-store.js';
export type { KeyStore, SigningKeyMaterial } from './keys/key-store.js';
export { createConsentStore, type ConsentStore, type ConsentReceipt } from './policy/consent-store.js';
export { createCapabilityIssuer, type IssueCapabilityRequest } from './policy/capability-issuer.js';
export { createKernelIpcHandlers, type ProcessHelloRequest, type KernelIpcHandlers } from './ipc/handlers.js';
export { createKernelIpcServer, type KernelIpcServer } from './ipc/server.js';
