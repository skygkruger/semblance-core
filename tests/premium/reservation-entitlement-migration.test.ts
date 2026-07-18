import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

function fixture(activeKey: string, staleTier = 'founding'): {
  db: Database.Database;
  dbPath: string;
  backupPath: string;
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
  db.prepare("INSERT INTO license VALUES (1, ?, '2026-01-01T00:00:00.000Z', NULL, 1)")
    .run(staleTier);
  db.prepare("INSERT INTO preferences (key, value) VALUES ('active_license_key', ?)").run(activeKey);
  return { db, dbPath, backupPath };
}

function migrate(
  setup: ReturnType<typeof fixture>,
  failAfter?: ReservationMigrationCheckpoint,
): void {
  runReservationEntitlementSplit({
    db: setup.db as unknown as DatabaseHandle,
    databasePath: setup.dbPath,
    backupPath: setup.backupPath,
    failAfter,
  });
}

describe('reservation entitlement split migration', () => {
  it('moves a persisted JWT-backed tier to hash-only reservation storage and removes premium', () => {
    const setup = fixture(VALID_TOKEN_SEAT_1);
    migrate(setup);

    expect(setup.db.prepare('SELECT * FROM license WHERE id = 1').get()).toBeUndefined();
    expect(setup.db.prepare("SELECT value FROM preferences WHERE key = 'active_license_key'").get())
      .toBeUndefined();

    const reservation = setup.db.prepare('SELECT * FROM founding_reservations').get() as Record<string, unknown>;
    expect(reservation.seat).toBe(1);
    expect(reservation.kind).toBe('reservation_only');
    expect(reservation.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(reservation)).not.toContain('token_ciphertext');
    expect(JSON.stringify(reservation)).not.toContain(VALID_TOKEN_SEAT_1);
    expect(readFileSync(setup.dbPath).includes(Buffer.from(VALID_TOKEN_SEAT_1))).toBe(false);
    if (existsSync(`${setup.dbPath}-wal`)) {
      expect(readFileSync(`${setup.dbPath}-wal`).includes(Buffer.from(VALID_TOKEN_SEAT_1))).toBe(false);
    }
  });

  for (const keyTier of ['founding', 'lifetime', 'digital-representative'] as const) {
    for (const staleTier of ['founding', 'lifetime', 'digital-representative'] as const) {
      it(`preserves a signed ${keyTier} key across a crash with stale ${staleTier} metadata`, () => {
        const paidKey = generateTestLicenseKey({
          tier: keyTier,
          seat: keyTier === 'founding' ? 73 : undefined,
          exp: keyTier === 'digital-representative' ? '2099-01-01T00:00:00.000Z' : undefined,
          sub: 'paid-customer',
        });
        const setup = fixture(paidKey, staleTier);
        expect(() => migrate(setup, 'paid_entitlement_preserved'))
          .toThrow('Interrupted after paid_entitlement_preserved');
        migrate(setup);

        expect((setup.db.prepare('SELECT tier FROM license WHERE id = 1').get() as { tier: string }).tier)
          .toBe(keyTier);
        expect((setup.db.prepare("SELECT value FROM preferences WHERE key = 'active_license_key'").get() as { value: string }).value)
          .toBe(paidKey);
        expect((setup.db.prepare('SELECT COUNT(*) AS count FROM founding_reservations').get() as { count: number }).count)
          .toBe(0);
      });
    }
  }

  it('sets restrictive modes on the actual backup and hash marker', () => {
    const setup = fixture(VALID_TOKEN_SEAT_1);
    migrate(setup);
    if (process.platform !== 'win32') {
      expect(statSync(setup.backupPath).mode & 0o777).toBe(0o600);
      expect(statSync(`${setup.backupPath}.sha256`).mode & 0o777).toBe(0o600);
    }
  });

  it('upgrades the prior ciphertext schema and reruns a version-1 complete checkpoint', () => {
    const setup = fixture(VALID_TOKEN_SEAT_1);
    setup.db.exec(`
      CREATE TABLE founding_reservations (
        token_fingerprint TEXT PRIMARY KEY,
        token_ciphertext TEXT NOT NULL,
        token_iv TEXT NOT NULL,
        token_auth_tag TEXT NOT NULL,
        kind TEXT NOT NULL,
        seat INTEGER,
        imported_at TEXT NOT NULL
      );
      CREATE TABLE schema_migrations (
        migration_id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        checkpoint TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    setup.db.prepare(`
      INSERT INTO founding_reservations VALUES (
        'old-hash', ?, 'old-iv', 'old-tag', 'reservation_only', 1, '2026-01-01'
      )
    `).run(VALID_TOKEN_SEAT_1);
    setup.db.prepare(`
      INSERT INTO schema_migrations VALUES (
        'slice-1-reservation-entitlement-split', 1, 'complete', '2026-01-01'
      )
    `).run();

    migrate(setup);

    const columns = setup.db.prepare(
      "SELECT name FROM pragma_table_info('founding_reservations')",
    ).all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).not.toContain('token_ciphertext');
    expect(readFileSync(setup.dbPath).includes(Buffer.from(VALID_TOKEN_SEAT_1))).toBe(false);
    if (existsSync(`${setup.dbPath}-wal`)) {
      expect(readFileSync(`${setup.dbPath}-wal`).includes(Buffer.from(VALID_TOKEN_SEAT_1))).toBe(false);
    }
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

  for (const checkpoint of [
    'backup_complete',
    'reservation_recorded',
    'bearer_deleted',
    'storage_sanitized',
    'complete',
  ] as const) {
    it(`resumes idempotently after interruption at ${checkpoint}`, () => {
      const setup = fixture(VALID_TOKEN_SEAT_1);
      expect(() => migrate(setup, checkpoint)).toThrow(`Interrupted after ${checkpoint}`);

      migrate(setup);

      const store = new FoundingReservationStore(
        setup.db as unknown as DatabaseHandle,
      );
      expect(store.count()).toBe(1);
      expect(store.list()[0]).toMatchObject({ kind: 'reservation_only', seat: 1 });
      expect(setup.db.prepare('SELECT * FROM license WHERE id = 1').get()).toBeUndefined();
      expect(setup.db.prepare("SELECT value FROM preferences WHERE key = 'active_license_key'").get())
        .toBeUndefined();
      expect(readFileSync(setup.dbPath).includes(Buffer.from(VALID_TOKEN_SEAT_1))).toBe(false);
      if (existsSync(`${setup.dbPath}-wal`)) {
        expect(readFileSync(`${setup.dbPath}-wal`).includes(Buffer.from(VALID_TOKEN_SEAT_1))).toBe(false);
      }
    });
  }
});
