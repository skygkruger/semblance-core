// StorageManager Tests — Usage calculation, budget check, cleanup, path generation.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { StorageManager } from '../../../packages/core/cloud-storage/storage-manager.js';
import { SyncStateStore } from '../../../packages/core/cloud-storage/sync-state-store.js';
import type { DatabaseHandle } from '../../../packages/core/platform/types.js';

describe('StorageManager', () => {
  let db: Database.Database;
  let syncStateStore: SyncStateStore;

  beforeEach(() => {
    db = new Database(':memory:');
    syncStateStore = new SyncStateStore(db as unknown as DatabaseHandle);
  });

  afterEach(() => {
    db.close();
  });

  it('calculates storage usage correctly', () => {
    syncStateStore.recordSync({
      provider: 'google_drive',
      fileId: 'f1', fileName: 'a.pdf', filePath: '/a.pdf',
      mimeType: 'application/pdf', sizeBytes: 1024,
      cloudModifiedTime: '2026-01-10T10:00:00Z', localPath: '/sync/a.pdf', md5Checksum: null,
    });
    syncStateStore.recordSync({
      provider: 'google_drive',
      fileId: 'f2', fileName: 'b.txt', filePath: '/b.txt',
      mimeType: 'text/plain', sizeBytes: 2048,
      cloudModifiedTime: '2026-01-11T10:00:00Z', localPath: '/sync/b.txt', md5Checksum: null,
    });

    const manager = new StorageManager(syncStateStore, '/sync');
    const usage = manager.getStorageUsage('google_drive');

    expect(usage.totalBytes).toBe(3072);
    expect(usage.fileCount).toBe(2);

    const total = manager.getTotalStorageUsage(['google_drive']);
    expect(total.totalBytes).toBe(3072);
    expect(total.fileCount).toBe(2);
    expect(total.byProvider).toHaveLength(1);
  });

  it('budget check returns true when within, false when exceeds', () => {
    syncStateStore.recordSync({
      provider: 'google_drive',
      fileId: 'f1', fileName: 'a.pdf', filePath: '/a.pdf',
      mimeType: 'application/pdf', sizeBytes: 500 * 1024 * 1024, // 500MB
      cloudModifiedTime: '2026-01-10T10:00:00Z', localPath: '/sync/a.pdf', md5Checksum: null,
    });

    const manager = new StorageManager(syncStateStore, '/sync');

    // 1GB budget — 500MB usage should be within
    expect(manager.isWithinBudget(1, ['google_drive'])).toBe(true);

    // 0.4GB budget — 500MB (0.48GB) usage should exceed
    expect(manager.isWithinBudget(0.4, ['google_drive'])).toBe(false);
  });

  it('cleanup provider removes sync state records', () => {
    syncStateStore.recordSync({
      provider: 'google_drive',
      fileId: 'f1', fileName: 'a.pdf', filePath: '/a.pdf',
      mimeType: 'application/pdf', sizeBytes: 1024,
      cloudModifiedTime: '2026-01-10T10:00:00Z', localPath: '/sync/a.pdf', md5Checksum: null,
    });
    syncStateStore.recordSync({
      provider: 'google_drive',
      fileId: 'f2', fileName: 'b.txt', filePath: '/b.txt',
      mimeType: 'text/plain', sizeBytes: 512,
      cloudModifiedTime: '2026-01-11T10:00:00Z', localPath: '/sync/b.txt', md5Checksum: null,
    });

    expect(syncStateStore.getSyncedFiles('google_drive')).toHaveLength(2);

    // Without filesystem adapter, only sync state is cleared
    const manager = new StorageManager(syncStateStore, '/sync');
    manager.cleanupProvider('google_drive');

    expect(syncStateStore.getSyncedFiles('google_drive')).toHaveLength(0);
    expect(manager.getStorageUsage('google_drive').totalBytes).toBe(0);
  });

  it('getLocalPath mirrors cloud path structure', () => {
    const manager = new StorageManager(syncStateStore, '/home/user/.semblance/cloud-sync');

    const path = manager.getLocalPath('google_drive', 'file-123', 'report.pdf');
    expect(path).toBe('/home/user/.semblance/cloud-sync/google_drive/file-123_report.pdf');

    const path2 = manager.getLocalPath('dropbox', 'file-456', 'notes.txt');
    expect(path2).toBe('/home/user/.semblance/cloud-sync/dropbox/file-456_notes.txt');
  });
});
