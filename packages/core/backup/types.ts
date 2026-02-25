// Backup Types — Encrypted local backup definitions.
// CRITICAL: No networking imports. No cloud services. Local-only backup.

// ─── Backup Configuration ───────────────────────────────────────────────────

/**
 * User backup configuration stored in settings.
 */
export interface BackupConfig {
  /** Whether backup is enabled */
  enabled: boolean;
  /** Destination directory path for backup files */
  destinationPath: string;
  /** Backup schedule */
  schedule: 'daily' | 'weekly' | 'manual';
  /** Maximum number of backup files to retain */
  maxBackups: number;
  /** ISO timestamp of last successful backup, or null */
  lastBackupAt: string | null;
  /** Size in bytes of last backup, or null */
  lastBackupSizeBytes: number | null;
}

/**
 * Default backup configuration — disabled until user configures destination.
 */
export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  enabled: false,
  destinationPath: '',
  schedule: 'weekly',
  maxBackups: 5,
  lastBackupAt: null,
  lastBackupSizeBytes: null,
};

// ─── Backup Manifest ────────────────────────────────────────────────────────

/**
 * Describes the contents and encryption of a .sbk backup file.
 * Stored unencrypted in the manifest portion of the file.
 */
export interface BackupManifest {
  /** Manifest schema version */
  version: number;
  /** ISO timestamp when backup was created */
  createdAt: string;
  /** Device ID that created the backup */
  deviceId: string;
  /** Semblance version that created the backup */
  semblanceVersion: string;
  /** Backup type — currently only 'full' supported */
  backupType: 'full';
  /** KDF used for encryption */
  encryptedWith: 'argon2id';
  /** Argon2id salt as hex string */
  salt: string;
  /** Content entries in the backup */
  contents: BackupContentEntry[];
  /** SHA-256 hash of the encrypted payload for integrity verification */
  integrityHash: string;
  /** Ed25519 public key (hex) used to sign the integrity hash */
  signaturePublicKey: string;
}

/**
 * Describes a single data section in the backup.
 */
export interface BackupContentEntry {
  /** Section name */
  name: string;
  /** Section data type */
  type: 'sqlite' | 'lancedb' | 'config' | 'audit-trail';
  /** Approximate size in bytes */
  sizeBytes: number;
}

// ─── Results ────────────────────────────────────────────────────────────────

/**
 * Result of a backup creation operation.
 */
export interface BackupResult {
  success: boolean;
  /** Path to the created .sbk file */
  filePath?: string;
  /** Size of the backup in bytes */
  sizeBytes?: number;
  /** Number of data sections included */
  sectionCount?: number;
  error?: string;
}

/**
 * Result of a backup restoration operation.
 */
export interface RestoreResult {
  success: boolean;
  /** Names of successfully restored sections */
  sectionsRestored: string[];
  /** Non-fatal warnings (e.g., signature verification issues) */
  warnings: string[];
  error?: string;
}

/**
 * A record of a past backup for history display.
 */
export interface BackupHistoryEntry {
  /** Path to the .sbk file */
  filePath: string;
  /** ISO timestamp */
  createdAt: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Number of data sections */
  sectionCount: number;
}
