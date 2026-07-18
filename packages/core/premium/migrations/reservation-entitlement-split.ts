import {
  chmodSync,
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

export const RESERVATION_ENTITLEMENT_SCHEMA_VERSION = 2;
export const RESERVATION_ENTITLEMENT_MIGRATION_ID =
  'slice-1-reservation-entitlement-split';

export type ReservationMigrationCheckpoint =
  | 'backup_complete'
  | 'paid_entitlement_preserved'
  | 'reservation_recorded'
  | 'bearer_deleted'
  | 'storage_sanitized'
  | 'complete';

export interface ReservationEntitlementMigrationOptions {
  db: DatabaseHandle;
  databasePath: string;
  backupPath: string;
  failAfter?: ReservationMigrationCheckpoint;
}

export interface ReservationEntitlementMigrationResult {
  status: 'migrated' | 'already_complete' | 'paid_entitlement_preserved';
  checkpoint: ReservationMigrationCheckpoint;
  backupSha256: string;
}

interface CheckpointRow {
  checkpoint: ReservationMigrationCheckpoint;
}

interface PaidLicensePayload {
  tier: 'founding' | 'digital-representative' | 'lifetime';
  exp: string | null;
  seat: number | null;
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
  const reservationStore = new FoundingReservationStore(options.db);
  const existing = getCheckpoint(options.db);
  if (existing === 'complete') {
    return { status: 'already_complete', checkpoint: 'complete', backupSha256 };
  }

  let checkpoint = existing;
  if (!checkpoint) {
    const activeKey = getActiveLicenseKey(options.db);
    if (activeKey && verifyLicenseKeySignature(activeKey).valid) {
      const preservePaidEntitlement = options.db.transaction(() => {
        reconcilePaidMetadata(options.db, activeKey);
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
      if (activeKey && !verifyLicenseKeySignature(activeKey).valid) {
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
  restrictFileMode(options.backupPath);
  const backupSha256 = sha256File(options.backupPath);
  if (existsSync(markerPath)) {
    const expected = readFileSync(markerPath, 'utf8').trim();
    if (expected !== backupSha256) {
      throw new Error('Reservation migration backup hash verification failed');
    }
  } else {
    writeFileSync(markerPath, `${backupSha256}\n`, { mode: 0o600 });
  }
  restrictFileMode(markerPath);
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

function decodePaidLicensePayload(key: string): PaidLicensePayload | null {
  try {
    const payloadSegment = key.slice(4).split('.')[1];
    if (!payloadSegment) return null;
    const payload = JSON.parse(
      Buffer.from(payloadSegment, 'base64url').toString('utf8'),
    ) as { tier?: unknown; exp?: unknown; seat?: unknown };
    if (
      payload.tier !== 'founding'
      && payload.tier !== 'digital-representative'
      && payload.tier !== 'lifetime'
    ) return null;
    return {
      tier: payload.tier,
      exp: typeof payload.exp === 'string' ? payload.exp : null,
      seat: Number.isInteger(payload.seat) ? payload.seat as number : null,
    };
  } catch {
    return null;
  }
}

function checkpointRank(checkpoint: ReservationMigrationCheckpoint | null): number {
  if (checkpoint === 'backup_complete') return 1;
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

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function reconcilePaidMetadata(db: DatabaseHandle, key: string): void {
  const payload = decodePaidLicensePayload(key);
  if (!payload) return;
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
    'SELECT activated_at FROM license WHERE id = 1',
  ).get() as { activated_at: string } | undefined;
  db.prepare(`
    INSERT OR REPLACE INTO license (
      id, tier, activated_at, expires_at, founding_seat
    ) VALUES (1, ?, ?, ?, ?)
  `).run(
    payload.tier,
    existing?.activated_at ?? new Date().toISOString(),
    payload.exp,
    payload.tier === 'founding' ? payload.seat : null,
  );
}

function restrictFileMode(path: string): void {
  try {
    chmodSync(path, 0o600);
  } catch (error) {
    if (process.platform !== 'win32') throw error;
  }
}
