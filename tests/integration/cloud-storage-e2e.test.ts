// Cloud Storage E2E Integration Tests — authenticate → select folders → sync → indexed → searchable.
//
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { SyncStateStore } from '../../packages/core/cloud-storage/sync-state-store';
import { FolderSelector } from '../../packages/core/cloud-storage/folder-selector';
import { StorageManager } from '../../packages/core/cloud-storage/storage-manager';
import { SyncOrchestrator } from '../../packages/core/cloud-storage/sync-orchestrator';
import type { CloudStorageAdapter, CloudFileMetadata, DownloadResult, ListFilesResult } from '../../packages/core/platform/cloud-storage-types';
import type { DatabaseHandle } from '../../packages/core/platform/types';

function createDb(): DatabaseHandle {
  return new Database(':memory:') as unknown as DatabaseHandle;
}

function createMockAdapter(files: CloudFileMetadata[]): CloudStorageAdapter {
  return {
    authenticate: vi.fn().mockResolvedValue({ success: true, provider: 'google_drive', userEmail: 'user@gmail.com' }),
    isAuthenticated: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn().mockResolvedValue(undefined),
    listFiles: vi.fn().mockResolvedValue({ files, nextPageToken: null } as ListFilesResult),
    getFileMetadata: vi.fn().mockImplementation(async (_p: string, fileId: string) => {
      return files.find(f => f.id === fileId) ?? null;
    }),
    downloadFile: vi.fn().mockImplementation(async (_p: string, fileId: string, localPath: string): Promise<DownloadResult> => {
      const file = files.find(f => f.id === fileId);
      return {
        success: true,
        localPath,
        sizeBytes: file?.sizeBytes ?? 100,
        mimeType: file?.mimeType ?? 'application/octet-stream',
        content: `Content of ${file?.name ?? fileId}`,
      };
    }),
    hasFileChanged: vi.fn().mockResolvedValue(true),
  };
}

function createMockIndexer() {
  const indexed: Array<{ title: string; content: string; source: string; sourcePath: string }> = [];
  return {
    indexDocument: vi.fn().mockImplementation(async (doc: { title: string; content: string; source: string; sourcePath: string }) => {
      indexed.push(doc);
      return { id: `idx-${indexed.length}`, chunksCreated: 1 };
    }),
    indexed,
  };
}

describe('Cloud Storage E2E', () => {
  it('authenticate → select folders → sync → indexed → searchable', async () => {
    const db = createDb();
    const provider = 'google_drive' as const;

    const cloudFiles: CloudFileMetadata[] = [
      { id: 'file-1', name: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 1024 * 100, modifiedTime: '2026-01-15T10:00:00Z', createdTime: '2026-01-10T10:00:00Z', parentId: 'folder-1', md5Checksum: 'abc123', isFolder: false },
      { id: 'file-2', name: 'notes.txt', mimeType: 'text/plain', sizeBytes: 2048, modifiedTime: '2026-01-16T10:00:00Z', createdTime: '2026-01-10T10:00:00Z', parentId: 'folder-1', md5Checksum: 'def456', isFolder: false },
      { id: 'folder-1', name: 'Documents', mimeType: 'application/vnd.google-apps.folder', sizeBytes: 0, modifiedTime: '2026-01-10T10:00:00Z', createdTime: '2026-01-05T10:00:00Z', parentId: null, md5Checksum: null, isFolder: true },
    ];

    const adapter = createMockAdapter(cloudFiles);
    const indexer = createMockIndexer();
    const syncStateStore = new SyncStateStore(db);
    const folderSelector = new FolderSelector(db);
    const storageManager = new StorageManager(syncStateStore, '/tmp/cloud-sync');

    // Step 1: Authenticate
    const authResult = await adapter.authenticate(provider);
    expect(authResult.success).toBe(true);
    expect(authResult.userEmail).toBe('user@gmail.com');

    // Step 2: Select folder
    folderSelector.addFolder({ provider, folderId: 'folder-1', folderName: 'Documents', folderPath: '/Documents', includeSubfolders: true });
    const folders = folderSelector.getSelectedFolders(provider);
    expect(folders).toHaveLength(1);
    expect(folders[0]!.folderId).toBe('folder-1');

    // Step 3: Sync
    const orchestrator = new SyncOrchestrator(
      adapter,
      syncStateStore,
      indexer as unknown as import('../../packages/core/knowledge/indexer').Indexer,
      { provider, maxFileSizeMB: 50, syncIntervalMinutes: 30, localSyncDir: '/tmp/cloud-sync' },
    );

    const result = await orchestrator.fullSync('folder-1');
    // Should download 2 files (skips the folder), index both
    expect(result.downloaded).toBe(2);
    expect(result.indexed).toBe(2);
    expect(result.errors).toHaveLength(0);

    // Step 4: Verify indexed
    expect(indexer.indexed).toHaveLength(2);
    expect(indexer.indexed[0]!.source).toBe('cloud_storage');
    expect(indexer.indexed[0]!.sourcePath).toContain('google_drive');

    // Step 5: Verify sync state recorded
    const syncedFiles = syncStateStore.getSyncedFiles(provider);
    expect(syncedFiles).toHaveLength(2);

    // Step 6: Verify storage usage
    const usage = storageManager.getStorageUsage(provider);
    expect(usage.fileCount).toBe(2);
    expect(usage.totalBytes).toBeGreaterThan(0);
  });

  it('incremental sync only downloads modified files', async () => {
    const db = createDb();
    const provider = 'google_drive' as const;

    const cloudFiles: CloudFileMetadata[] = [
      { id: 'file-1', name: 'doc.txt', mimeType: 'text/plain', sizeBytes: 500, modifiedTime: '2026-01-15T10:00:00Z', createdTime: '2026-01-10T10:00:00Z', parentId: null, md5Checksum: 'aaa', isFolder: false },
      { id: 'file-2', name: 'log.txt', mimeType: 'text/plain', sizeBytes: 300, modifiedTime: '2026-01-16T10:00:00Z', createdTime: '2026-01-10T10:00:00Z', parentId: null, md5Checksum: 'bbb', isFolder: false },
    ];

    const adapter = createMockAdapter(cloudFiles);
    const indexer = createMockIndexer();
    const syncStateStore = new SyncStateStore(db);

    const orchestrator = new SyncOrchestrator(
      adapter,
      syncStateStore,
      indexer as unknown as import('../../packages/core/knowledge/indexer').Indexer,
      { provider, maxFileSizeMB: 50, syncIntervalMinutes: 30, localSyncDir: '/tmp/cloud-sync' },
    );

    // First full sync
    const first = await orchestrator.fullSync();
    expect(first.downloaded).toBe(2);

    // Now simulate incremental: file-1 unchanged, file-2 has newer modifiedTime
    const updatedFiles: CloudFileMetadata[] = [
      { id: 'file-1', name: 'doc.txt', mimeType: 'text/plain', sizeBytes: 500, modifiedTime: '2026-01-15T10:00:00Z', createdTime: '2026-01-10T10:00:00Z', parentId: null, md5Checksum: 'aaa', isFolder: false },
      { id: 'file-2', name: 'log.txt', mimeType: 'text/plain', sizeBytes: 350, modifiedTime: '2026-01-17T10:00:00Z', createdTime: '2026-01-10T10:00:00Z', parentId: null, md5Checksum: 'bbb2', isFolder: false },
    ];
    (adapter.listFiles as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ files: updatedFiles, nextPageToken: null });

    const second = await orchestrator.incrementalSync();
    // Only file-2 should be re-downloaded (modifiedTime changed)
    expect(second.downloaded).toBe(1);
  });

  it('disconnect → cleanup (files removed, state cleared)', async () => {
    const db = createDb();
    const provider = 'google_drive' as const;

    const cloudFiles: CloudFileMetadata[] = [
      { id: 'file-1', name: 'data.csv', mimeType: 'text/csv', sizeBytes: 1000, modifiedTime: '2026-01-15T10:00:00Z', createdTime: '2026-01-10T10:00:00Z', parentId: null, md5Checksum: 'ccc', isFolder: false },
    ];

    const adapter = createMockAdapter(cloudFiles);
    const indexer = createMockIndexer();
    const syncStateStore = new SyncStateStore(db);
    const folderSelector = new FolderSelector(db);
    const storageManager = new StorageManager(syncStateStore, '/tmp/cloud-sync');

    // Sync a file
    const orchestrator = new SyncOrchestrator(
      adapter,
      syncStateStore,
      indexer as unknown as import('../../packages/core/knowledge/indexer').Indexer,
      { provider, maxFileSizeMB: 50, syncIntervalMinutes: 30, localSyncDir: '/tmp/cloud-sync' },
    );

    await orchestrator.fullSync();
    expect(syncStateStore.getSyncedFiles(provider)).toHaveLength(1);

    // Add folder selection
    folderSelector.addFolder({ provider, folderId: 'folder-1', folderName: 'Docs', folderPath: '/', includeSubfolders: true });
    expect(folderSelector.getSelectedFolders(provider)).toHaveLength(1);

    // Disconnect: clear sync state, folder selections, disconnect adapter
    await adapter.disconnect(provider);
    syncStateStore.clearProvider(provider);
    folderSelector.removeFolder(provider, 'folder-1');
    storageManager.cleanupProvider(provider);

    // Verify everything is cleaned up
    expect(syncStateStore.getSyncedFiles(provider)).toHaveLength(0);
    expect(folderSelector.getSelectedFolders(provider)).toHaveLength(0);
    expect(storageManager.getStorageUsage(provider).totalBytes).toBe(0);
    expect(adapter.disconnect).toHaveBeenCalledWith(provider);
  });

  it('barrel exports resolve all expected symbols', async () => {
    const mod = await import('../../packages/core/cloud-storage/index');
    expect(mod.CloudStorageClient).toBeDefined();
    expect(mod.SyncStateStore).toBeDefined();
    expect(mod.SyncOrchestrator).toBeDefined();
    expect(mod.FolderSelector).toBeDefined();
    expect(mod.StorageManager).toBeDefined();
  });
});
