// Backup — Encrypted local backup creation and restoration.
// CRITICAL: No networking imports. No cloud services.

export type {
  BackupConfig,
  BackupManifest,
  BackupContentEntry,
  BackupResult,
  RestoreResult,
  BackupHistoryEntry,
} from './types.js';

export { DEFAULT_BACKUP_CONFIG } from './types.js';

export {
  createManifest,
  serializeManifest,
  parseManifest,
  verifyIntegrity,
} from './backup-manifest.js';
export type { CreateManifestOptions } from './backup-manifest.js';

export { BackupManager } from './backup-manager.js';
export type { BackupManagerDeps, BackupDataSection } from './backup-manager.js';
