export {
  buildExtensionInitContext,
  buildExtensionInitContextV1,
  buildExtensionRunnerClientsV1,
  createRecordingGatewayClient,
  createRecordingHealthClient,
  createRecordingReceiptClient,
  createRecordingScheduleClient,
  createRecordingUiSlotClient,
  createRecordingVaultClient,
  createStubEntitlementClient,
  createMigrationClient,
  type BuildExtensionInitContextOptions,
  type BuildExtensionInitContextV1Options,
  type ExtensionInitContextLike,
} from './client-adapters.js';

export {
  extractExtensionArtifact,
  importExtractedExtension,
  type ExtractedExtensionArtifact,
} from './extract-artifact.js';

export {
  createArtifactOnlyExtensionTrustChecker,
  type ExtensionOwnership,
  type ExtensionPublisherTrustEvaluation,
  type ExtensionTrustCheckRequest,
  type ExtensionTrustChecker,
} from './trust-checker.js';

export {
  loadSignedDigitalRepresentative,
  resolveArtifactPath,
  verifySignedArtifactPaths,
  LOADED_EXTENSION_API,
  type LoadSignedDigitalRepresentativeOptions,
  type LoadSignedDigitalRepresentativeResult,
  type SemblanceExtensionLike,
  type VerifySignedArtifactPathsOptions,
  type VerifySignedArtifactPathsResult,
} from './load-signed.js';

export {
  SandboxViolationError,
  createExtensionSandbox,
  ensureParentDir,
  type ExtensionSandbox,
  type ExtensionSandboxOptions,
} from './sandbox.js';

export {
  PermissionEnforcementError,
  createEnforcingGatewayClient,
  createEnforcingScheduleClient,
  createEnforcingUiSlotClient,
  createEnforcingVaultClient,
  createPermissionEnforcedClientsV1,
  createTestEnforcedClients,
  type CreatePermissionEnforcedClientsOptions,
  type ExtensionGrantedPermissions,
} from './permission-enforcement.js';

export type {
  ExtensionActionReceiptV1,
  ExtensionApiV1,
  ExtensionHealthClient,
  ExtensionHealthReportV1,
  ExtensionInitContextV1,
  ExtensionManifestV1,
  ExtensionMigrationClient,
  ExtensionMigrationPolicyV1,
  ExtensionPlatformApiV1,
  ExtensionReceiptClient,
  ExtensionRunnerClients,
  ExtensionRunnerClientsV1,
  ExtensionScheduleClient,
  ExtensionToolV1,
  ExtensionUiSlotClient,
  GatewayActionClient,
  GatewayActionRequest,
  GatewayActionResult,
  KernelEntitlementClient,
  KernelEntitlementSnapshot,
  SemblanceExtensionV1,
  VaultClient,
  VaultDocumentSummary,
  VaultSearchRequest,
  VaultSearchResult,
} from '@semblance/extension-sdk';

export {
  EXTENSION_API_V1,
  EXTENSION_MANIFEST_V1_SCHEMA_ID,
  EXTENSION_PLATFORM_API_V1,
  assertSdkSurfaceNoRawHandles,
  parseExtensionManifestV1,
} from '@semblance/extension-sdk';
