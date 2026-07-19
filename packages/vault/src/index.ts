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
  type ProvenanceRecordV1,
  type SourceRefV1,
  type SupersedeAssertionInput,
  type VaultAssertionV1,
  type VaultProvenanceErrorCode,
} from './provenance/index.js';
