// Migration Runner — Checks schema version on every launch, runs pending migrations.
//
// Same interface as desktop. Migrations are append-only (never removed or modified).
// Schema version stored in SQLite `_migrations` table.
//
// CRITICAL: Migrations run before any other data access on startup.

/**
 * Minimal SQLite interface — matches both better-sqlite3 (desktop) and
 * the mobile SQLite adapter shape.
 */
export interface MigrationDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): void;
  };
}

export interface Migration {
  /** Unique version identifier (ISO timestamp or semver-style, must be sortable) */
  version: string;
  /** Human-readable description */
  description: string;
  /** The SQL or function to execute */
  up: (db: MigrationDatabase) => void;
}

const CREATE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS _migrations (
    version TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

/**
 * All migrations in order. Append-only — never remove or modify existing entries.
 */
const MIGRATIONS: Migration[] = [
  // Migrations will be added here as the schema evolves.
];

/**
 * Run all pending migrations on the given database.
 * Safe to call every launch — idempotent.
 *
 * @returns Number of migrations applied in this run
 */
export function runMigrations(db: MigrationDatabase): number {
  // Ensure the _migrations table exists
  db.exec(CREATE_MIGRATIONS_TABLE);

  // Get already-applied versions
  const applied = new Set(
    (db.prepare('SELECT version FROM _migrations ORDER BY version ASC').all() as Array<{ version: string }>)
      .map((row) => row.version),
  );

  let count = 0;

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    // Run migration (mobile SQLite may not support transactions the same way,
    // so we run directly and rely on WAL mode for crash safety)
    migration.up(db);
    db.prepare(
      'INSERT INTO _migrations (version, description) VALUES (?, ?)',
    ).run(migration.version, migration.description);

    count++;
    console.log(`[MigrationRunner] Applied: ${migration.version} — ${migration.description}`);
  }

  if (count > 0) {
    console.log(`[MigrationRunner] Applied ${count} migration(s)`);
  }

  return count;
}

/**
 * Get the current schema version (last applied migration version).
 */
export function getCurrentVersion(db: MigrationDatabase): string | null {
  db.exec(CREATE_MIGRATIONS_TABLE);
  const row = db.prepare(
    'SELECT version FROM _migrations ORDER BY version DESC LIMIT 1',
  ).get() as { version: string } | undefined;
  return row?.version ?? null;
}

/**
 * Get the count of pending migrations.
 */
export function getPendingCount(db: MigrationDatabase): number {
  db.exec(CREATE_MIGRATIONS_TABLE);
  const applied = new Set(
    (db.prepare('SELECT version FROM _migrations').all() as Array<{ version: string }>)
      .map((row) => row.version),
  );
  return MIGRATIONS.filter((m) => !applied.has(m.version)).length;
}
