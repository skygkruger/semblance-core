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
  AUTONOMY_CAPABILITY_MAP,
  CAPABILITY_ACTION_TYPES,
  evaluateAutonomyCapability,
  extractActionDestination,
  isCapabilityScopedAction,
  capabilityEscalationWouldHelp,
  type AutonomyTier,
  type CapabilityActionType,
  type CapabilityPolicy,
  type EvaluateAutonomyCapabilityInput,
  type AutonomyCapabilityEvaluation,
} from './policy/autonomy-capability-map.js';
export {
  decideExecutionDestination,
  isExecutionDestinationRemote,
  type ExecutionDestinationChoice,
  type ExecutionDestinationDecision,
  type ExecutionDestinationPolicyInput,
  type DestinationTrustFacts,
  type DestinationTrustStatus,
  type ExecutionCostFacts,
  type ExecutionLatencyFacts,
  type ExecutionRetentionFacts,
  type RemoteExecutionDestination,
  type UserDestinationPreference,
} from './policy/execution-destination-policy.js';
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
  type EntitlementServiceOptions,
} from './entitlement/service.js';
export {
  EntitlementStore,
  type EntitlementSnapshot,
  type StoredEntitlementRecord,
} from './entitlement/store.js';
export {
  evaluateSubscriptionGrace,
  isWithinEntitlementGrace,
  type GraceEvaluation,
} from './entitlement/grace.js';
export {
  revokeEntitlement,
  isRevoked,
  acknowledgeRevocationEpoch,
  resetRevocationForActivation,
  clearRevocationState,
  readRevocationState,
  REVOCATION_STATE_KEY,
  type RevocationState,
} from './entitlement/revocation.js';
export {
  enrollDevice,
  transferDeviceEnrollment,
  removeEnrolledDevice,
  isDeviceEnrolled,
  clearDeviceEnrollment,
  getDeviceEnrollmentState,
  DeviceEnrollmentError,
  DEVICE_ENROLLMENT_KEY,
  MAX_ENROLLED_DEVICES,
  type EnrolledDevice,
  type DeviceEnrollmentState,
} from './entitlement/device-enrollment.js';
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
  approveAndDispatchAction,
  type ExecuteAuditedActionParams,
  type ExecuteAuditedActionResult,
} from './actions/lifecycle.js';
export {
  CONFIDENTIAL_NO_FALLBACK,
  CURRENT_MEASUREMENT_POLICY_VERSION,
  compareTcbVersions,
  getMeasurementPolicy,
  isMeasurementApproved,
  isTcbDowngrade,
  listActiveMeasurementPolicies,
  rotateMeasurementPolicy,
  setMeasurementPolicyForTests,
  resetMeasurementPoliciesForTests,
  type MeasurementPolicyRecord,
  type RotateMeasurementPolicyInput,
} from './confidential/measurement-policy.js';
export {
  DEFAULT_ATTESTATION_ISSUER_KEY_ID,
  createAttestationNonceGuard,
  verifyAttestation,
  attestationSigningPayload,
  setAttestationIssuerPublicKey,
  resetAttestationIssuerPublicKeysForTests,
  InMemoryAttestationNonceGuard,
  type AttestationNonceGuard,
  type AttestationVerificationContext,
  type AttestationVerificationResult,
  type ConfidentialAttestationEvidence,
} from './confidential/attestation-verifier.js';
export {
  CloudBudgetStore,
  createCloudBudgetStore,
  createDefaultCloudBudgetDocument,
  loadCloudBudgetDocument,
  normalizeCloudBudgetDocument,
  saveCloudBudgetDocument,
  type CloudBudgetCheckInput,
  type CloudBudgetCheckResult,
  type CloudBudgetDestination,
  type CloudBudgetDocument,
  type CloudBudgetSpendSummary,
} from './budget/cloud-budget-store.js';
export {
  EXTENSION_PUBLISHER_TRUST_SCHEMA_VERSION,
  ExtensionPublisherTrustStore,
  bootstrapBuiltInPublishers,
  createDefaultExtensionPublisherTrustDocument,
  createExtensionPublisherTrustStore,
  loadExtensionPublisherTrustDocument,
  normalizeExtensionPublisherTrustDocument,
  saveExtensionPublisherTrustDocument,
  type ExtensionPublisherRecord,
  type ExtensionPublisherTrustDocument,
  type ExtensionPublisherTrustLevel,
  type ExtensionPublisherTrustSource,
  type TrustPublisherInput,
} from './extension/trust-store.js';
export {
  EXTENSION_REVOCATION_SCHEMA_VERSION,
  ExtensionRevocationStore,
  createDefaultExtensionRevocationDocument,
  createExtensionRevocationStore,
  evaluateRevocationLoadPolicy,
  loadExtensionRevocationDocument,
  normalizeExtensionRevocationDocument,
  saveExtensionRevocationDocument,
  type ExtensionArtifactRevocation,
  type ExtensionOwnership,
  type ExtensionPublisherRevocation,
  type ExtensionRevocationDocument,
  type ExtensionRevocationLoadAction,
  type ExtensionRevocationLoadEvaluation,
  type RevokeArtifactInput,
  type RevokePublisherInput,
} from './extension/revocation.js';
export {
  DEFAULT_TRUST_API_RANGES,
  EXTENSION_API_RANGE_V1,
  EXTENSION_PLATFORM_API_V1,
  createKernelExtensionTrustChecker,
  evaluateExtensionPublisherTrust,
  extractManifestApiRanges,
  isApiRangeAllowedForTrustLevel,
  type EvaluateExtensionPublisherTrustInput,
  type ExtensionPublisherTrustEvaluation,
  type ExtensionTrustCheckRequest,
  type ExtensionTrustChecker,
} from './extension/publisher-policy.js';
export {
  EXTENSION_INSTALL_SCHEMA_VERSION,
  ExtensionInstallStore,
  createDefaultExtensionInstallDocument,
  createExtensionInstallStore,
  loadExtensionInstallDocument,
  normalizeExtensionInstallDocument,
  saveExtensionInstallDocument,
  type AvailableExtensionSummary,
  type ExtensionInstallDocument,
  type InstallExtensionInput,
  type InstallExtensionResult,
  type InstalledExtensionRecord,
} from './extension/install-store.js';
export {
  emptyPermissionBundle,
  extractRequestedPermissions,
  isGrantedSubsetOfRequested,
  narrowGrantedPermissions,
  permissionBundleFromInput,
  validateExplicitInstallGrant,
  type ExtensionPermissionBundle,
  type ExplicitGrantValidation,
} from './extension/permissions.js';
