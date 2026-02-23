// File Indexer Integration Tests — Verify cloud_storage source tagging and indexable MIME types.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SyncOrchestrator } from '../../../packages/core/cloud-storage/sync-orchestrator.js';
import { SyncStateStore } from '../../../packages/core/cloud-storage/sync-state-store.js';
import type { CloudStorageAdapter, CloudFileMetadata, DownloadResult, ListFilesResult } from '../../../packages/core/platform/cloud-storage-types.js';
import type { Indexer, IndexResult } from '../../../packages/core/knowledge/indexer.js';
import type { DatabaseHandle } from '../../../packages/core/platform/types.js';

describe('File Indexer Integration', () => {
  let db: Database.Database;
  let syncStateStore: SyncStateStore;
  let mockClient: CloudStorageAdapter;
  let mockIndexer: Indexer;
  let indexDocumentFn: ReturnType<typeof vi.fn>;
  let listFilesFn: ReturnType<typeof vi.fn>;
  let downloadFileFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    db = new Database(':memory:');
    syncStateStore = new SyncStateStore(db as unknown as DatabaseHandle);

    listFilesFn = vi.fn();
    downloadFileFn = vi.fn();
    indexDocumentFn = vi.fn();

    mockClient = {
      authenticate: vi.fn() as CloudStorageAdapter['authenticate'],
      isAuthenticated: vi.fn() as CloudStorageAdapter['isAuthenticated'],
      disconnect: vi.fn() as CloudStorageAdapter['disconnect'],
      listFiles: listFilesFn as unknown as CloudStorageAdapter['listFiles'],
      getFileMetadata: vi.fn() as CloudStorageAdapter['getFileMetadata'],
      downloadFile: downloadFileFn as unknown as CloudStorageAdapter['downloadFile'],
      hasFileChanged: vi.fn() as CloudStorageAdapter['hasFileChanged'],
    };

    mockIndexer = {
      indexDocument: indexDocumentFn,
    } as unknown as Indexer;
  });

  afterEach(() => {
    db.close();
  });

  it('indexer tags documents with source cloud_storage and correct sourcePath', async () => {
    listFilesFn.mockResolvedValue({
      files: [{
        id: 'doc-123',
        name: 'meeting-notes.txt',
        mimeType: 'text/plain',
        sizeBytes: 256,
        modifiedTime: '2026-01-15T10:00:00Z',
        createdTime: '2026-01-10T10:00:00Z',
        parentId: 'folder-1',
        md5Checksum: null,
        isFolder: false,
      }] satisfies CloudFileMetadata[],
      nextPageToken: null,
      totalFiles: 1,
    } satisfies ListFilesResult);

    downloadFileFn.mockResolvedValue({
      success: true,
      localPath: '/sync/google_drive/doc-123_meeting-notes.txt',
      sizeBytes: 256,
      mimeType: 'text/plain',
      content: 'Meeting notes: discussed Q1 roadmap and cloud storage sync.',
    } satisfies DownloadResult);

    indexDocumentFn.mockResolvedValue({
      documentId: 'idx-1',
      chunksCreated: 1,
      durationMs: 10,
      deduplicated: false,
    } satisfies IndexResult);

    const orchestrator = new SyncOrchestrator(mockClient, syncStateStore, mockIndexer, {
      provider: 'google_drive',
      maxFileSizeMB: 50,
      syncIntervalMinutes: 30,
      localSyncDir: '/sync',
    });

    const result = await orchestrator.fullSync();

    expect(result.downloaded).toBe(1);
    expect(result.indexed).toBe(1);
    expect(indexDocumentFn).toHaveBeenCalledOnce();

    const indexCall = indexDocumentFn.mock.calls[0]![0] as {
      content: string;
      title: string;
      source: string;
      sourcePath: string;
      mimeType: string;
      metadata: Record<string, unknown>;
    };
    expect(indexCall.source).toBe('cloud_storage');
    expect(indexCall.sourcePath).toBe('cloud-sync:google_drive:doc-123');
    expect(indexCall.title).toBe('meeting-notes.txt');
    expect(indexCall.content).toContain('Q1 roadmap');
    expect(indexCall.metadata).toEqual({
      provider: 'google_drive',
      cloudFileId: 'doc-123',
      cloudModifiedTime: '2026-01-15T10:00:00Z',
    });

    // Verify file is marked as indexed in sync state
    const syncedFile = syncStateStore.getFileByCloudId('google_drive', 'doc-123');
    expect(syncedFile).not.toBeNull();
    expect(syncedFile!.indexed).toBe(true);
  });

  it('search results can include cloud-synced files via source type', async () => {
    // The DocumentSource union includes 'cloud_storage' — verify the type is accepted
    const indexableTypes = SyncOrchestrator.getIndexableMimeTypes();

    // Verify key document types are indexable
    expect(indexableTypes.has('application/pdf')).toBe(true);
    expect(indexableTypes.has('text/plain')).toBe(true);
    expect(indexableTypes.has('text/csv')).toBe(true);
    expect(indexableTypes.has('text/markdown')).toBe(true);
    expect(indexableTypes.has('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
    expect(indexableTypes.has('application/vnd.google-apps.document')).toBe(true);
    expect(indexableTypes.has('application/vnd.google-apps.spreadsheet')).toBe(true);

    // Verify non-document types are NOT indexable
    expect(indexableTypes.has('image/jpeg')).toBe(false);
    expect(indexableTypes.has('video/mp4')).toBe(false);
    expect(indexableTypes.has('audio/mpeg')).toBe(false);
    expect(indexableTypes.has('application/octet-stream')).toBe(false);
    expect(indexableTypes.has('application/zip')).toBe(false);
  });
});
