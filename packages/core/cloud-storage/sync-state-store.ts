// SyncStateStore — Tracks synced cloud files in SQLite via platform DatabaseHandle.
// Records which files have been downloaded, their sync status, and indexing state.
// Core package — zero network imports, zero Gateway imports.

import type { DatabaseHandle } from '../platform/types.js';

export type SyncStatus = 'synced' | 'pending' | 'error' | 'deleted';

export interface SyncRecord {
  provider: string;
  fileId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  cloudModifiedTime: string;
  localPath: string;
  lastSyncedAt: string;
  md5Checksum: string | null;
  syncStatus: SyncStatus;
  indexed: boolean;
}

export interface StorageUsage {
  provider: string;
  totalBytes: number;
  fileCount: number;
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS cloud_sync_state (
    provider TEXT NOT NULL,
    file_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    cloud_modified_time TEXT NOT NULL,
    local_path TEXT NOT NULL,
    last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    md5_checksum TEXT,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    indexed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (provider, file_id)
  );
`;

export class SyncStateStore {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.db.exec(CREATE_TABLE);
  }

  /** Record a file sync (insert or update). */
  recordSync(record: Omit<SyncRecord, 'lastSyncedAt' | 'syncStatus' | 'indexed'> & {
    lastSyncedAt?: string;
    syncStatus?: SyncStatus;
    indexed?: boolean;
  }): void {
    this.db.prepare(`
      INSERT INTO cloud_sync_state
        (provider, file_id, file_name, file_path, mime_type, size_bytes,
         cloud_modified_time, local_path, last_synced_at, md5_checksum, sync_status, indexed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, file_id) DO UPDATE SET
        file_name = excluded.file_name,
        file_path = excluded.file_path,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        cloud_modified_time = excluded.cloud_modified_time,
        local_path = excluded.local_path,
        last_synced_at = excluded.last_synced_at,
        md5_checksum = excluded.md5_checksum,
        sync_status = excluded.sync_status,
        indexed = excluded.indexed
    `).run(
      record.provider,
      record.fileId,
      record.fileName,
      record.filePath,
      record.mimeType,
      record.sizeBytes,
      record.cloudModifiedTime,
      record.localPath,
      record.lastSyncedAt ?? new Date().toISOString(),
      record.md5Checksum ?? null,
      record.syncStatus ?? 'synced',
      record.indexed ? 1 : 0,
    );
  }

  /** Get all synced files for a provider. */
  getSyncedFiles(provider: string): SyncRecord[] {
    const rows = this.db.prepare(
      'SELECT * FROM cloud_sync_state WHERE provider = ? AND sync_status != ?'
    ).all(provider, 'deleted') as Array<Record<string, unknown>>;
    return rows.map(this.rowToRecord);
  }

  /** Get a file by its cloud ID. */
  getFileByCloudId(provider: string, fileId: string): SyncRecord | null {
    const row = this.db.prepare(
      'SELECT * FROM cloud_sync_state WHERE provider = ? AND file_id = ?'
    ).get(provider, fileId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToRecord(row);
  }

  /** Update the sync status of a file. */
  updateSyncStatus(provider: string, fileId: string, status: SyncStatus): void {
    this.db.prepare(
      'UPDATE cloud_sync_state SET sync_status = ? WHERE provider = ? AND file_id = ?'
    ).run(status, provider, fileId);
  }

  /** Mark a file as indexed. */
  markIndexed(provider: string, fileId: string): void {
    this.db.prepare(
      'UPDATE cloud_sync_state SET indexed = 1 WHERE provider = ? AND file_id = ?'
    ).run(provider, fileId);
  }

  /** Get all unindexed files for a provider. */
  getUnindexedFiles(provider: string): SyncRecord[] {
    const rows = this.db.prepare(
      'SELECT * FROM cloud_sync_state WHERE provider = ? AND indexed = 0 AND sync_status = ?'
    ).all(provider, 'synced') as Array<Record<string, unknown>>;
    return rows.map(this.rowToRecord);
  }

  /** Get storage usage for a provider. */
  getStorageUsage(provider: string): StorageUsage {
    const row = this.db.prepare(
      `SELECT provider, COALESCE(SUM(size_bytes), 0) as total_bytes, COUNT(*) as file_count
       FROM cloud_sync_state
       WHERE provider = ? AND sync_status != ?`
    ).get(provider, 'deleted') as { provider: string; total_bytes: number; file_count: number } | undefined;

    return {
      provider,
      totalBytes: row?.total_bytes ?? 0,
      fileCount: row?.file_count ?? 0,
    };
  }

  /** Delete a sync record. */
  deleteSyncRecord(provider: string, fileId: string): void {
    this.db.prepare(
      'DELETE FROM cloud_sync_state WHERE provider = ? AND file_id = ?'
    ).run(provider, fileId);
  }

  /** Clear all sync records for a provider. */
  clearProvider(provider: string): void {
    this.db.prepare(
      'DELETE FROM cloud_sync_state WHERE provider = ?'
    ).run(provider);
  }

  private rowToRecord(row: Record<string, unknown>): SyncRecord {
    return {
      provider: row['provider'] as string,
      fileId: row['file_id'] as string,
      fileName: row['file_name'] as string,
      filePath: row['file_path'] as string,
      mimeType: row['mime_type'] as string,
      sizeBytes: row['size_bytes'] as number,
      cloudModifiedTime: row['cloud_modified_time'] as string,
      localPath: row['local_path'] as string,
      lastSyncedAt: row['last_synced_at'] as string,
      md5Checksum: (row['md5_checksum'] as string) ?? null,
      syncStatus: row['sync_status'] as SyncStatus,
      indexed: (row['indexed'] as number) === 1,
    };
  }
}
