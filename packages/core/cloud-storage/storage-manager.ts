// StorageManager — Tracks local disk usage for cloud-synced files.
// Provides budget enforcement and cleanup operations.
// Core package — zero network imports, zero Gateway imports.

import type { SyncStateStore } from './sync-state-store.js';
import type { FileSystemAdapter } from '../platform/types.js';

export interface StorageUsageResult {
  provider: string;
  totalBytes: number;
  fileCount: number;
}

export class StorageManager {
  private syncStateStore: SyncStateStore;
  private localSyncDir: string;
  private fs: FileSystemAdapter | null;

  constructor(syncStateStore: SyncStateStore, localSyncDir: string, fs?: FileSystemAdapter) {
    this.syncStateStore = syncStateStore;
    this.localSyncDir = localSyncDir;
    this.fs = fs ?? null;
  }

  /** Get storage usage for a specific provider. */
  getStorageUsage(provider: string): StorageUsageResult {
    const usage = this.syncStateStore.getStorageUsage(provider);
    return {
      provider: usage.provider,
      totalBytes: usage.totalBytes,
      fileCount: usage.fileCount,
    };
  }

  /** Get total storage usage across all providers. */
  getTotalStorageUsage(providers: string[]): {
    totalBytes: number;
    fileCount: number;
    byProvider: StorageUsageResult[];
  } {
    let totalBytes = 0;
    let fileCount = 0;
    const byProvider: StorageUsageResult[] = [];

    for (const provider of providers) {
      const usage = this.getStorageUsage(provider);
      totalBytes += usage.totalBytes;
      fileCount += usage.fileCount;
      byProvider.push(usage);
    }

    return { totalBytes, fileCount, byProvider };
  }

  /** Check if current usage is within a storage budget. */
  isWithinBudget(budgetGB: number, providers: string[]): boolean {
    const { totalBytes } = this.getTotalStorageUsage(providers);
    const budgetBytes = budgetGB * 1024 * 1024 * 1024;
    return totalBytes <= budgetBytes;
  }

  /** Clean up all local files and sync state for a provider. */
  cleanupProvider(provider: string): void {
    // Delete local files if filesystem is available
    if (this.fs) {
      const files = this.syncStateStore.getSyncedFiles(provider);
      for (const file of files) {
        try {
          if (this.fs.existsSync(file.localPath)) {
            this.fs.unlinkSync(file.localPath);
          }
        } catch {
          // Best-effort cleanup
        }
      }
    }

    // Clear sync state
    this.syncStateStore.clearProvider(provider);
  }

  /** Clean up a specific folder's files. */
  cleanupFolder(provider: string, folderId: string): void {
    const files = this.syncStateStore.getSyncedFiles(provider);
    for (const file of files) {
      if (file.filePath.startsWith(`${folderId}/`) || file.filePath === folderId) {
        if (this.fs) {
          try {
            if (this.fs.existsSync(file.localPath)) {
              this.fs.unlinkSync(file.localPath);
            }
          } catch {
            // Best-effort cleanup
          }
        }
        this.syncStateStore.deleteSyncRecord(provider, file.fileId);
      }
    }
  }

  /** Remove local files that no longer have sync state entries. */
  purgeOrphans(provider: string): number {
    if (!this.fs) return 0;

    const providerDir = `${this.localSyncDir}/${provider}`;
    if (!this.fs.existsSync(providerDir)) return 0;

    const syncedFiles = this.syncStateStore.getSyncedFiles(provider);
    const syncedPaths = new Set(syncedFiles.map(f => f.localPath));

    let purgedCount = 0;
    try {
      const localFiles = this.fs.readdirSync(providerDir);
      for (const fileName of localFiles) {
        const fullPath = `${providerDir}/${fileName}`;
        if (!syncedPaths.has(fullPath)) {
          try {
            this.fs.unlinkSync(fullPath);
            purgedCount++;
          } catch {
            // Best-effort
          }
        }
      }
    } catch {
      // Directory might not exist
    }

    return purgedCount;
  }

  /** Generate the local path for a cloud file, mirroring the cloud path structure. */
  getLocalPath(provider: string, fileId: string, fileName: string): string {
    return `${this.localSyncDir}/${provider}/${fileId}_${fileName}`;
  }
}
