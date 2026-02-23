// SyncOrchestrator Tests — Full sync, incremental sync, size limits, MIME filtering, error handling.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SyncOrchestrator } from '../../../packages/core/cloud-storage/sync-orchestrator.js';
import { SyncStateStore } from '../../../packages/core/cloud-storage/sync-state-store.js';
import type { CloudStorageAdapter, CloudFileMetadata, DownloadResult, ListFilesResult } from '../../../packages/core/platform/cloud-storage-types.js';
import type { DatabaseHandle } from '../../../packages/core/platform/types.js';

function makeFile(overrides: Partial<CloudFileMetadata> = {}): CloudFileMetadata {
  return {
    id: 'file-1',
    name: 'document.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    modifiedTime: '2026-01-15T10:00:00Z',
    createdTime: '2026-01-10T10:00:00Z',
    parentId: 'root',
    md5Checksum: 'abc123',
    isFolder: false,
    ...overrides,
  };
}

function makeDownloadResult(overrides: Partial<DownloadResult> = {}): DownloadResult {
  return {
    success: true,
    localPath: '/sync/file.pdf',
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    ...overrides,
  };
}

describe('SyncOrchestrator', () => {
  let db: Database.Database;
  let syncStateStore: SyncStateStore;
  let mockClient: CloudStorageAdapter;
  let listFilesFn: ReturnType<typeof vi.fn>;
  let downloadFileFn: ReturnType<typeof vi.fn>;
  let getFileMetadataFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    db = new Database(':memory:');
    syncStateStore = new SyncStateStore(db as unknown as DatabaseHandle);

    listFilesFn = vi.fn();
    downloadFileFn = vi.fn();
    getFileMetadataFn = vi.fn();

    mockClient = {
      authenticate: vi.fn() as CloudStorageAdapter['authenticate'],
      isAuthenticated: vi.fn() as CloudStorageAdapter['isAuthenticated'],
      disconnect: vi.fn() as CloudStorageAdapter['disconnect'],
      listFiles: listFilesFn as unknown as CloudStorageAdapter['listFiles'],
      getFileMetadata: getFileMetadataFn as unknown as CloudStorageAdapter['getFileMetadata'],
      downloadFile: downloadFileFn as unknown as CloudStorageAdapter['downloadFile'],
      hasFileChanged: vi.fn() as CloudStorageAdapter['hasFileChanged'],
    };
  });

  afterEach(() => {
    db.close();
  });

  it('full sync lists, downloads, and records synced files', async () => {
    const files: CloudFileMetadata[] = [
      makeFile({ id: 'f1', name: 'report.pdf', sizeBytes: 512 }),
      makeFile({ id: 'f2', name: 'notes.txt', mimeType: 'text/plain', sizeBytes: 256 }),
    ];

    listFilesFn.mockResolvedValue({
      files,
      nextPageToken: null,
      totalFiles: 2,
    } satisfies ListFilesResult);

    downloadFileFn
      .mockResolvedValueOnce(makeDownloadResult({ localPath: '/sync/f1_report.pdf', sizeBytes: 512 }))
      .mockResolvedValueOnce(makeDownloadResult({ localPath: '/sync/f2_notes.txt', sizeBytes: 256, mimeType: 'text/plain' }));

    const orchestrator = new SyncOrchestrator(mockClient, syncStateStore, null, {
      provider: 'google_drive',
      maxFileSizeMB: 50,
      syncIntervalMinutes: 30,
      localSyncDir: '/sync',
    });

    const result = await orchestrator.fullSync();

    expect(result.downloaded).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(listFilesFn).toHaveBeenCalledOnce();
    expect(downloadFileFn).toHaveBeenCalledTimes(2);

    // Verify sync state was recorded
    const synced = syncStateStore.getSyncedFiles('google_drive');
    expect(synced).toHaveLength(2);
  });

  it('incremental sync skips unchanged files', async () => {
    // Pre-record a synced file
    syncStateStore.recordSync({
      provider: 'google_drive',
      fileId: 'f1',
      fileName: 'report.pdf',
      filePath: 'root/report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 512,
      cloudModifiedTime: '2026-01-15T10:00:00Z',
      localPath: '/sync/f1_report.pdf',
      md5Checksum: null,
    });

    // Cloud returns same file with same modifiedTime + a new file
    listFilesFn.mockResolvedValue({
      files: [
        makeFile({ id: 'f1', name: 'report.pdf', sizeBytes: 512, modifiedTime: '2026-01-15T10:00:00Z' }),
        makeFile({ id: 'f2', name: 'new.txt', mimeType: 'text/plain', sizeBytes: 100, modifiedTime: '2026-01-20T10:00:00Z' }),
      ],
      nextPageToken: null,
      totalFiles: 2,
    } satisfies ListFilesResult);

    downloadFileFn.mockResolvedValue(makeDownloadResult({ localPath: '/sync/f2_new.txt', sizeBytes: 100 }));

    const orchestrator = new SyncOrchestrator(mockClient, syncStateStore, null, {
      provider: 'google_drive',
      maxFileSizeMB: 50,
      syncIntervalMinutes: 30,
      localSyncDir: '/sync',
    });

    const result = await orchestrator.incrementalSync();

    expect(result.downloaded).toBe(1); // Only the new file
    expect(result.skipped).toBe(1);    // The unchanged file
    expect(downloadFileFn).toHaveBeenCalledOnce();
  });

  it('skips files exceeding maxFileSizeMB', async () => {
    listFilesFn.mockResolvedValue({
      files: [
        makeFile({ id: 'f1', name: 'huge.pdf', sizeBytes: 100 * 1024 * 1024 }), // 100MB
        makeFile({ id: 'f2', name: 'small.txt', mimeType: 'text/plain', sizeBytes: 100 }),
      ],
      nextPageToken: null,
      totalFiles: 2,
    } satisfies ListFilesResult);

    downloadFileFn.mockResolvedValue(makeDownloadResult({ sizeBytes: 100 }));

    const orchestrator = new SyncOrchestrator(mockClient, syncStateStore, null, {
      provider: 'google_drive',
      maxFileSizeMB: 50, // 50MB limit — 100MB file should be skipped
      syncIntervalMinutes: 30,
      localSyncDir: '/sync',
    });

    const result = await orchestrator.fullSync();

    expect(result.downloaded).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('skips non-indexable MIME types (images, video, audio)', async () => {
    listFilesFn.mockResolvedValue({
      files: [
        makeFile({ id: 'f1', name: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 2048 }),
        makeFile({ id: 'f2', name: 'video.mp4', mimeType: 'video/mp4', sizeBytes: 5000 }),
        makeFile({ id: 'f3', name: 'song.mp3', mimeType: 'audio/mpeg', sizeBytes: 3000 }),
        makeFile({ id: 'f4', name: 'app.exe', mimeType: 'application/octet-stream', sizeBytes: 1000 }),
        makeFile({ id: 'f5', name: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: 500 }),
      ],
      nextPageToken: null,
      totalFiles: 5,
    } satisfies ListFilesResult);

    downloadFileFn.mockResolvedValue(makeDownloadResult({ sizeBytes: 500 }));

    const orchestrator = new SyncOrchestrator(mockClient, syncStateStore, null, {
      provider: 'google_drive',
      maxFileSizeMB: 50,
      syncIntervalMinutes: 30,
      localSyncDir: '/sync',
    });

    const result = await orchestrator.fullSync();

    expect(result.downloaded).toBe(1); // Only the PDF
    expect(result.skipped).toBe(4);    // 4 non-indexable files
  });

  it('handles download errors gracefully without stopping sync', async () => {
    listFilesFn.mockResolvedValue({
      files: [
        makeFile({ id: 'f1', name: 'good.pdf', sizeBytes: 500 }),
        makeFile({ id: 'f2', name: 'bad.pdf', sizeBytes: 500 }),
        makeFile({ id: 'f3', name: 'also-good.txt', mimeType: 'text/plain', sizeBytes: 200 }),
      ],
      nextPageToken: null,
      totalFiles: 3,
    } satisfies ListFilesResult);

    downloadFileFn
      .mockResolvedValueOnce(makeDownloadResult({ sizeBytes: 500 }))
      .mockResolvedValueOnce(makeDownloadResult({ success: false, sizeBytes: 0 })) // Failure
      .mockResolvedValueOnce(makeDownloadResult({ sizeBytes: 200 }));

    const orchestrator = new SyncOrchestrator(mockClient, syncStateStore, null, {
      provider: 'google_drive',
      maxFileSizeMB: 50,
      syncIntervalMinutes: 30,
      localSyncDir: '/sync',
    });

    const result = await orchestrator.fullSync();

    expect(result.downloaded).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.fileId).toBe('f2');
  });
});
