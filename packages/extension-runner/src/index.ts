export {
  buildExtensionInitContext,
  createRecordingGatewayClient,
  createRecordingVaultClient,
  createStubEntitlementClient,
  type BuildExtensionInitContextOptions,
  type ExtensionInitContextLike,
} from './client-adapters.js';

export {
  extractExtensionArtifact,
  importExtractedExtension,
  type ExtractedExtensionArtifact,
} from './extract-artifact.js';

export {
  loadSignedDigitalRepresentative,
  resolveArtifactPath,
  verifySignedArtifactPaths,
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

export type {
  ExtensionRunnerClients,
  GatewayActionClient,
  GatewayActionRequest,
  GatewayActionResult,
  KernelEntitlementClient,
  KernelEntitlementSnapshot,
  VaultClient,
  VaultDocumentSummary,
  VaultSearchRequest,
  VaultSearchResult,
} from '@semblance/extension-sdk';
