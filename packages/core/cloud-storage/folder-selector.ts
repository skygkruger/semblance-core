// FolderSelector — Manages which cloud folders are selected for sync.
// Persists configuration in SQLite via platform DatabaseHandle.
// Core package — zero network imports, zero Gateway imports.

import type { DatabaseHandle } from '../platform/types.js';
import type { CloudStorageAdapter, CloudStorageProvider, CloudFileMetadata } from '../platform/cloud-storage-types.js';

export interface SelectedFolder {
  provider: string;
  folderId: string;
  folderName: string;
  folderPath: string;
  includeSubfolders: boolean;
  addedAt: string;
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS cloud_sync_config (
    provider TEXT NOT NULL,
    folder_id TEXT NOT NULL,
    folder_name TEXT NOT NULL,
    folder_path TEXT NOT NULL DEFAULT '',
    include_subfolders INTEGER NOT NULL DEFAULT 1,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (provider, folder_id)
  );
`;

export class FolderSelector {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.db.exec(CREATE_TABLE);
  }

  /** Get all selected folders for a provider. */
  getSelectedFolders(provider: string): SelectedFolder[] {
    const rows = this.db.prepare(
      'SELECT * FROM cloud_sync_config WHERE provider = ?'
    ).all(provider) as Array<Record<string, unknown>>;

    return rows.map(row => ({
      provider: row['provider'] as string,
      folderId: row['folder_id'] as string,
      folderName: row['folder_name'] as string,
      folderPath: row['folder_path'] as string,
      includeSubfolders: (row['include_subfolders'] as number) === 1,
      addedAt: row['added_at'] as string,
    }));
  }

  /** Add a folder to sync configuration. */
  addFolder(folder: Omit<SelectedFolder, 'addedAt'> & { addedAt?: string }): void {
    this.db.prepare(`
      INSERT INTO cloud_sync_config (provider, folder_id, folder_name, folder_path, include_subfolders, added_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, folder_id) DO UPDATE SET
        folder_name = excluded.folder_name,
        folder_path = excluded.folder_path,
        include_subfolders = excluded.include_subfolders
    `).run(
      folder.provider,
      folder.folderId,
      folder.folderName,
      folder.folderPath,
      folder.includeSubfolders ? 1 : 0,
      folder.addedAt ?? new Date().toISOString(),
    );
  }

  /** Remove a folder from sync configuration. */
  removeFolder(provider: string, folderId: string): void {
    this.db.prepare(
      'DELETE FROM cloud_sync_config WHERE provider = ? AND folder_id = ?'
    ).run(provider, folderId);
  }

  /** Browse folders using the cloud storage client. Returns folder-type files only. */
  async browseFolders(
    client: CloudStorageAdapter,
    provider: CloudStorageProvider,
    parentFolderId?: string,
  ): Promise<CloudFileMetadata[]> {
    const result = await client.listFiles(provider, {
      folderId: parentFolderId ?? 'root',
      pageSize: 100,
    });

    return result.files.filter(f => f.isFolder);
  }
}
