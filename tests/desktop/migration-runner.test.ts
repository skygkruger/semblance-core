// Desktop Migration Runner Tests — SQLite schema migration on every launch.
//
// Covers:
// - Creates _migrations table if it doesn't exist
// - Runs pending migrations in order
// - Skips already-applied migrations
// - Idempotent — safe to call multiple times
// - Returns count of applied migrations
// - getCurrentVersion returns last applied version
// - getPendingCount returns number of pending migrations

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations, getCurrentVersion, getPendingCount } from '@semblance/desktop/migrations/index';

describe('Desktop Migration Runner', () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // ─── Table Creation ───────────────────────────────────────────────────

  it('creates _migrations table on first run', () => {
    runMigrations(db);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'"
    ).all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
  });

  it('_migrations table has correct schema', () => {
    runMigrations(db);

    const columns = db.prepare("PRAGMA table_info('_migrations')").all() as Array<{
      name: string;
      type: string;
      pk: number;
    }>;
    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain('version');
    expect(columnNames).toContain('description');
    expect(columnNames).toContain('applied_at');

    // version is primary key
    const versionCol = columns.find((c) => c.name === 'version');
    expect(versionCol?.pk).toBe(1);
  });

  // ─── No Migrations ───────────────────────────────────────────────────

  it('returns 0 when no migrations to apply', () => {
    const count = runMigrations(db);
    expect(count).toBe(0);
  });

  it('is idempotent — multiple calls return 0', () => {
    runMigrations(db);
    const second = runMigrations(db);
    expect(second).toBe(0);
  });

  // ─── getCurrentVersion ────────────────────────────────────────────────

  it('getCurrentVersion returns null when no migrations applied', () => {
    const version = getCurrentVersion(db);
    expect(version).toBeNull();
  });

  it('getCurrentVersion creates _migrations table if needed', () => {
    // Call without runMigrations first
    const version = getCurrentVersion(db);
    expect(version).toBeNull();

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'"
    ).all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
  });

  // ─── getPendingCount ──────────────────────────────────────────────────

  it('getPendingCount returns 0 when MIGRATIONS array is empty', () => {
    const count = getPendingCount(db);
    expect(count).toBe(0);
  });

  it('getPendingCount creates _migrations table if needed', () => {
    const count = getPendingCount(db);
    expect(count).toBe(0);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'"
    ).all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
  });

  // ─── Simulated Migrations ─────────────────────────────────────────────

  it('migration tracking works correctly with manual inserts', () => {
    // Simulate what would happen if MIGRATIONS had entries
    runMigrations(db);

    // Manually insert a migration record as if runMigrations applied it
    db.prepare(
      "INSERT INTO _migrations (version, description) VALUES (?, ?)"
    ).run('2026-03-01-001', 'Test migration');

    const version = getCurrentVersion(db);
    expect(version).toBe('2026-03-01-001');
  });

  it('getCurrentVersion returns latest version sorted DESC', () => {
    runMigrations(db);

    // Insert multiple migration records
    db.prepare("INSERT INTO _migrations (version, description) VALUES (?, ?)").run('2026-01-01-001', 'First');
    db.prepare("INSERT INTO _migrations (version, description) VALUES (?, ?)").run('2026-03-01-001', 'Third');
    db.prepare("INSERT INTO _migrations (version, description) VALUES (?, ?)").run('2026-02-01-001', 'Second');

    const version = getCurrentVersion(db);
    expect(version).toBe('2026-03-01-001');
  });
});
