import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildMigrationEventId,
  buildStableLegacySourceId,
  createEventLog,
  createPreMigrationBackup,
  generateMigrationDryRunReport,
  importLegacyDomain,
  rollbackFromBackup,
  scanLegacyInventory,
} from '../src/index.js';

const ROOT_KEY = randomBytes(32);
const DEVICE_ID = 'device-test-001';

const DOCUMENTS_DDL = `
  CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_path TEXT,
    title TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    indexed_at TEXT NOT NULL,
    metadata TEXT
  );
`;

const CORE_PREFS_DDL = `
  CREATE TABLE preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

const AUDIT_DDL = `
  CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    status TEXT NOT NULL
  );
`;

function createFixtureSources(rootDir: string) {
  const coreDbPath = join(rootDir, 'core.db');
  const documentsDbPath = join(rootDir, 'documents.db');
  const auditDbPath = join(rootDir, 'audit.db');

  const coreDb = new Database(coreDbPath);
  coreDb.exec(CORE_PREFS_DDL);
  coreDb.prepare(
    "INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)",
  ).run('user_name', 'Sky', '2026-07-18T10:00:00.000Z');
  coreDb.prepare(
    "INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)",
  ).run('ai_name', 'Semblance', '2026-07-18T10:00:00.000Z');
  coreDb.close();

  const documentsDb = new Database(documentsDbPath);
  documentsDb.exec(DOCUMENTS_DDL);
  const fixtureDocs = [
    {
      id: 'doc-alpha',
      source: 'file',
      title: 'Alpha Notes',
      hash: 'hash-alpha',
    },
    {
      id: 'doc-beta',
      source: 'email',
      title: 'Beta Report',
      hash: 'hash-beta',
    },
    {
      id: 'doc-gamma',
      source: 'calendar',
      title: 'Gamma Agenda',
      hash: 'hash-gamma',
    },
  ];

  for (const doc of fixtureDocs) {
    documentsDb.prepare(
      `INSERT INTO documents (
        id, source, source_path, title, content_hash, mime_type,
        created_at, updated_at, indexed_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      doc.id,
      doc.source,
      `/tmp/${doc.id}.txt`,
      doc.title,
      doc.hash,
      'text/plain',
      '2026-07-18T09:00:00.000Z',
      '2026-07-18T09:30:00.000Z',
      '2026-07-18T10:00:00.000Z',
      JSON.stringify({ fixture: true }),
    );
  }
  documentsDb.close();

  const auditDb = new Database(auditDbPath);
  auditDb.exec(AUDIT_DDL);
  auditDb.prepare('INSERT INTO audit_log (id, timestamp, status) VALUES (?, ?, ?)').run(
    'audit-1',
    '2026-07-18T11:00:00.000Z',
    'success',
  );
  auditDb.prepare('INSERT INTO audit_log (id, timestamp, status) VALUES (?, ?, ?)').run(
    'audit-2',
    '2026-07-18T11:05:00.000Z',
    'error',
  );
  auditDb.close();

  return {
    coreDbPath,
    documentsDbPath,
    auditDbPath,
    fixtureDocs,
    lanceChunks: {
      countChunks: () => 4,
      listChunkIds: () => ['chunk-doc-alpha-1', 'chunk-doc-beta-1', 'chunk-doc-gamma-1', 'chunk-doc-gamma-2'],
    },
  };
}

describe('vault legacy migration', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  function makeTempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  it('inventory finds expected counts from fixture databases and adapters', () => {
    const root = makeTempDir('semblance-vault-migration-inventory-');
    const fixtures = createFixtureSources(root);

    const report = scanLegacyInventory(
      {
        coreDb: () => new Database(fixtures.coreDbPath, { readonly: true }),
        documentsDb: () => new Database(fixtures.documentsDbPath, { readonly: true }),
        auditDb: () => new Database(fixtures.auditDbPath, { readonly: true }),
        lanceChunks: fixtures.lanceChunks,
      },
      {
        coreDbPath: fixtures.coreDbPath,
        documentsDbPath: fixtures.documentsDbPath,
        auditDbPath: fixtures.auditDbPath,
      },
    );

    expect(report.counts.preferences).toBe(2);
    expect(report.counts.documents).toBe(3);
    expect(report.counts.lanceChunks).toBe(4);
    expect(report.counts.audit.totalEntries).toBe(2);
    expect(report.counts.audit.errorEntries).toBe(1);
    expect(report.recordsByDomain.documents?.map((record) => record.legacyId)).toEqual([
      'doc-alpha',
      'doc-beta',
      'doc-gamma',
    ]);
    expect(report.preferenceKeys).toEqual(['ai_name', 'user_name']);
  });

  it('generates a dry-run report with would-import IDs and zero conflicts on empty vault', () => {
    const root = makeTempDir('semblance-vault-migration-dryrun-');
    const fixtures = createFixtureSources(root);
    const vaultDb = new Database(':memory:');

    const dryRun = generateMigrationDryRunReport({
      sources: {
        coreDb: () => new Database(fixtures.coreDbPath, { readonly: true }),
        documentsDb: () => new Database(fixtures.documentsDbPath, { readonly: true }),
        auditDb: () => new Database(fixtures.auditDbPath, { readonly: true }),
        lanceChunks: fixtures.lanceChunks,
      },
      vaultDb,
      domains: ['documents', 'preferences', 'vectors'],
    });

    expect(dryRun.totalWouldImport).toBe(9);
    expect(dryRun.totalConflicts).toBe(0);
    expect(dryRun.domains.documents?.wouldImportCount).toBe(3);
    expect(dryRun.domains.documents?.wouldImportIds).toEqual([
      buildStableLegacySourceId('documents', 'doc-alpha'),
      buildStableLegacySourceId('documents', 'doc-beta'),
      buildStableLegacySourceId('documents', 'doc-gamma'),
    ]);
    expect(dryRun.domains.preferences?.wouldImportCount).toBe(2);
    expect(dryRun.domains.vectors?.wouldImportCount).toBe(4);
  });

  it('imports the documents domain into the vault event log with stable source IDs', () => {
    const root = makeTempDir('semblance-vault-migration-import-');
    const fixtures = createFixtureSources(root);
    const vaultDb = new Database(join(root, 'vault-events.db'));
    const log = createEventLog({
      db: vaultDb,
      rootKey: ROOT_KEY,
      writerId: randomBytes(8).toString('hex'),
    });

    const result = importLegacyDomain(
      'documents',
      {
        documentsDb: () => new Database(fixtures.documentsDbPath, { readonly: true }),
      },
      {
        eventLog: log,
        deviceId: DEVICE_ID,
        membershipEpoch: 2,
      },
    );

    expect(result.importedCount).toBe(3);
    expect(result.sourceIds).toEqual([
      buildStableLegacySourceId('documents', 'doc-alpha'),
      buildStableLegacySourceId('documents', 'doc-beta'),
      buildStableLegacySourceId('documents', 'doc-gamma'),
    ]);

    const rows = vaultDb.prepare(
      'SELECT event_id, event_type, source_refs_json FROM vault_event_log ORDER BY sequence ASC',
    ).all() as Array<{ event_id: string; event_type: string; source_refs_json: string }>;

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.event_type === 'source_ingested')).toBe(true);
    expect(rows.map((row) => row.event_id)).toEqual([
      buildMigrationEventId('documents', 'doc-alpha'),
      buildMigrationEventId('documents', 'doc-beta'),
      buildMigrationEventId('documents', 'doc-gamma'),
    ]);

    const parsedRefs = rows.map((row) => JSON.parse(row.source_refs_json) as Array<{ sourceId: string }>);
    expect(parsedRefs.map((refs) => refs[0]?.sourceId)).toEqual(result.sourceIds);

    log.writer.release();
  });

  it('rollback restores pre-migration sqlite state from backup snapshot', () => {
    const root = makeTempDir('semblance-vault-migration-rollback-');
    const fixtures = createFixtureSources(root);

    const snapshot = createPreMigrationBackup({
      sourcePaths: [fixtures.documentsDbPath, fixtures.coreDbPath],
      backupRootDir: join(root, 'backups'),
    });

    writeFileSync(
      fixtures.documentsDbPath,
      '-- mutated after migration attempt\n',
      'utf-8',
    );
    writeFileSync(fixtures.coreDbPath, '-- mutated core\n', 'utf-8');

    const rollback = rollbackFromBackup(snapshot);
    expect(rollback.verified).toBe(true);

    const restoredDocuments = readFileSync(fixtures.documentsDbPath);
    const restoredCore = readFileSync(fixtures.coreDbPath);
    const backupDocuments = readFileSync(snapshot.files.find((file) => file.sourcePath.endsWith('documents.db'))!.backupPath);
    const backupCore = readFileSync(snapshot.files.find((file) => file.sourcePath.endsWith('core.db'))!.backupPath);

    expect(restoredDocuments.equals(backupDocuments)).toBe(true);
    expect(restoredCore.equals(backupCore)).toBe(true);

    const documentsDb = new Database(fixtures.documentsDbPath, { readonly: true });
    const count = documentsDb.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
    expect(count.count).toBe(3);
    documentsDb.close();
  });
});
