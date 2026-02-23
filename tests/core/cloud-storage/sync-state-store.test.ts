// SyncStateStore Tests — SQLite persistence, status updates, indexing, storage usage.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SyncStateStore } from '../../../packages/core/cloud-storage/sync-state-store.js';
import type { DatabaseHandle } from '../../../packages/core/platform/types.js';

describe('SyncStateStore', () => {
  let db: Database.Database;
  let store: SyncStateStore;

  beforeEach(() => {
    db = new Database(':memory:');
    store = new SyncStateStore(db as unknown as DatabaseHandle);
  });

  afterEach(() => {
    db.close();
  });

  it('records sync entry and retrieves by cloud ID', () => {
    store.recordSync({
      provider: 'google_drive',
      fileId: 'file-abc',
      fileName: 'report.pdf',
      filePath: '/My Drive/Documents/report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      cloudModifiedTime: '2026-01-15T10:00:00Z',
      localPath: '/home/user/.semblance/cloud-sync/google_drive/report.pdf',
      md5Checksum: 'abc123hash',
    });

    const record = store.getFileByCloudId('google_drive', 'file-abc');
    expect(record).not.toBeNull();
    expect(record!.provider).toBe('google_drive');
    expect(record!.fileId).toBe('file-abc');
    expect(record!.fileName).toBe('report.pdf');
    expect(record!.sizeBytes).toBe(2048);
    expect(record!.syncStatus).toBe('synced');
    expect(record!.indexed).toBe(false);
    expect(record!.md5Checksum).toBe('abc123hash');

    // Also verify getSyncedFiles returns it
    const files = store.getSyncedFiles('google_drive');
    expect(files).toHaveLength(1);
    expect(files[0]!.fileId).toBe('file-abc');
  });

  it('updates sync status', () => {
    store.recordSync({
      provider: 'google_drive',
      fileId: 'file-1',
      fileName: 'doc.txt',
      filePath: '/doc.txt',
      mimeType: 'text/plain',
      sizeBytes: 100,
      cloudModifiedTime: '2026-01-10T10:00:00Z',
      localPath: '/sync/doc.txt',
      md5Checksum: null,
    });

    expect(store.getFileByCloudId('google_drive', 'file-1')!.syncStatus).toBe('synced');

    store.updateSyncStatus('google_drive', 'file-1', 'error');
    expect(store.getFileByCloudId('google_drive', 'file-1')!.syncStatus).toBe('error');

    store.updateSyncStatus('google_drive', 'file-1', 'pending');
    expect(store.getFileByCloudId('google_drive', 'file-1')!.syncStatus).toBe('pending');
  });

  it('getUnindexedFiles returns only unindexed synced files', () => {
    // File 1: synced, not indexed
    store.recordSync({
      provider: 'google_drive',
      fileId: 'file-1',
      fileName: 'a.txt',
      filePath: '/a.txt',
      mimeType: 'text/plain',
      sizeBytes: 100,
      cloudModifiedTime: '2026-01-10T10:00:00Z',
      localPath: '/sync/a.txt',
      md5Checksum: null,
    });

    // File 2: synced, indexed
    store.recordSync({
      provider: 'google_drive',
      fileId: 'file-2',
      fileName: 'b.txt',
      filePath: '/b.txt',
      mimeType: 'text/plain',
      sizeBytes: 200,
      cloudModifiedTime: '2026-01-11T10:00:00Z',
      localPath: '/sync/b.txt',
      md5Checksum: null,
      indexed: true,
    });

    // File 3: error status, not indexed (should NOT appear)
    store.recordSync({
      provider: 'google_drive',
      fileId: 'file-3',
      fileName: 'c.txt',
      filePath: '/c.txt',
      mimeType: 'text/plain',
      sizeBytes: 300,
      cloudModifiedTime: '2026-01-12T10:00:00Z',
      localPath: '/sync/c.txt',
      md5Checksum: null,
      syncStatus: 'error',
    });

    const unindexed = store.getUnindexedFiles('google_drive');
    expect(unindexed).toHaveLength(1);
    expect(unindexed[0]!.fileId).toBe('file-1');

    // Mark as indexed and re-check
    store.markIndexed('google_drive', 'file-1');
    expect(store.getUnindexedFiles('google_drive')).toHaveLength(0);
    expect(store.getFileByCloudId('google_drive', 'file-1')!.indexed).toBe(true);
  });

  it('getStorageUsage returns correct totals', () => {
    store.recordSync({
      provider: 'google_drive',
      fileId: 'file-1',
      fileName: 'a.pdf',
      filePath: '/a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      cloudModifiedTime: '2026-01-10T10:00:00Z',
      localPath: '/sync/a.pdf',
      md5Checksum: null,
    });

    store.recordSync({
      provider: 'google_drive',
      fileId: 'file-2',
      fileName: 'b.docx',
      filePath: '/b.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: 2048,
      cloudModifiedTime: '2026-01-11T10:00:00Z',
      localPath: '/sync/b.docx',
      md5Checksum: null,
    });

    // A third file from a different provider — should not count
    store.recordSync({
      provider: 'dropbox',
      fileId: 'file-3',
      fileName: 'c.txt',
      filePath: '/c.txt',
      mimeType: 'text/plain',
      sizeBytes: 512,
      cloudModifiedTime: '2026-01-12T10:00:00Z',
      localPath: '/sync/c.txt',
      md5Checksum: null,
    });

    const usage = store.getStorageUsage('google_drive');
    expect(usage.provider).toBe('google_drive');
    expect(usage.totalBytes).toBe(1024 + 2048);
    expect(usage.fileCount).toBe(2);

    const dropboxUsage = store.getStorageUsage('dropbox');
    expect(dropboxUsage.totalBytes).toBe(512);
    expect(dropboxUsage.fileCount).toBe(1);
  });

  it('clearProvider removes all entries for a provider', () => {
    store.recordSync({
      provider: 'google_drive',
      fileId: 'file-1',
      fileName: 'a.txt',
      filePath: '/a.txt',
      mimeType: 'text/plain',
      sizeBytes: 100,
      cloudModifiedTime: '2026-01-10T10:00:00Z',
      localPath: '/sync/a.txt',
      md5Checksum: null,
    });

    store.recordSync({
      provider: 'google_drive',
      fileId: 'file-2',
      fileName: 'b.txt',
      filePath: '/b.txt',
      mimeType: 'text/plain',
      sizeBytes: 200,
      cloudModifiedTime: '2026-01-11T10:00:00Z',
      localPath: '/sync/b.txt',
      md5Checksum: null,
    });

    store.recordSync({
      provider: 'dropbox',
      fileId: 'file-3',
      fileName: 'c.txt',
      filePath: '/c.txt',
      mimeType: 'text/plain',
      sizeBytes: 300,
      cloudModifiedTime: '2026-01-12T10:00:00Z',
      localPath: '/sync/c.txt',
      md5Checksum: null,
    });

    expect(store.getSyncedFiles('google_drive')).toHaveLength(2);
    expect(store.getSyncedFiles('dropbox')).toHaveLength(1);

    store.clearProvider('google_drive');

    expect(store.getSyncedFiles('google_drive')).toHaveLength(0);
    expect(store.getSyncedFiles('dropbox')).toHaveLength(1);
  });
});
