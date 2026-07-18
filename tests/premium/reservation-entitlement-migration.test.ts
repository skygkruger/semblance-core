import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { DatabaseHandle } from '../../packages/core/platform/types.js';
import { FoundingReservationStore } from '../../packages/core/premium/founding-reservation-store.js';
import {
  rollbackReservationEntitlementSplit,
  runReservationEntitlementSplit,
  type ReservationMigrationCheckpoint,
} from '../../packages/core/premium/migrations/reservation-entitlement-split.js';
import { setLicensePublicKey } from '../../packages/core/premium/license-keys.js';
import { VALID_TOKEN_SEAT_1 } from '../fixtures/founding-tokens.js';
import {
  LICENSE_TEST_PUBLIC_KEY_PEM,
  generateTestLicenseKey,
} from '../fixtures/license-keys.js';

const dirs: string[] = [];

beforeAll(() => {
  setLicensePublicKey(LICENSE_TEST_PUBLIC_KEY_PEM);
});

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(activeKey: string): {
  db: Database.Database;
  dbPath: string;
  backupPath: string;
  encryptionKey: Buffer;
} {
  const dir = mkdtempSync(join(tmpdir(), 'semblance-reservation-migration-'));
  dirs.push(dir);
  const dbPath = join(dir, 'core.db');
  const backupPath = join(dir, 'core.pre-reservation-split.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE license (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      tier TEXT NOT NULL,
      activated_at TEXT NOT NULL,
      expires_at TEXT,
      founding_seat INTEGER
    );
  `);
  db.prepare("INSERT INTO license VALUES (1, 'founding', '2026-01-01T00:00:00.000Z', NULL, 1)").run();
  db.prepare("INSERT INTO preferences (key, value) VALUES ('active_license_key', ?)").run(activeKey);
  return { db, dbPath, backupPath, encryptionKey: randomBytes(32) };
}

function migrate(
  setup: ReturnType<typeof fixture>,
  failAfter?: ReservationMigrationCheckpoint,
): void {
  runReservationEntitlementSplit({
    db: setup.db as unknown as DatabaseHandle,
    databasePath: setup.dbPath,
    backupPath: setup.backupPath,
    encryptionKey: setup.encryptionKey,
    failAfter,
  });
}

describe('reservation entitlement split migration', () => {
  it('moves a persisted JWT-backed founding tier to encrypted reservation storage and removes premium', () => {
    const setup = fixture(VALID_TOKEN_SEAT_1);
    migrate(setup);

    expect(setup.db.prepare('SELECT * FROM license WHERE id = 1').get()).toBeUndefined();
    expect(setup.db.prepare("SELECT value FROM preferences WHERE key = 'active_license_key'").get())
      .toBeUndefined();

    const reservation = setup.db.prepare('SELECT * FROM founding_reservations').get() as Record<string, unknown>;
    expect(reservation.seat).toBe(1);
    expect(reservation.kind).toBe('reservation_only');
    expect(reservation.token_ciphertext).not.toBe(VALID_TOKEN_SEAT_1);
    expect(readFileSync(setup.dbPath).includes(Buffer.from(VALID_TOKEN_SEAT_1))).toBe(false);
    if (existsSync(`${setup.dbPath}-wal`)) {
      expect(readFileSync(`${setup.dbPath}-wal`).includes(Buffer.from(VALID_TOKEN_SEAT_1))).toBe(false);
    }
  });

  it('preserves a valid paid sem_ founding entitlement and active key', () => {
    const paidKey = generateTestLicenseKey({ tier: 'founding', seat: 73, sub: 'paid-founder' });
    const setup = fixture(paidKey);
    migrate(setup);

    expect((setup.db.prepare('SELECT tier FROM license WHERE id = 1').get() as { tier: string }).tier)
      .toBe('founding');
    expect((setup.db.prepare("SELECT value FROM preferences WHERE key = 'active_license_key'").get() as { value: string }).value)
      .toBe(paidKey);
    expect((setup.db.prepare('SELECT COUNT(*) AS count FROM founding_reservations').get() as { count: number }).count)
      .toBe(0);
  });

  it('rollback restores a byte-equivalent pre-migration database copy readable by legacy code', () => {
    const setup = fixture(VALID_TOKEN_SEAT_1);
    migrate(setup);
    setup.db.close();
    writeFileSync(`${setup.dbPath}-wal`, 'stale post-migration WAL');
    writeFileSync(`${setup.dbPath}-shm`, 'stale post-migration SHM');

    rollbackReservationEntitlementSplit({
      databasePath: setup.dbPath,
      backupPath: setup.backupPath,
    });
    expect(existsSync(`${setup.dbPath}-wal`)).toBe(false);
    expect(existsSync(`${setup.dbPath}-shm`)).toBe(false);

    const restored = new Database(setup.dbPath, { readonly: true });
    expect((restored.prepare('SELECT tier FROM license WHERE id = 1').get() as { tier: string }).tier)
      .toBe('founding');
    expect((restored.prepare("SELECT value FROM preferences WHERE key = 'active_license_key'").get() as { value: string }).value)
      .toBe(VALID_TOKEN_SEAT_1);
    expect(restored.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'founding_reservations'",
    ).get()).toBeUndefined();
    restored.close();
  });

  for (const checkpoint of ['backup_complete', 'reservation_inserted', 'entitlement_cleared'] as const) {
    it(`resumes idempotently after interruption at ${checkpoint}`, () => {
      const setup = fixture(VALID_TOKEN_SEAT_1);
      expect(() => migrate(setup, checkpoint)).toThrow(`Interrupted after ${checkpoint}`);

      migrate(setup);

      const store = new FoundingReservationStore(
        setup.db as unknown as DatabaseHandle,
        setup.encryptionKey,
      );
      expect(store.count()).toBe(1);
      expect(store.list()[0]).toMatchObject({ kind: 'reservation_only', seat: 1 });
      expect(setup.db.prepare('SELECT * FROM license WHERE id = 1').get()).toBeUndefined();
      expect(setup.db.prepare("SELECT value FROM preferences WHERE key = 'active_license_key'").get())
        .toBeUndefined();
    });
  }
});
