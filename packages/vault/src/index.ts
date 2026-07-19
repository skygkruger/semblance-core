export {
  VaultCapabilityError,
  type VaultCapabilityErrorCode,
} from './capabilities/errors.js';
export {
  assertVaultCapability,
  type VaultCapabilityGuardContext,
} from './capabilities/guard.js';
export {
  createVaultCapabilityClient,
  type VaultCapabilityClient,
  type VaultCapabilityClientOptions,
} from './capabilities/client.js';
export {
  DomainKeyStore,
  VAULT_DATA_DOMAINS,
  deriveVaultSigningKey,
  REDACTED_PAYLOAD_CIPHERTEXT,
  type VaultDataDomain,
} from './crypto/domain-keys.js';
export {
  EncryptedSqliteStore,
  initializeVaultEventLogSchema,
  VAULT_EVENT_LOG_SCHEMA,
} from './crypto/encrypted-sqlite.js';
export {
  VaultEventLogError,
  type VaultEventLogErrorCode,
} from './event-log/errors.js';
export {
  canonicalizeVaultEventForSigning,
  computeVaultEventChainHash,
  signVaultEvent,
  verifyVaultEventSignature,
  VAULT_EVENT_GENESIS_HASH,
  VAULT_EVENT_SIGNATURE_PREFIX,
  type StoredVaultEventRow,
  type VaultEventAppendInput,
  type VaultEventReadResult,
} from './event-log/types.js';
export {
  assertVaultEventLogIntegrity,
  detectTruncatedVaultEventLog,
  verifyVaultEventLogIntegrity,
  type VaultEventIntegrityIssue,
  type VaultEventIntegrityReport,
} from './event-log/integrity.js';
export {
  createVaultEventLogWriter,
  VaultEventLogWriter,
  type VaultEventAppendResult,
  type VaultEventLogWriterOptions,
} from './event-log/writer.js';
export {
  createVaultEventLogReader,
  VaultEventLogReader,
  type VaultEventLogReaderOptions,
  type VaultEventReadGuard,
} from './event-log/reader.js';
export {
  createEventLog,
  type VaultEventLog,
  type VaultEventLogOptions,
} from './event-log/index.js';
export {
  AgencyEntityType,
  AgencyGraphEdgeV1,
  AgencyGraphEntityV1,
  AgencyGraphSnapshotV1,
  type DecryptedVaultEvent,
} from './agency-graph/types.js';
export {
  AgencyGraphStore,
  computeAgencyGraphSnapshotHash,
  createAgencyGraphStore,
} from './agency-graph/store.js';
export {
  queryAgencyGraph,
  listAgencyGraphEntitiesByType,
  type AgencyGraphQueryResult,
} from './agency-graph/query.js';
export {
  projectDocumentsFromEvents,
  DocumentProjectionPayloadV1,
  searchDocumentsByQuery,
  type DocumentProjectionRecord,
  type DocumentProjectionSnapshot,
} from './projections/documents.js';
export {
  projectVectorsFromEvents,
  VectorChunkProjectionPayloadV1,
  type VectorProjectionRecord,
  type VectorProjectionSnapshot,
} from './projections/vector.js';
export {
  projectAgencyGraphFromEvents,
  rebuildAgencyGraphSnapshotFromEvents,
  ActionResultPayloadV1,
  OutcomeRecordedPayloadV1,
  DeletedPayloadV1,
  type AgencyGraphProjectionDelta,
} from './projections/agency-graph.js';
export {
  assertCorrectionChain,
  assertSourceRefsPresent,
  AssertionStatus,
  confirmAssertion,
  correctAssertion,
  createProvenanceRecord,
  createRetentionPolicy,
  createSourceRef,
  DerivationMethod,
  hasNonEmptySourceRefs,
  isInferredDerivation,
  mergeSourceRefs,
  parseAssertion,
  parseProvenanceRecord,
  parseRetentionPolicy,
  parseSourceRef,
  parseSourceRefs,
  proposeAssertion,
  ProvenanceRecordV1,
  RetentionPolicyV1,
  supersedeAssertion,
  validateRequiredProvenanceFields,
  VaultAssertionV1,
  VaultProvenanceError,
  type ConfirmAssertionInput,
  type CorrectAssertionInput,
  type CreateProvenanceRecordInput,
  type CreateSourceRefInput,
  type ProposeAssertionInput,
  type SourceRefV1,
  type SupersedeAssertionInput,
  type VaultProvenanceErrorCode,
} from './provenance/index.js';
export {
  VAULT_MIGRATION_ID,
  LEGACY_SOURCE_ID_PREFIX,
  LEGACY_MIGRATION_DOMAINS,
  buildMigrationEventId,
  buildStableLegacySourceId,
  scanLegacyInventory,
  generateMigrationDryRunReport,
  importLegacyDomain,
  importLegacyDomainSkippingConflicts,
  importLegacyInventory,
  loadExistingVaultEventIds,
  createPreMigrationBackup,
  verifyPreMigrationBackup,
  rollbackFromBackup,
  readBackupManifest,
  sha256FileStream,
  type AuditMetadataInventory,
  type LanceChunkInventoryAdapter,
  type LegacyDomainImportOptions,
  type LegacyInventoryCounts,
  type LegacyInventoryPaths,
  type LegacyInventoryRecord,
  type LegacyInventoryReport,
  type LegacyInventorySources,
  type LegacyMigrationDomain,
  type LegacySqliteDatabase,
  type LegacySqliteOpener,
  type MigrationConflict,
  type MigrationDryRunReport,
  type MigrationImportOptions,
  type MigrationImportResult,
  type PreMigrationBackupFile,
  type PreMigrationBackupSnapshot,
  type RollbackResult,
} from './migration/index.js';
export {
  DeletionTombstonePayloadV1,
  DeletionCompletionTracker,
  VaultContentEraser,
  attemptDecryptRedactedPayload,
  computeDeletionReceiptHash,
  createDeletionCompletionTracker,
  createDeletionTombstoneInput,
  createVaultContentEraser,
  decryptedEventsFromReadResults,
  generateDeletionRecordReference,
  initializeDeletionSchema,
  parseDeletionTombstonePayload,
  readDecryptedEvents,
  VAULT_DELETION_COMPLETION_SCHEMA,
  type CreateDeletionTombstoneOptions,
  type DeletionCompletionDevice,
  type DeletionCompletionStatus,
  type DeletionTombstoneAppendInput,
  type DeleteVaultContentOptions,
  type MinimizedDeletionProof,
  type VaultContentEraserOptions,
  type VaultDeletionResult,
} from './deletion/index.js';
