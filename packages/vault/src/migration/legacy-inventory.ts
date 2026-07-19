import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import {
  LEGACY_MIGRATION_DOMAINS,
  type AuditMetadataInventory,
  type LanceChunkInventoryAdapter,
  type LegacyInventoryCounts,
  type LegacyInventoryPaths,
  type LegacyInventoryRecord,
  type LegacyInventoryReport,
  type LegacyInventorySources,
  type LegacyMigrationDomain,
  type LegacySqliteDatabase,
  type LegacySqliteOpener,
} from './types.js';

export const VAULT_MIGRATION_ID = 'slice-3-vault-strangler';
export const LEGACY_SOURCE_ID_PREFIX = 'legacy';

function openSource(
  source: LegacySqliteDatabase | LegacySqliteOpener | undefined,
  path: string | undefined,
): LegacySqliteDatabase | null {
  if (source) {
    return typeof source === 'function' ? source() : source;
  }

  if (!path) {
    return null;
  }

  try {
    return new Database(path, { readonly: true, fileMustExist: true }) as LegacySqliteDatabase;
  } catch {
    return null;
  }
}

function tableExists(db: LegacySqliteDatabase, table: string): boolean {
  try {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(table) as { name?: string } | undefined;
    return row?.name === table;
  } catch {
    return false;
  }
}

function safeCount(db: LegacySqliteDatabase, table: string): number {
  if (!tableExists(db, table)) {
    return 0;
  }

  try {
    const row = db.prepare(`SELECT COUNT(*) as count FROM "${table}"`).get() as { count?: number } | undefined;
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

function safeGroupCount(db: LegacySqliteDatabase, table: string, column: string): Record<string, number> {
  if (!tableExists(db, table)) {
    return {};
  }

  try {
    const rows = db.prepare(
      `SELECT "${column}", COUNT(*) as count FROM "${table}" GROUP BY "${column}"`,
    ).all() as Array<Record<string, unknown>>;

    const result: Record<string, number> = {};
    for (const row of rows) {
      const key = String(row[column] ?? 'unknown');
      result[key] = Number(row.count ?? 0);
    }
    return result;
  } catch {
    return {};
  }
}

function safePreferenceKeys(db: LegacySqliteDatabase): string[] {
  if (tableExists(db, 'preferences')) {
    try {
      const rows = db.prepare('SELECT key FROM preferences ORDER BY key ASC').all() as Array<{ key: string }>;
      return rows.map((row) => row.key);
    } catch {
      return [];
    }
  }

  if (tableExists(db, 'kv')) {
    try {
      const rows = db.prepare('SELECT key FROM kv ORDER BY key ASC').all() as Array<{ key: string }>;
      return rows.map((row) => row.key);
    } catch {
      return [];
    }
  }

  return [];
}

function inventoryAuditMetadata(db: LegacySqliteDatabase | null): AuditMetadataInventory {
  if (!db || !tableExists(db, 'audit_log')) {
    return {
      totalEntries: 0,
      last24Hours: 0,
      errorEntries: 0,
      tablePresent: false,
    };
  }

  const total = safeCount(db, 'audit_log');
  let last24Hours = 0;
  let errorEntries = 0;

  try {
    const last24 = db.prepare(
      "SELECT COUNT(*) as count FROM audit_log WHERE timestamp > datetime('now','-1 day')",
    ).get() as { count?: number } | undefined;
    last24Hours = last24?.count ?? 0;
  } catch {
    last24Hours = 0;
  }

  try {
    const errors = db.prepare(
      "SELECT COUNT(*) as count FROM audit_log WHERE status = 'error'",
    ).get() as { count?: number } | undefined;
    errorEntries = errors?.count ?? 0;
  } catch {
    errorEntries = 0;
  }

  return {
    totalEntries: total,
    last24Hours,
    errorEntries,
    tablePresent: true,
  };
}

function inventoryLanceChunks(adapter: LanceChunkInventoryAdapter | undefined): number {
  if (!adapter) {
    return 0;
  }

  return adapter.countChunks();
}

export function buildStableLegacySourceId(domain: LegacyMigrationDomain, legacyId: string): string {
  return `${LEGACY_SOURCE_ID_PREFIX}:${domain}:${legacyId}`;
}

export function buildMigrationEventId(domain: LegacyMigrationDomain, legacyId: string): string {
  const digest = createHash('sha256')
    .update(`${VAULT_MIGRATION_ID}|${domain}|${legacyId}`, 'utf-8')
    .digest('hex')
    .slice(0, 32);
  return `vault-migration-v1-${domain}-${digest}`;
}

function listDocumentRecords(db: LegacySqliteDatabase): LegacyInventoryRecord[] {
  if (!tableExists(db, 'documents')) {
    return [];
  }

  try {
    const rows = db.prepare(
      'SELECT id, source, content_hash FROM documents ORDER BY id ASC',
    ).all() as Array<{ id: string; source: string; content_hash: string }>;

    return rows.map((row) => ({
      domain: 'documents',
      legacyId: row.id,
      stableSourceId: buildStableLegacySourceId('documents', row.id),
      contentHash: row.content_hash,
    }));
  } catch {
    return [];
  }
}

function listEntityRecords(db: LegacySqliteDatabase): LegacyInventoryRecord[] {
  if (!tableExists(db, 'entities')) {
    return [];
  }

  try {
    const rows = db.prepare('SELECT id FROM entities ORDER BY id ASC').all() as Array<{ id: string }>;
    return rows.map((row) => ({
      domain: 'entities',
      legacyId: row.id,
      stableSourceId: buildStableLegacySourceId('entities', row.id),
    }));
  } catch {
    return [];
  }
}

function listPreferenceRecords(db: LegacySqliteDatabase): LegacyInventoryRecord[] {
  const keys = safePreferenceKeys(db);
  return keys.map((key) => ({
    domain: 'preferences' as const,
    legacyId: key,
    stableSourceId: buildStableLegacySourceId('preferences', key),
  }));
}

function listEmailRecords(db: LegacySqliteDatabase): LegacyInventoryRecord[] {
  if (!tableExists(db, 'indexed_emails')) {
    return [];
  }

  try {
    const rows = db.prepare(
      'SELECT id, message_id FROM indexed_emails ORDER BY id ASC',
    ).all() as Array<{ id: string; message_id: string }>;

    return rows.map((row) => ({
      domain: 'email',
      legacyId: row.id,
      stableSourceId: buildStableLegacySourceId('email', row.message_id || row.id),
    }));
  } catch {
    return [];
  }
}

function listCalendarRecords(db: LegacySqliteDatabase): LegacyInventoryRecord[] {
  if (!tableExists(db, 'indexed_calendar_events')) {
    return [];
  }

  try {
    const rows = db.prepare('SELECT id, uid FROM indexed_calendar_events ORDER BY id ASC').all() as Array<{
      id: string;
      uid: string;
    }>;

    return rows.map((row) => ({
      domain: 'calendar',
      legacyId: row.id,
      stableSourceId: buildStableLegacySourceId('calendar', row.uid || row.id),
    }));
  } catch {
    return [];
  }
}

function listVectorRecords(adapter: LanceChunkInventoryAdapter | undefined): LegacyInventoryRecord[] {
  if (!adapter?.listChunkIds) {
    const count = inventoryLanceChunks(adapter);
    return Array.from({ length: count }, (_, index) => ({
      domain: 'vectors' as const,
      legacyId: `chunk-${index + 1}`,
      stableSourceId: buildStableLegacySourceId('vectors', `chunk-${index + 1}`),
    }));
  }

  return adapter.listChunkIds().map((chunkId) => ({
    domain: 'vectors',
    legacyId: chunkId,
    stableSourceId: buildStableLegacySourceId('vectors', chunkId),
  }));
}

export function scanLegacyInventory(
  sources: LegacyInventorySources,
  paths: LegacyInventoryPaths = {},
): LegacyInventoryReport {
  const coreDb = openSource(sources.coreDb, paths.coreDbPath);
  const documentsDb = openSource(sources.documentsDb, paths.documentsDbPath);
  const auditDb = openSource(sources.auditDb, paths.auditDbPath);

  const counts: LegacyInventoryCounts = {
    preferences: coreDb ? safeCount(coreDb, 'preferences') || safeCount(coreDb, 'kv') : 0,
    documents: documentsDb ? safeCount(documentsDb, 'documents') : 0,
    entities: documentsDb ? safeCount(documentsDb, 'entities') : 0,
    entityMentions: documentsDb ? safeCount(documentsDb, 'entity_mentions') : 0,
    lanceChunks: inventoryLanceChunks(sources.lanceChunks),
    indexedEmails: documentsDb ? safeCount(documentsDb, 'indexed_emails') : 0,
    indexedCalendarEvents: documentsDb ? safeCount(documentsDb, 'indexed_calendar_events') : 0,
    audit: inventoryAuditMetadata(auditDb),
  };

  const recordsByDomain: Partial<Record<LegacyMigrationDomain, LegacyInventoryRecord[]>> = {};

  if (documentsDb) {
    recordsByDomain.documents = listDocumentRecords(documentsDb);
    recordsByDomain.entities = listEntityRecords(documentsDb);
    recordsByDomain.email = listEmailRecords(documentsDb);
    recordsByDomain.calendar = listCalendarRecords(documentsDb);
  }

  if (coreDb) {
    recordsByDomain.preferences = listPreferenceRecords(coreDb);
  }

  recordsByDomain.vectors = listVectorRecords(sources.lanceChunks);

  for (const domain of LEGACY_MIGRATION_DOMAINS) {
    if (!recordsByDomain[domain]) {
      recordsByDomain[domain] = [];
    }
  }

  const documentSources = documentsDb ? safeGroupCount(documentsDb, 'documents', 'source') : {};
  const preferenceKeys = coreDb ? safePreferenceKeys(coreDb) : [];

  if (coreDb?.close) {
    coreDb.close();
  }
  if (documentsDb?.close) {
    documentsDb.close();
  }
  if (auditDb?.close) {
    auditDb.close();
  }

  return {
    scannedAt: new Date().toISOString(),
    counts,
    recordsByDomain,
    documentSources,
    preferenceKeys,
  };
}
