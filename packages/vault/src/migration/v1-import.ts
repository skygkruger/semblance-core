import type Database from 'better-sqlite3';
import { createSourceRef } from '../provenance/source-ref.js';
import {
  buildMigrationEventId,
  buildStableLegacySourceId,
  scanLegacyInventory,
} from './legacy-inventory.js';
import type {
  LegacyInventorySources,
  LegacyMigrationDomain,
  LegacySqliteDatabase,
  MigrationImportOptions,
  MigrationImportResult,
} from './types.js';

interface LegacyDocumentRow {
  id: string;
  source: string;
  source_path: string | null;
  title: string;
  content_hash: string;
  mime_type: string;
  created_at: string;
  updated_at: string;
  indexed_at: string;
  metadata: string | null;
}

interface LegacyPreferenceRow {
  key: string;
  value: string;
  updated_at: string;
}

interface LegacyEmailRow {
  id: string;
  message_id: string;
  subject: string;
  received_at: string;
  account_id: string;
}

interface LegacyCalendarRow {
  id: string;
  uid: string;
  title: string;
  start_time: string;
  account_id: string;
}

interface LegacyEntityRow {
  id: string;
  name: string;
  type: string;
  first_seen: string;
  last_seen: string;
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

function resolveDocumentsDb(sources: LegacyInventorySources): LegacySqliteDatabase | null {
  if (!sources.documentsDb) {
    return null;
  }
  return typeof sources.documentsDb === 'function' ? sources.documentsDb() : sources.documentsDb;
}

function resolveCoreDb(sources: LegacyInventorySources): LegacySqliteDatabase | null {
  if (!sources.coreDb) {
    return null;
  }
  return typeof sources.coreDb === 'function' ? sources.coreDb() : sources.coreDb;
}

function resolveVaultDataDomain(domain: LegacyMigrationDomain): string {
  if (domain === 'preferences') {
    return 'preferences';
  }
  if (domain === 'entities') {
    return 'agency';
  }
  return 'documents';
}

function appendSourceIngested(
  options: MigrationImportOptions,
  params: {
    domain: LegacyMigrationDomain;
    legacyId: string;
    sourceType: string;
    uri: string;
    ingestedAt: string;
    payload: Record<string, unknown>;
  },
  existingEventIds?: Set<string>,
): { eventId: string; stableSourceId: string; skipped: boolean } {
  const eventId = buildMigrationEventId(params.domain, params.legacyId);
  const stableSourceId = buildStableLegacySourceId(params.domain, params.legacyId);

  if (existingEventIds?.has(eventId)) {
    return { eventId, stableSourceId, skipped: true };
  }

  options.eventLog.writer.append({
    eventId,
    dataDomain: resolveVaultDataDomain(params.domain),
    deviceId: options.deviceId,
    membershipEpoch: options.membershipEpoch ?? 1,
    eventType: 'source_ingested',
    sourceRefs: [
      createSourceRef({
        sourceId: stableSourceId,
        sourceType: params.sourceType,
        uri: params.uri,
        ingestedAt: params.ingestedAt,
      }),
    ],
    sensitivity: options.sensitivity ?? 'personal',
    occurredAt: params.ingestedAt,
    payloadPlaintext: JSON.stringify(params.payload),
  });

  existingEventIds?.add(eventId);

  return { eventId, stableSourceId, skipped: false };
}

function importDocumentsDomain(
  db: LegacySqliteDatabase,
  options: MigrationImportOptions,
  existingEventIds?: Set<string>,
): MigrationImportResult {
  const rows = db.prepare(
    `SELECT id, source, source_path, title, content_hash, mime_type, created_at, updated_at, indexed_at, metadata
     FROM documents ORDER BY id ASC`,
  ).all() as LegacyDocumentRow[];

  const eventIds: string[] = [];
  const sourceIds: string[] = [];
  let skippedConflicts = 0;

  for (const row of rows) {
    const appended = appendSourceIngested(options, {
      domain: 'documents',
      legacyId: row.id,
      sourceType: row.source,
      uri: row.source_path ? `file://${row.source_path}` : `legacy://documents/${row.id}`,
      ingestedAt: row.indexed_at,
      payload: {
        schemaVersion: 1,
        documentId: row.id,
        title: row.title,
        mimeType: row.mime_type,
        sourcePath: row.source_path ?? undefined,
        contentHash: row.content_hash,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    }, existingEventIds);

    if (appended.skipped) {
      skippedConflicts += 1;
      continue;
    }

    eventIds.push(appended.eventId);
    sourceIds.push(appended.stableSourceId);
  }

  return {
    domain: 'documents',
    importedCount: eventIds.length,
    skippedConflicts,
    eventIds,
    sourceIds,
  };
}

function collectImportedRecords(
  domain: LegacyMigrationDomain,
  records: Array<{
    domain: LegacyMigrationDomain;
    legacyId: string;
    sourceType: string;
    uri: string;
    ingestedAt: string;
    payload: Record<string, unknown>;
  }>,
  options: MigrationImportOptions,
  existingEventIds?: Set<string>,
): MigrationImportResult {
  const eventIds: string[] = [];
  const sourceIds: string[] = [];
  let skippedConflicts = 0;

  for (const record of records) {
    const appended = appendSourceIngested(options, record, existingEventIds);
    if (appended.skipped) {
      skippedConflicts += 1;
      continue;
    }
    eventIds.push(appended.eventId);
    sourceIds.push(appended.stableSourceId);
  }

  return {
    domain,
    importedCount: eventIds.length,
    skippedConflicts,
    eventIds,
    sourceIds,
  };
}

function importPreferencesDomain(
  db: LegacySqliteDatabase,
  options: MigrationImportOptions,
  existingEventIds?: Set<string>,
): MigrationImportResult {
  const table = tableExists(db, 'preferences') ? 'preferences' : tableExists(db, 'kv') ? 'kv' : null;
  if (!table) {
    return {
      domain: 'preferences',
      importedCount: 0,
      skippedConflicts: 0,
      eventIds: [],
      sourceIds: [],
    };
  }

  const rows = db.prepare(`SELECT key, value, updated_at FROM ${table} ORDER BY key ASC`).all() as LegacyPreferenceRow[];
  return collectImportedRecords(
    'preferences',
    rows.map((row) => ({
      domain: 'preferences' as const,
      legacyId: row.key,
      sourceType: 'preference',
      uri: `legacy://preferences/${encodeURIComponent(row.key)}`,
      ingestedAt: row.updated_at,
      payload: {
        schemaVersion: 1,
        key: row.key,
        value: row.value,
      },
    })),
    options,
    existingEventIds,
  );
}

function importEmailDomain(
  db: LegacySqliteDatabase,
  options: MigrationImportOptions,
  existingEventIds?: Set<string>,
): MigrationImportResult {
  if (!tableExists(db, 'indexed_emails')) {
    return {
      domain: 'email',
      importedCount: 0,
      skippedConflicts: 0,
      eventIds: [],
      sourceIds: [],
    };
  }

  const rows = db.prepare(
    'SELECT id, message_id, subject, received_at, account_id FROM indexed_emails ORDER BY id ASC',
  ).all() as LegacyEmailRow[];

  return collectImportedRecords(
    'email',
    rows.map((row) => {
      const legacyId = row.message_id || row.id;
      return {
        domain: 'email' as const,
        legacyId,
        sourceType: 'email',
        uri: `email://legacy/${encodeURIComponent(legacyId)}`,
        ingestedAt: row.received_at,
        payload: {
          schemaVersion: 1,
          messageId: legacyId,
          subject: row.subject,
          accountId: row.account_id,
        },
      };
    }),
    options,
    existingEventIds,
  );
}

function importCalendarDomain(
  db: LegacySqliteDatabase,
  options: MigrationImportOptions,
  existingEventIds?: Set<string>,
): MigrationImportResult {
  if (!tableExists(db, 'indexed_calendar_events')) {
    return {
      domain: 'calendar',
      importedCount: 0,
      skippedConflicts: 0,
      eventIds: [],
      sourceIds: [],
    };
  }

  const rows = db.prepare(
    'SELECT id, uid, title, start_time, account_id FROM indexed_calendar_events ORDER BY id ASC',
  ).all() as LegacyCalendarRow[];

  return collectImportedRecords(
    'calendar',
    rows.map((row) => {
      const legacyId = row.uid || row.id;
      return {
        domain: 'calendar' as const,
        legacyId,
        sourceType: 'calendar',
        uri: `calendar://legacy/${encodeURIComponent(legacyId)}`,
        ingestedAt: row.start_time,
        payload: {
          schemaVersion: 1,
          uid: legacyId,
          title: row.title,
          accountId: row.account_id,
        },
      };
    }),
    options,
    existingEventIds,
  );
}

function importEntitiesDomain(
  db: LegacySqliteDatabase,
  options: MigrationImportOptions,
  existingEventIds?: Set<string>,
): MigrationImportResult {
  if (!tableExists(db, 'entities')) {
    return {
      domain: 'entities',
      importedCount: 0,
      skippedConflicts: 0,
      eventIds: [],
      sourceIds: [],
    };
  }

  const rows = db.prepare(
    'SELECT id, name, type, first_seen, last_seen FROM entities ORDER BY id ASC',
  ).all() as LegacyEntityRow[];

  return collectImportedRecords(
    'entities',
    rows.map((row) => ({
      domain: 'entities' as const,
      legacyId: row.id,
      sourceType: 'entity',
      uri: `legacy://entities/${row.id}`,
      ingestedAt: row.last_seen,
      payload: {
        schemaVersion: 1,
        entityId: row.id,
        name: row.name,
        entityType: row.type,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
      },
    })),
    options,
    existingEventIds,
  );
}

function importVectorsDomain(
  sources: LegacyInventorySources,
  options: MigrationImportOptions,
  existingEventIds?: Set<string>,
): MigrationImportResult {
  const adapter = sources.lanceChunks;
  if (!adapter) {
    return {
      domain: 'vectors',
      importedCount: 0,
      skippedConflicts: 0,
      eventIds: [],
      sourceIds: [],
    };
  }

  const chunkIds = adapter.listChunkIds?.() ?? Array.from(
    { length: adapter.countChunks() },
    (_, index) => `chunk-${index + 1}`,
  );

  return collectImportedRecords(
    'vectors',
    chunkIds.map((chunkId) => ({
      domain: 'vectors' as const,
      legacyId: chunkId,
      sourceType: 'vector_chunk',
      uri: `legacy://vectors/${encodeURIComponent(chunkId)}`,
      ingestedAt: new Date().toISOString(),
      payload: {
        schemaVersion: 1,
        chunkId,
      },
    })),
    options,
    existingEventIds,
  );
}

export interface LegacyDomainImportOptions extends MigrationImportOptions {
  existingEventIds?: Set<string>;
}

export function importLegacyDomain(
  domain: LegacyMigrationDomain,
  sources: LegacyInventorySources,
  options: LegacyDomainImportOptions,
): MigrationImportResult {
  const existingEventIds = options.existingEventIds;

  switch (domain) {
    case 'documents': {
      const db = resolveDocumentsDb(sources);
      if (!db) {
        throw new Error('documentsDb source is required to import documents domain');
      }
      return importDocumentsDomain(db, options, existingEventIds);
    }
    case 'preferences': {
      const db = resolveCoreDb(sources);
      if (!db) {
        throw new Error('coreDb source is required to import preferences domain');
      }
      return importPreferencesDomain(db, options, existingEventIds);
    }
    case 'email': {
      const db = resolveDocumentsDb(sources);
      if (!db) {
        throw new Error('documentsDb source is required to import email domain');
      }
      return importEmailDomain(db, options, existingEventIds);
    }
    case 'calendar': {
      const db = resolveDocumentsDb(sources);
      if (!db) {
        throw new Error('documentsDb source is required to import calendar domain');
      }
      return importCalendarDomain(db, options, existingEventIds);
    }
    case 'entities': {
      const db = resolveDocumentsDb(sources);
      if (!db) {
        throw new Error('documentsDb source is required to import entities domain');
      }
      return importEntitiesDomain(db, options, existingEventIds);
    }
    case 'vectors':
      return importVectorsDomain(sources, options, existingEventIds);
    default: {
      const exhaustive: never = domain;
      throw new Error(`Unsupported migration domain: ${exhaustive}`);
    }
  }
}

export function importLegacyInventory(
  sources: LegacyInventorySources,
  options: LegacyDomainImportOptions,
  domains?: LegacyMigrationDomain[],
): MigrationImportResult[] {
  const inventory = scanLegacyInventory(sources);
  const selected = domains ?? (Object.keys(inventory.recordsByDomain) as LegacyMigrationDomain[]);
  const existingEventIds = options.existingEventIds ?? new Set<string>();
  return selected.map((domain) => importLegacyDomain(domain, sources, { ...options, existingEventIds }));
}

export function loadExistingVaultEventIds(vaultDb: Database.Database): Set<string> {
  try {
    const rows = vaultDb.prepare('SELECT event_id FROM vault_event_log').all() as Array<{ event_id: string }>;
    return new Set(rows.map((row) => row.event_id));
  } catch {
    return new Set();
  }
}

export function importLegacyDomainSkippingConflicts(
  domain: LegacyMigrationDomain,
  sources: LegacyInventorySources,
  options: MigrationImportOptions,
  existingEventIds: Set<string>,
): MigrationImportResult {
  return importLegacyDomain(domain, sources, { ...options, existingEventIds });
}
