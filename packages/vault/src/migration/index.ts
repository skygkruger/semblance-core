export {
  VAULT_MIGRATION_ID,
  LEGACY_SOURCE_ID_PREFIX,
  buildMigrationEventId,
  buildStableLegacySourceId,
  scanLegacyInventory,
} from './legacy-inventory.js';
export { generateMigrationDryRunReport } from './dry-run.js';
export {
  importLegacyDomain,
  importLegacyDomainSkippingConflicts,
  importLegacyInventory,
  loadExistingVaultEventIds,
} from './v1-import.js';
export type { LegacyDomainImportOptions } from './v1-import.js';
export {
  createPreMigrationBackup,
  verifyPreMigrationBackup,
  rollbackFromBackup,
  readBackupManifest,
  sha256FileStream,
} from './rollback.js';
export {
  LEGACY_MIGRATION_DOMAINS,
  type AuditMetadataInventory,
  type LanceChunkInventoryAdapter,
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
} from './types.js';
