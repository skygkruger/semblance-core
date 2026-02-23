// SyncOrchestrator — Coordinates cloud file sync: list → compare → download → index.
// Core package — zero network imports, zero Gateway imports.
// Delegates all external operations through CloudStorageAdapter (IPC).

import type { CloudStorageAdapter, CloudFileMetadata, CloudStorageProvider } from '../platform/cloud-storage-types.js';
import type { SyncStateStore } from './sync-state-store.js';
import type { Indexer } from '../knowledge/indexer.js';

export interface SyncOrchestratorConfig {
  provider: CloudStorageProvider;
  maxFileSizeMB: number;
  syncIntervalMinutes: number;
  localSyncDir: string;
}

export interface SyncStatus {
  provider: string;
  lastSyncedAt: string | null;
  filesSynced: number;
  filesIndexed: number;
  totalStorageBytes: number;
  isRunning: boolean;
}

export interface SyncResult {
  downloaded: number;
  indexed: number;
  skipped: number;
  errors: Array<{ fileId: string; fileName: string; error: string }>;
}

// MIME types that can be meaningfully indexed (text-extractable)
const INDEXABLE_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
  'application/json',
  // Google Workspace types (will be exported to indexable formats)
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
]);

export class SyncOrchestrator {
  private storageClient: CloudStorageAdapter;
  private syncStateStore: SyncStateStore;
  private indexer: Indexer | null;
  private config: SyncOrchestratorConfig;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(
    storageClient: CloudStorageAdapter,
    syncStateStore: SyncStateStore,
    indexer: Indexer | null,
    config: SyncOrchestratorConfig,
  ) {
    this.storageClient = storageClient;
    this.syncStateStore = syncStateStore;
    this.indexer = indexer;
    this.config = config;
  }

  /**
   * Full sync: list all files from cloud, compare with local state,
   * download new/modified files, and index them.
   */
  async fullSync(folderId?: string): Promise<SyncResult> {
    if (this.isRunning) {
      return { downloaded: 0, indexed: 0, skipped: 0, errors: [] };
    }

    this.isRunning = true;
    try {
      return await this.performSync(folderId, false);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Incremental sync: only check files modified since last sync.
   */
  async incrementalSync(folderId?: string): Promise<SyncResult> {
    if (this.isRunning) {
      return { downloaded: 0, indexed: 0, skipped: 0, errors: [] };
    }

    this.isRunning = true;
    try {
      return await this.performSync(folderId, true);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Sync a single file by cloud ID.
   */
  async syncFile(fileId: string): Promise<SyncResult> {
    const result: SyncResult = { downloaded: 0, indexed: 0, skipped: 0, errors: [] };

    try {
      const metadata = await this.storageClient.getFileMetadata(this.config.provider, fileId);
      if (!metadata) {
        result.errors.push({ fileId, fileName: 'unknown', error: 'File not found' });
        return result;
      }

      await this.downloadAndIndex(metadata, result);
    } catch (err) {
      result.errors.push({
        fileId,
        fileName: 'unknown',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return result;
  }

  /**
   * Remove all synced files for a provider from local storage and state.
   */
  removeSyncedFiles(): void {
    this.syncStateStore.clearProvider(this.config.provider);
  }

  /**
   * Get current sync status.
   */
  getSyncStatus(): SyncStatus {
    const files = this.syncStateStore.getSyncedFiles(this.config.provider);
    const usage = this.syncStateStore.getStorageUsage(this.config.provider);
    const indexedCount = files.filter(f => f.indexed).length;

    // Find the most recent sync time
    let lastSyncedAt: string | null = null;
    for (const f of files) {
      if (!lastSyncedAt || f.lastSyncedAt > lastSyncedAt) {
        lastSyncedAt = f.lastSyncedAt;
      }
    }

    return {
      provider: this.config.provider,
      lastSyncedAt,
      filesSynced: files.length,
      filesIndexed: indexedCount,
      totalStorageBytes: usage.totalBytes,
      isRunning: this.isRunning,
    };
  }

  /** Start periodic sync on an interval. */
  startPeriodicSync(): void {
    if (this.periodicTimer) return;
    const intervalMs = this.config.syncIntervalMinutes * 60_000;
    this.periodicTimer = setInterval(() => {
      this.incrementalSync().catch(() => {});
    }, intervalMs);
  }

  /** Stop periodic sync. */
  stopPeriodicSync(): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }

  private async performSync(folderId: string | undefined, incrementalOnly: boolean): Promise<SyncResult> {
    const result: SyncResult = { downloaded: 0, indexed: 0, skipped: 0, errors: [] };

    // List files from cloud
    const listResult = await this.storageClient.listFiles(this.config.provider, {
      folderId: folderId ?? 'root',
      pageSize: 100,
    });

    for (const file of listResult.files) {
      // Skip folders
      if (file.isFolder) {
        result.skipped++;
        continue;
      }

      // Check if file type is indexable
      if (!this.isIndexable(file.mimeType)) {
        result.skipped++;
        continue;
      }

      // Check file size limit
      if (file.sizeBytes > this.config.maxFileSizeMB * 1024 * 1024) {
        result.skipped++;
        continue;
      }

      // For incremental sync: check if file has changed
      if (incrementalOnly) {
        const existingRecord = this.syncStateStore.getFileByCloudId(this.config.provider, file.id);
        if (existingRecord && existingRecord.cloudModifiedTime === file.modifiedTime) {
          result.skipped++;
          continue;
        }
      }

      try {
        await this.downloadAndIndex(file, result);
      } catch (err) {
        result.errors.push({
          fileId: file.id,
          fileName: file.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  }

  private async downloadAndIndex(file: CloudFileMetadata, result: SyncResult): Promise<void> {
    const localPath = `${this.config.localSyncDir}/${this.config.provider}/${file.id}_${file.name}`;

    // Download file
    const downloadResult = await this.storageClient.downloadFile(this.config.provider, file.id, localPath);
    if (!downloadResult.success) {
      result.errors.push({
        fileId: file.id,
        fileName: file.name,
        error: 'Download failed',
      });
      return;
    }

    result.downloaded++;

    // Record sync state
    this.syncStateStore.recordSync({
      provider: this.config.provider,
      fileId: file.id,
      fileName: file.name,
      filePath: file.parentId ? `${file.parentId}/${file.name}` : file.name,
      mimeType: file.mimeType,
      sizeBytes: downloadResult.sizeBytes,
      cloudModifiedTime: file.modifiedTime,
      localPath,
      md5Checksum: file.md5Checksum ?? null,
    });

    // Index the file if indexer is available and content was extracted
    if (this.indexer && downloadResult.content) {
      try {
        await this.indexer.indexDocument({
          content: downloadResult.content,
          title: file.name,
          source: 'cloud_storage',
          sourcePath: `cloud-sync:${this.config.provider}:${file.id}`,
          mimeType: file.mimeType,
          metadata: {
            provider: this.config.provider,
            cloudFileId: file.id,
            cloudModifiedTime: file.modifiedTime,
          },
        });

        this.syncStateStore.markIndexed(this.config.provider, file.id);
        result.indexed++;
      } catch {
        // Indexing failure doesn't block sync
      }
    }
  }

  private isIndexable(mimeType: string): boolean {
    return INDEXABLE_MIME_TYPES.has(mimeType);
  }

  /** Get the set of indexable MIME types (for testing). */
  static getIndexableMimeTypes(): Set<string> {
    return new Set(INDEXABLE_MIME_TYPES);
  }
}
