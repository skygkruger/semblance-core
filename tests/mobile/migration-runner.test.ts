// Mobile Migration Runner Tests — Generic SQLite migration interface.
//
// Covers:
// - MigrationDatabase interface contract
// - Creates _migrations table
// - Idempotent — safe to call multiple times
// - getCurrentVersion and getPendingCount
// - Works with the generic MigrationDatabase interface (not better-sqlite3)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  runMigrations,
  getCurrentVersion,
  getPendingCount,
} from '@semblance/mobile/migrations/index';
import type { MigrationDatabase } from '@semblance/mobile/migrations/index';

/**
 * Create a mock MigrationDatabase that stores data in-memory.
 * Simulates SQLite behavior with a simple Map-based store.
 */
function createMockDb(): MigrationDatabase {
  const tables = new Map<string, Array<Record<string, unknown>>>();
  let migrationTableCreated = false;

  return {
    exec(sql: string): void {
      if (sql.includes('CREATE TABLE IF NOT EXISTS _migrations')) {
        if (!migrationTableCreated) {
          tables.set('_migrations', []);
          migrationTableCreated = true;
        }
      }
    },

    prepare(sql: string) {
      return {
        all(...params: unknown[]): unknown[] {
          if (!migrationTableCreated) return [];
          const rows = tables.get('_migrations') ?? [];

          if (sql.includes('SELECT version FROM _migrations ORDER BY version ASC')) {
            return rows
              .map((r) => ({ version: r.version }))
              .sort((a, b) => String(a.version).localeCompare(String(b.version)));
          }
          if (sql.includes('SELECT version FROM _migrations')) {
            return rows.map((r) => ({ version: r.version }));
          }
          return rows;
        },

        get(...params: unknown[]): unknown {
          if (!migrationTableCreated) return undefined;
          const rows = tables.get('_migrations') ?? [];

          if (sql.includes('SELECT version FROM _migrations ORDER BY version DESC LIMIT 1')) {
            const sorted = rows
              .map((r) => ({ version: String(r.version) }))
              .sort((a, b) => b.version.localeCompare(a.version));
            return sorted[0];
          }
          return rows[0];
        },

        run(...params: unknown[]): void {
          if (sql.includes('INSERT INTO _migrations')) {
            const rows = tables.get('_migrations') ?? [];
            rows.push({ version: params[0], description: params[1] });
            tables.set('_migrations', rows);
          }
        },
      };
    },
  };
}

describe('Mobile Migration Runner', () => {
  let db: MigrationDatabase;

  beforeEach(() => {
    db = createMockDb();
  });

  // ─── Table Creation ───────────────────────────────────────────────────

  it('creates _migrations table on first run', () => {
    runMigrations(db);
    // The mock tracks this internally — verify by calling getCurrentVersion
    const version = getCurrentVersion(db);
    expect(version).toBeNull();
  });

  // ─── No Migrations ───────────────────────────────────────────────────

  it('returns 0 when no migrations to apply', () => {
    const count = runMigrations(db);
    expect(count).toBe(0);
  });

  it('is idempotent', () => {
    runMigrations(db);
    const second = runMigrations(db);
    expect(second).toBe(0);
  });

  // ─── getCurrentVersion ────────────────────────────────────────────────

  it('getCurrentVersion returns null when no migrations applied', () => {
    const version = getCurrentVersion(db);
    expect(version).toBeNull();
  });

  // ─── getPendingCount ──────────────────────────────────────────────────

  it('getPendingCount returns 0 when MIGRATIONS array is empty', () => {
    const count = getPendingCount(db);
    expect(count).toBe(0);
  });

  // ─── Interface Contract ───────────────────────────────────────────────

  it('MigrationDatabase interface has exec, prepare methods', () => {
    expect(typeof db.exec).toBe('function');
    expect(typeof db.prepare).toBe('function');
  });

  it('prepare returns object with all, get, run methods', () => {
    const stmt = db.prepare('SELECT 1');
    expect(typeof stmt.all).toBe('function');
    expect(typeof stmt.get).toBe('function');
    expect(typeof stmt.run).toBe('function');
  });
});
