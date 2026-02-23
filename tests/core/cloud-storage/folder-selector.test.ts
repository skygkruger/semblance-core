// FolderSelector Tests — Add, remove, retrieve folders, browse via cloud client.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { FolderSelector } from '../../../packages/core/cloud-storage/folder-selector.js';
import type { CloudStorageAdapter, ListFilesResult, CloudFileMetadata } from '../../../packages/core/platform/cloud-storage-types.js';
import type { DatabaseHandle } from '../../../packages/core/platform/types.js';

describe('FolderSelector', () => {
  let db: Database.Database;
  let selector: FolderSelector;

  beforeEach(() => {
    db = new Database(':memory:');
    selector = new FolderSelector(db as unknown as DatabaseHandle);
  });

  afterEach(() => {
    db.close();
  });

  it('adds a folder and retrieves it', () => {
    selector.addFolder({
      provider: 'google_drive',
      folderId: 'folder-abc',
      folderName: 'Work Documents',
      folderPath: '/My Drive/Work Documents',
      includeSubfolders: true,
    });

    const folders = selector.getSelectedFolders('google_drive');
    expect(folders).toHaveLength(1);
    expect(folders[0]!.folderId).toBe('folder-abc');
    expect(folders[0]!.folderName).toBe('Work Documents');
    expect(folders[0]!.folderPath).toBe('/My Drive/Work Documents');
    expect(folders[0]!.includeSubfolders).toBe(true);
  });

  it('removes a folder', () => {
    selector.addFolder({
      provider: 'google_drive',
      folderId: 'folder-1',
      folderName: 'Folder 1',
      folderPath: '/Folder 1',
      includeSubfolders: false,
    });
    selector.addFolder({
      provider: 'google_drive',
      folderId: 'folder-2',
      folderName: 'Folder 2',
      folderPath: '/Folder 2',
      includeSubfolders: true,
    });

    expect(selector.getSelectedFolders('google_drive')).toHaveLength(2);

    selector.removeFolder('google_drive', 'folder-1');

    const remaining = selector.getSelectedFolders('google_drive');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.folderId).toBe('folder-2');
  });

  it('browses folders via cloud client and returns only folders', async () => {
    const listFilesFn = vi.fn().mockResolvedValue({
      files: [
        {
          id: 'folder-1', name: 'Documents', mimeType: 'application/vnd.google-apps.folder',
          sizeBytes: 0, modifiedTime: '2026-01-10T10:00:00Z', createdTime: '2026-01-10T10:00:00Z',
          parentId: 'root', md5Checksum: null, isFolder: true,
        },
        {
          id: 'file-1', name: 'readme.txt', mimeType: 'text/plain',
          sizeBytes: 100, modifiedTime: '2026-01-10T10:00:00Z', createdTime: '2026-01-10T10:00:00Z',
          parentId: 'root', md5Checksum: 'abc', isFolder: false,
        },
        {
          id: 'folder-2', name: 'Photos', mimeType: 'application/vnd.google-apps.folder',
          sizeBytes: 0, modifiedTime: '2026-01-10T10:00:00Z', createdTime: '2026-01-10T10:00:00Z',
          parentId: 'root', md5Checksum: null, isFolder: true,
        },
      ] satisfies CloudFileMetadata[],
      nextPageToken: null,
      totalFiles: 3,
    } satisfies ListFilesResult);

    const mockClient = {
      authenticate: vi.fn(),
      isAuthenticated: vi.fn(),
      disconnect: vi.fn(),
      listFiles: listFilesFn,
      getFileMetadata: vi.fn(),
      downloadFile: vi.fn(),
      hasFileChanged: vi.fn(),
    } as unknown as CloudStorageAdapter;

    const folders = await selector.browseFolders(mockClient, 'google_drive');

    expect(folders).toHaveLength(2);
    expect(folders[0]!.name).toBe('Documents');
    expect(folders[1]!.name).toBe('Photos');
    // File should be excluded
    expect(folders.find(f => f.name === 'readme.txt')).toBeUndefined();
  });

  it('persists folders across instances', () => {
    selector.addFolder({
      provider: 'google_drive',
      folderId: 'folder-persist',
      folderName: 'Persistent Folder',
      folderPath: '/Persistent Folder',
      includeSubfolders: true,
    });

    // Create a new FolderSelector instance using the same database
    const selector2 = new FolderSelector(db as unknown as DatabaseHandle);
    const folders = selector2.getSelectedFolders('google_drive');

    expect(folders).toHaveLength(1);
    expect(folders[0]!.folderId).toBe('folder-persist');
    expect(folders[0]!.folderName).toBe('Persistent Folder');
  });
});
