import type { DatabaseHandle } from '../../platform/types.js';
import {
  FoundingReservationStore,
  type ReservationHasher,
} from '../founding-reservation-store.js';
import {
  validatePaidLicenseKey,
  type PaidLicensePayload,
} from '../license-keys.js';

export const RESERVATION_ENTITLEMENT_SCHEMA_VERSION = 3;
export const RESERVATION_ENTITLEMENT_MIGRATION_ID =
  'slice-1-reservation-entitlement-split';

export type ReservationMigrationCheckpoint =
  | 'paid_entitlement_preserved'
  | 'reservation_recorded'
  | 'bearer_deleted'
  | 'storage_sanitized'
  | 'complete';

export interface SecureMigrationBackupAdapter {
  /** Create an OS-protected backup artifact at backupPath. */
  createBackup(db: DatabaseHandle, backupPath: string): void;
  /** Hash the decrypted SQLite content without exposing it as a plaintext file. */
  backupSha256(backupPath: string): string;
  /** Restore decrypted SQLite content directly to databasePath. */
  restoreBackup(backupPath: string, databasePath: string): void;
}

export interface ReservationMigrationPlatformAdapter extends ReservationHasher {
  platform: 'win32' | 'posix';
  exists(path: string): boolean;
  readText(path: string): string;
  writePrivateText(path: string, content: string): void;
  restrictToOwner(path: string): void;
  remove(path: string): void;
  copy(sourcePath: string, destinationPath: string): void;
  sha256File(path: string): string;
}

export interface ReservationEntitlementMigrationOptions {
  db: DatabaseHandle;
  databasePath: string;
  backupPath: string;
  adapter: ReservationMigrationPlatformAdapter;
  failAfter?: ReservationMigrationCheckpoint;
  secureBackupAdapter?: SecureMigrationBackupAdapter;
}

export interface ReservationEntitlementMigrationResult {
  status:
    | 'migrated'
    | 'already_complete'
    | 'paid_entitlement_preserved'
    | 'deferred_secure_backup';
  checkpoint: ReservationMigrationCheckpoint | null;
  backupSha256: string | null;
}

interface CheckpointRow {
  checkpoint: ReservationMigrationCheckpoint;
}

/**
 * Split legacy reservation JWTs from authoritative paid entitlement.
 *
 * The backup is created and hash-verified before migration tables are created.
 * It is intentionally not a database checkpoint: every invocation verifies it
 * before reading or mutating migration state. On Windows, destructive work is
 * deferred unless an OS-protected backup adapter is explicitly supplied.
 */
export function runReservationEntitlementSplit(
  options: ReservationEntitlementMigrationOptions,
): ReservationEntitlementMigrationResult {
  if (options.adapter.platform === 'win32' && !options.secureBackupAdapter) {
    return {
      status: 'deferred_secure_backup',
      checkpoint: null,
      backupSha256: null,
    };
  }
  const backupSha256 = ensureVerifiedBackup(options);

  ensureMigrationTable(options.db);
  const reservationStore = new FoundingReservationStore(options.db, options.adapter);
  const existing = getCheckpoint(options.db);
  if (existing === 'complete') {
    return { status: 'already_complete', checkpoint: 'complete', backupSha256 };
  }

  let checkpoint = existing;
  if (!checkpoint) {
    const activeKey = getActiveLicenseKey(options.db);
    const paidEntitlement = activeKey
      ? validatePaidLicenseKey(activeKey)
      : { valid: false as const };
    const paidPayload = 'payload' in paidEntitlement
      ? paidEntitlement.payload
      : undefined;
    if (activeKey && paidEntitlement.valid && paidPayload) {
      const preservePaidEntitlement = options.db.transaction(() => {
        reconcilePaidMetadata(options.db, paidPayload);
        setCheckpoint(options.db, 'paid_entitlement_preserved');
      });
      preservePaidEntitlement();
      checkpoint = 'paid_entitlement_preserved';
      interruptAfter(options, checkpoint);
    } else {
      const recordReservation = options.db.transaction(() => {
        if (activeKey && !activeKey.startsWith('sem_')) {
          const result = reservationStore.importReservation(activeKey);
          if (!result.valid) {
            throw new Error(`Legacy reservation could not be preserved: ${result.error}`);
          }
        }
        setCheckpoint(options.db, 'reservation_recorded');
      });
      recordReservation();
      checkpoint = 'reservation_recorded';
      interruptAfter(options, checkpoint);
    }
  }

  const paidEntitlementPreserved = checkpoint === 'paid_entitlement_preserved';
  if (!paidEntitlementPreserved && checkpointRank(checkpoint) < checkpointRank('bearer_deleted')) {
    const deleteBearerMaterial = options.db.transaction(() => {
      const activeKey = getActiveLicenseKey(options.db);
      if (activeKey && !validatePaidLicenseKey(activeKey).valid) {
        options.db.pragma('secure_delete = ON');
        if (tableExists(options.db, 'license')) {
          options.db.prepare('DELETE FROM license WHERE id = 1').run();
        }
        options.db.prepare(
          "DELETE FROM preferences WHERE key = 'active_license_key'",
        ).run();
      }
      setCheckpoint(options.db, 'bearer_deleted');
    });
    deleteBearerMaterial();
    checkpoint = 'bearer_deleted';
    interruptAfter(options, checkpoint);
  }

  if (checkpoint !== 'storage_sanitized') {
    // Repeating TRUNCATE after a crash is safe. The sanitized checkpoint is
    // written only after all prior WAL frames containing deleted bearer data
    // have been checkpointed and securely removed.
    options.db.pragma('wal_checkpoint(TRUNCATE)');
    setCheckpoint(options.db, 'storage_sanitized');
    checkpoint = 'storage_sanitized';
    interruptAfter(options, checkpoint);
  }

  setCheckpoint(options.db, 'complete');
  interruptAfter(options, 'complete');
  return {
    status: paidEntitlementPreserved ? 'paid_entitlement_preserved' : 'migrated',
    checkpoint: 'complete',
    backupSha256,
  };
}

export function rollbackReservationEntitlementSplit(options: {
  databasePath: string;
  backupPath: string;
  adapter: ReservationMigrationPlatformAdapter;
  secureBackupAdapter?: SecureMigrationBackupAdapter;
}): { restoredSha256: string } {
  if (options.adapter.platform === 'win32' && !options.secureBackupAdapter) {
    throw new Error('Windows rollback requires an OS-protected backup adapter');
  }
  const markerPath = `${options.backupPath}.sha256`;
  if (!options.adapter.exists(options.backupPath) || !options.adapter.exists(markerPath)) {
    throw new Error('Reservation migration backup or hash marker is missing');
  }
  const expected = options.adapter.readText(markerPath).trim();
  const actual = options.secureBackupAdapter
    ? options.secureBackupAdapter.backupSha256(options.backupPath)
    : options.adapter.sha256File(options.backupPath);
  if (expected !== actual) {
    throw new Error('Reservation migration backup hash verification failed');
  }
  for (const suffix of ['-wal', '-shm']) {
    const sidecarPath = `${options.databasePath}${suffix}`;
    if (options.adapter.exists(sidecarPath)) options.adapter.remove(sidecarPath);
  }
  if (options.secureBackupAdapter) {
    options.secureBackupAdapter.restoreBackup(options.backupPath, options.databasePath);
  } else {
    options.adapter.copy(options.backupPath, options.databasePath);
  }
  const restoredSha256 = options.adapter.sha256File(options.databasePath);
  if (restoredSha256 !== expected) {
    throw new Error('Restored database hash verification failed');
  }
  return { restoredSha256 };
}

function ensureVerifiedBackup(
  options: ReservationEntitlementMigrationOptions,
): string {
  const markerPath = `${options.backupPath}.sha256`;
  if (!options.adapter.exists(options.backupPath)) {
    if (options.secureBackupAdapter) {
      options.secureBackupAdapter.createBackup(options.db, options.backupPath);
    } else {
      const escaped = options.backupPath.replace(/'/g, "''");
      options.db.exec(`VACUUM INTO '${escaped}'`);
    }
  }
  if (!options.secureBackupAdapter) options.adapter.restrictToOwner(options.backupPath);
  const backupSha256 = options.secureBackupAdapter
    ? options.secureBackupAdapter.backupSha256(options.backupPath)
    : options.adapter.sha256File(options.backupPath);
  if (options.adapter.exists(markerPath)) {
    const expected = options.adapter.readText(markerPath).trim();
    if (expected !== backupSha256) {
      throw new Error('Reservation migration backup hash verification failed');
    }
  } else {
    options.adapter.writePrivateText(markerPath, `${backupSha256}\n`);
  }
  options.adapter.restrictToOwner(markerPath);
  return backupSha256;
}

function ensureMigrationTable(db: DatabaseHandle): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL,
      checkpoint TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

function getCheckpoint(db: DatabaseHandle): ReservationMigrationCheckpoint | null {
  const row = db.prepare(`
    SELECT checkpoint FROM schema_migrations
    WHERE migration_id = ? AND schema_version = ?
  `).get(
    RESERVATION_ENTITLEMENT_MIGRATION_ID,
    RESERVATION_ENTITLEMENT_SCHEMA_VERSION,
  ) as CheckpointRow | undefined;
  return row?.checkpoint ?? null;
}

function setCheckpoint(
  db: DatabaseHandle,
  checkpoint: ReservationMigrationCheckpoint,
): void {
  db.prepare(`
    INSERT INTO schema_migrations (
      migration_id, schema_version, checkpoint, updated_at
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(migration_id) DO UPDATE SET
      schema_version = excluded.schema_version,
      checkpoint = excluded.checkpoint,
      updated_at = excluded.updated_at
  `).run(
    RESERVATION_ENTITLEMENT_MIGRATION_ID,
    RESERVATION_ENTITLEMENT_SCHEMA_VERSION,
    checkpoint,
    new Date().toISOString(),
  );
}

function getActiveLicenseKey(db: DatabaseHandle): string | null {
  if (!tableExists(db, 'preferences')) return null;
  const row = db.prepare(
    "SELECT value FROM preferences WHERE key = 'active_license_key'",
  ).get() as { value: string } | undefined;
  return row?.value || null;
}

function tableExists(db: DatabaseHandle, name: string): boolean {
  return Boolean(db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(name));
}

function checkpointRank(checkpoint: ReservationMigrationCheckpoint | null): number {
  if (checkpoint === 'paid_entitlement_preserved' || checkpoint === 'reservation_recorded') return 2;
  if (checkpoint === 'bearer_deleted') return 3;
  if (checkpoint === 'storage_sanitized') return 4;
  if (checkpoint === 'complete') return 5;
  return 0;
}

function interruptAfter(
  options: ReservationEntitlementMigrationOptions,
  checkpoint: ReservationMigrationCheckpoint,
): void {
  if (options.failAfter === checkpoint) {
    throw new Error(`Interrupted after ${checkpoint}`);
  }
}

function reconcilePaidMetadata(db: DatabaseHandle, payload: PaidLicensePayload): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS license (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      tier TEXT NOT NULL DEFAULT 'free',
      activated_at TEXT NOT NULL,
      expires_at TEXT,
      founding_seat INTEGER
    )
  `);
  const existing = db.prepare(
    'SELECT tier, activated_at, founding_seat FROM license WHERE id = 1',
  ).get() as {
    tier: string;
    activated_at: string;
    founding_seat: number | null;
  } | undefined;
  const foundingSeat = existing?.tier === payload.tier
    ? existing.founding_seat
    : payload.tier === 'founding' ? payload.seat : null;
  db.prepare(`
    INSERT OR REPLACE INTO license (
      id, tier, activated_at, expires_at, founding_seat
    ) VALUES (1, ?, ?, ?, ?)
  `).run(
    payload.tier,
    existing?.activated_at ?? new Date().toISOString(),
    payload.exp,
    foundingSeat,
  );
}
