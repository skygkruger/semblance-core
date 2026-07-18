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
export {
  createOsKeyStore,
  createTauriSecureStorageBackend,
  createMemorySecureStorageBackend,
  isFileKeyStoreFallbackAllowed,
  type SecureStorageBackend,
  type OsKeyStoreConfig,
  type TauriInvoke,
} from './keys/os-key-store.js';
export { createFileKeyStore, deleteFileKeyStore, FILE_KEYSTORE_DEFAULT_PATH } from './keys/file-key-store.js';
export {
  migrateLegacySecretsToKeyStore,
  hasLegacyPlaintextSecrets,
  SECURE_STORAGE_MIGRATION_ID,
  type SecureStorageMigrationOptions,
  type SecureStorageMigrationResult,
  type SqliteDatabase,
} from './keys/secure-storage-migration.js';
export type { KeyStore, SigningKeyMaterial } from './keys/key-store.js';
export {
  DEVICE_ID_KEY,
  PRINCIPAL_ID_KEY,
  SIGNING_PRIVATE_KEY_KEY,
  SIGNING_PUBLIC_KEY_KEY,
  ENTITLEMENT_BEARER_KEY,
  LICENSE_KEY,
  kernelOAuthAccessKey,
  kernelOAuthRefreshKey,
  kernelCloudApiKey,
  kernelCloudMetadataKey,
} from './keys/key-store.js';
export { createConsentStore, type ConsentStore, type ConsentReceipt } from './policy/consent-store.js';
export { createCapabilityIssuer, type IssueCapabilityRequest } from './policy/capability-issuer.js';
export { createKernelIpcHandlers, type ProcessHelloRequest, type KernelIpcHandlers } from './ipc/handlers.js';
export { createKernelIpcServer, type KernelIpcServer } from './ipc/server.js';
export { getDefaultKernelSocketPath } from './ipc/socket-path.js';
export {
  createKernelSocketServer,
  encodeKernelRpcMessage,
  decodeKernelRpcMessage,
  type KernelRpcRequest,
  type KernelRpcResponse,
  type KernelRpcError,
  type KernelSocketServer,
} from './ipc/socket-server.js';
