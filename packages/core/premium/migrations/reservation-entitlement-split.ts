import {
  copyFileSync,
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import type { DatabaseHandle } from '../../platform/types.js';
import { FoundingReservationStore } from '../founding-reservation-store.js';
import { verifyLicenseKeySignature } from '../license-keys.js';

export const RESERVATION_ENTITLEMENT_SCHEMA_VERSION = 1;
export const RESERVATION_ENTITLEMENT_MIGRATION_ID =
  'slice-1-reservation-entitlement-split';

export type ReservationMigrationCheckpoint =
  | 'backup_complete'
  | 'reservation_inserted'
  | 'entitlement_cleared'
  | 'complete';

export interface ReservationEntitlementMigrationOptions {
  db: DatabaseHandle;
  databasePath: string;
  backupPath: string;
  encryptionKey: Buffer;
  failAfter?: ReservationMigrationCheckpoint;
}

export interface ReservationEntitlementMigrationResult {
  status: 'migrated' | 'already_complete' | 'paid_entitlement_preserved';
  checkpoint: ReservationMigrationCheckpoint;
  backupSha256: string;
}

interface LicenseTierRow {
  tier: string;
}

interface CheckpointRow {
  checkpoint: ReservationMigrationCheckpoint;
}

/**
 * Split legacy reservation JWTs from authoritative paid entitlement.
 *
 * The backup is a consistent SQLite copy produced before migration tables are
 * created. Every resumable database step records its checkpoint atomically
 * with that step. The backup hash is installation-specific runtime evidence;
 * it is never checked into the executable migration definition.
 */
export function runReservationEntitlementSplit(
  options: ReservationEntitlementMigrationOptions,
): ReservationEntitlementMigrationResult {
  const backupSha256 = ensureVerifiedBackup(options);
  interruptAfter(options, 'backup_complete');

  ensureMigrationTable(options.db);
  const existing = getCheckpoint(options.db);
  if (existing === 'complete') {
    return { status: 'already_complete', checkpoint: 'complete', backupSha256 };
  }

  const license = tableExists(options.db, 'license')
    ? options.db.prepare('SELECT tier FROM license WHERE id = 1').get() as LicenseTierRow | undefined
    : undefined;
  const activeKey = getActiveLicenseKey(options.db);

  if (license?.tier !== 'founding') {
    new FoundingReservationStore(options.db, options.encryptionKey);
    setCheckpoint(options.db, 'complete');
    return { status: 'migrated', checkpoint: 'complete', backupSha256 };
  }

  if (activeKey && isValidPaidFoundingKey(activeKey)) {
    new FoundingReservationStore(options.db, options.encryptionKey);
    setCheckpoint(options.db, 'complete');
    return {
      status: 'paid_entitlement_preserved',
      checkpoint: 'complete',
      backupSha256,
    };
  }

  const reservationStore = new FoundingReservationStore(
    options.db,
    options.encryptionKey,
  );

  if (checkpointRank(existing) < checkpointRank('reservation_inserted')) {
    const insertReservation = options.db.transaction(() => {
      if (activeKey && !activeKey.startsWith('sem_')) {
        const result = reservationStore.importReservation(activeKey);
        if (!result.valid) {
          throw new Error(`Legacy reservation could not be preserved: ${result.error}`);
        }
      }
      setCheckpoint(options.db, 'reservation_inserted');
    });
    insertReservation();
  }
  interruptAfter(options, 'reservation_inserted');

  if (checkpointRank(getCheckpoint(options.db)) < checkpointRank('entitlement_cleared')) {
    const clearEntitlement = options.db.transaction(() => {
      options.db.pragma('secure_delete = ON');
      options.db.prepare('DELETE FROM license WHERE id = 1').run();
      options.db.prepare(
        "DELETE FROM preferences WHERE key = 'active_license_key'",
      ).run();
      setCheckpoint(options.db, 'entitlement_cleared');
    });
    clearEntitlement();
    // Remove deleted bearer material from WAL pages before exposing completion.
    options.db.pragma('wal_checkpoint(TRUNCATE)');
  }
  interruptAfter(options, 'entitlement_cleared');

  setCheckpoint(options.db, 'complete');
  interruptAfter(options, 'complete');
  return { status: 'migrated', checkpoint: 'complete', backupSha256 };
}

export function rollbackReservationEntitlementSplit(options: {
  databasePath: string;
  backupPath: string;
}): { restoredSha256: string } {
  const markerPath = `${options.backupPath}.sha256`;
  if (!existsSync(options.backupPath) || !existsSync(markerPath)) {
    throw new Error('Reservation migration backup or hash marker is missing');
  }
  const expected = readFileSync(markerPath, 'utf8').trim();
  const actual = sha256File(options.backupPath);
  if (expected !== actual) {
    throw new Error('Reservation migration backup hash verification failed');
  }
  for (const suffix of ['-wal', '-shm']) {
    const sidecarPath = `${options.databasePath}${suffix}`;
    if (existsSync(sidecarPath)) unlinkSync(sidecarPath);
  }
  copyFileSync(options.backupPath, options.databasePath);
  const restoredSha256 = sha256File(options.databasePath);
  if (restoredSha256 !== expected) {
    throw new Error('Restored database hash verification failed');
  }
  return { restoredSha256 };
}

function ensureVerifiedBackup(
  options: ReservationEntitlementMigrationOptions,
): string {
  const markerPath = `${options.backupPath}.sha256`;
  if (!existsSync(options.backupPath)) {
    const escaped = options.backupPath.replace(/'/g, "''");
    options.db.exec(`VACUUM INTO '${escaped}'`);
  }
  const backupSha256 = sha256File(options.backupPath);
  if (existsSync(markerPath)) {
    const expected = readFileSync(markerPath, 'utf8').trim();
    if (expected !== backupSha256) {
      throw new Error('Reservation migration backup hash verification failed');
    }
  } else {
    writeFileSync(markerPath, `${backupSha256}\n`, { mode: 0o600 });
  }
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
    SELECT checkpoint FROM schema_migrations WHERE migration_id = ?
  `).get(RESERVATION_ENTITLEMENT_MIGRATION_ID) as CheckpointRow | undefined;
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

function isValidPaidFoundingKey(key: string): boolean {
  if (!verifyLicenseKeySignature(key).valid) return false;
  try {
    const payloadSegment = key.slice(4).split('.')[1];
    if (!payloadSegment) return false;
    const payload = JSON.parse(
      Buffer.from(payloadSegment, 'base64url').toString('utf8'),
    ) as { tier?: unknown };
    return payload.tier === 'founding';
  } catch {
    return false;
  }
}

function checkpointRank(checkpoint: ReservationMigrationCheckpoint | null): number {
  if (checkpoint === 'backup_complete') return 1;
  if (checkpoint === 'reservation_inserted') return 2;
  if (checkpoint === 'entitlement_cleared') return 3;
  if (checkpoint === 'complete') return 4;
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

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
