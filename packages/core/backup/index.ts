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

export { ExternalDriveDetector, DEFAULT_DRIVE_DETECTION_CONFIG } from './external-drive-detector.js';
export type {
  DriveDetectionConfig,
  KnownDrive,
  DriveEvent,
  DriveNotification,
} from './external-drive-detector.js';

export { BackupNudgeTracker } from './backup-nudge-tracker.js';
export type { BackupNudgeTrackerDeps } from './backup-nudge-tracker.js';
