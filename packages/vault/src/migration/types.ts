import type Database from 'better-sqlite3';

export type LegacyMigrationDomain =
  | 'documents'
  | 'preferences'
  | 'email'
  | 'calendar'
  | 'vectors'
  | 'entities';

export const LEGACY_MIGRATION_DOMAINS: LegacyMigrationDomain[] = [
  'documents',
  'preferences',
  'email',
  'calendar',
  'vectors',
  'entities',
];

export interface LegacySqliteDatabase {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown | undefined;
    run(...params: unknown[]): { changes?: number };
  };
  exec(sql: string): void;
  close?(): void;
}

export type LegacySqliteOpener = () => LegacySqliteDatabase;

export interface LanceChunkInventoryAdapter {
  countChunks(): number;
  listChunkIds?(): string[];
}

export interface AuditMetadataInventory {
  totalEntries: number;
  last24Hours: number;
  errorEntries: number;
  tablePresent: boolean;
}

export interface LegacyInventoryCounts {
  preferences: number;
  documents: number;
  entities: number;
  entityMentions: number;
  lanceChunks: number;
  indexedEmails: number;
  indexedCalendarEvents: number;
  audit: AuditMetadataInventory;
}

export interface LegacyInventoryRecord {
  domain: LegacyMigrationDomain;
  stableSourceId: string;
  legacyId: string;
  contentHash?: string;
}

export interface LegacyInventoryReport {
  scannedAt: string;
  counts: LegacyInventoryCounts;
  recordsByDomain: Partial<Record<LegacyMigrationDomain, LegacyInventoryRecord[]>>;
  documentSources: Record<string, number>;
  preferenceKeys: string[];
}

export interface LegacyInventorySources {
  coreDb?: LegacySqliteDatabase | LegacySqliteOpener;
  documentsDb?: LegacySqliteDatabase | LegacySqliteOpener;
  auditDb?: LegacySqliteDatabase | LegacySqliteOpener;
  lanceChunks?: LanceChunkInventoryAdapter;
}

export interface LegacyInventoryPaths {
  coreDbPath?: string;
  documentsDbPath?: string;
  auditDbPath?: string;
}

export interface MigrationConflict {
  domain: LegacyMigrationDomain;
  stableSourceId: string;
  reason: 'duplicate_event_id' | 'duplicate_source_ref';
  existingEventId?: string;
}

export interface MigrationDryRunReport {
  generatedAt: string;
  inventory: LegacyInventoryReport;
  domains: Partial<Record<LegacyMigrationDomain, {
    wouldImportCount: number;
    wouldImportIds: string[];
    conflicts: MigrationConflict[];
  }>>;
  totalWouldImport: number;
  totalConflicts: number;
}

export interface MigrationImportOptions {
  eventLog: {
    writer: {
      append(input: {
        eventId: string;
        dataDomain: string;
        deviceId: string;
        membershipEpoch: number;
        eventType: 'source_ingested';
        sourceRefs: Array<{
          schemaVersion: 1;
          sourceId: string;
          sourceType: string;
          uri: string;
          ingestedAt: string;
        }>;
        sensitivity: 'personal' | 'restricted' | 'public';
        occurredAt: string;
        payloadPlaintext: string;
      }): { sequence: number; eventId: string; chainHash: string };
    };
  };
  deviceId: string;
  membershipEpoch?: number;
  sensitivity?: 'personal' | 'restricted' | 'public';
}

export interface MigrationImportResult {
  domain: LegacyMigrationDomain;
  importedCount: number;
  skippedConflicts: number;
  eventIds: string[];
  sourceIds: string[];
}

export interface PreMigrationBackupFile {
  sourcePath: string;
  backupPath: string;
  sha256: string;
}

export interface PreMigrationBackupSnapshot {
  backupId: string;
  createdAt: string;
  backupDir: string;
  files: PreMigrationBackupFile[];
}

export interface RollbackResult {
  restoredFiles: PreMigrationBackupFile[];
  verified: boolean;
}

export type BetterSqliteDatabase = Database.Database;
