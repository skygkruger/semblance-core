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
  ENTITLEMENT_SNAPSHOT_KEY,
  LICENSE_KEY,
  kernelOAuthAccessKey,
  kernelOAuthRefreshKey,
  kernelCloudApiKey,
  kernelCloudMetadataKey,
} from './keys/key-store.js';
export {
  ConnectorSecretStore,
  createConnectorSecretStore,
  connectorSecretKey,
  migrateLegacyOAuthTokensToKernel,
  type ConnectorSecretKind,
  type LegacyOAuthMigrationResult,
} from './credentials/connector-secret-store.js';
export {
  CapabilityScopedCredentialService,
  createCapabilityScopedCredentialService,
  type CapabilityScopedCredentialConfig,
  type CredentialAccessGrant,
  type IssueCredentialAccessParams,
} from './credentials/capability-scoped-credential.js';
export {
  CredentialAccessError,
  type CredentialAccessErrorCode,
} from './credentials/credential-access-error.js';
export { createConsentStore, type ConsentStore, type ConsentReceipt } from './policy/consent-store.js';
export { createCapabilityIssuer, type IssueCapabilityRequest } from './policy/capability-issuer.js';
export {
  createKernelIpcHandlers,
  type ProcessHelloRequest,
  type KernelIpcHandlers,
  type ActivateEntitlementRequest,
  type EntitlementActivationResponse,
} from './ipc/handlers.js';
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
export {
  createEntitlementService,
  EntitlementService,
  type EntitlementActivationResult,
} from './entitlement/service.js';
export {
  EntitlementStore,
  type EntitlementSnapshot,
  type StoredEntitlementRecord,
} from './entitlement/store.js';
export {
  verifySignedEntitlementV1,
  validateLegacySemLicenseKey,
  verifyLegacySemKeySignature,
  setEntitlementIssuerPublicKey,
  resetEntitlementIssuerPublicKeysForTests,
  DEFAULT_ENTITLEMENT_ISSUER_KEY_ID,
  LEGACY_SEM_ISSUER_KEY_ID,
  type EntitlementVerification,
} from './entitlement/verifier.js';
export { adaptLegacySemKey, LEGACY_SEM_SIGNATURE_PREFIX } from './entitlement/legacy-adapter.js';
export { isReservationArtifact } from './entitlement/reservation-guard.js';
export { entitlementSigningPayload } from './entitlement/signing-payload.js';
export {
  type ActionState,
  type ActionEvent,
  type ActionRecord,
  type ReversibleActionMetadata,
  type CreateActionRecordParams,
  REVERSIBLE_ACTION_TYPES,
  IllegalActionTransitionError,
  ActionReconcileBlockedError,
} from './actions/types.js';
export {
  applyTransition,
  isLegalTransition,
  nextState,
  listLegalEvents,
  listAllStates,
  listAllEvents,
} from './actions/state-machine.js';
export {
  ActionLifecycleStore,
  createActionLifecycleStore,
  createInMemoryActionLifecycleStore,
} from './actions/idempotency-store.js';
export {
  reconcileUnknownAction,
  applyReconcileOutcome,
  assertSafeToRedispatch,
  type ExternalConfirmationChecker,
  type ExternalConfirmationResult,
  type ReconcileOutcome,
} from './actions/reconciler.js';
export {
  executeAuditedAction,
  type ExecuteAuditedActionParams,
  type ExecuteAuditedActionResult,
} from './actions/lifecycle.js';
