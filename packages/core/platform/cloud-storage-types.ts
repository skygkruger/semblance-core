// Cloud Storage Adapter Types — Read-only interface for cloud storage providers.
// CRITICAL: Pull-only. No write, upload, delete, or modify methods.
// All cloud storage operations are delegated to the Gateway via IPC.

export type CloudStorageProvider = 'google_drive' | 'dropbox' | 'onedrive';

export interface AuthResult {
  success: boolean;
  provider: CloudStorageProvider;
  userEmail?: string;
  error?: string;
}

export interface ListFilesOptions {
  folderId?: string;
  pageToken?: string;
  pageSize?: number;
  mimeTypeFilter?: string;
  orderBy?: 'name' | 'modifiedTime' | 'createdTime';
}

export interface CloudFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  modifiedTime: string;
  createdTime: string;
  parentId: string | null;
  md5Checksum: string | null;
  isFolder: boolean;
  webViewLink?: string;
}

export interface ListFilesResult {
  files: CloudFileMetadata[];
  nextPageToken: string | null;
  totalFiles: number;
}

export interface DownloadResult {
  success: boolean;
  localPath: string;
  sizeBytes: number;
  mimeType: string;
  error?: string;
}

/**
 * Cloud Storage Adapter — read-only interface for cloud file access.
 * All methods delegate to the Gateway via IPC. No network imports.
 * CRITICAL: No write/upload/delete/modify methods — pull-only by design.
 */
export interface CloudStorageAdapter {
  /** Start OAuth flow for the given provider */
  authenticate(provider: CloudStorageProvider): Promise<AuthResult>;

  /** Check if authenticated for the given provider */
  isAuthenticated(provider: CloudStorageProvider): Promise<boolean>;

  /** Disconnect and revoke tokens for the given provider */
  disconnect(provider: CloudStorageProvider): Promise<void>;

  /** List files/folders in a given folder (or root) */
  listFiles(provider: CloudStorageProvider, options?: ListFilesOptions): Promise<ListFilesResult>;

  /** Get metadata for a specific file */
  getFileMetadata(provider: CloudStorageProvider, fileId: string): Promise<CloudFileMetadata>;

  /** Download a file to a local path */
  downloadFile(provider: CloudStorageProvider, fileId: string, localPath: string): Promise<DownloadResult>;

  /** Check if a file has changed since a given timestamp */
  hasFileChanged(provider: CloudStorageProvider, fileId: string, sinceTimestamp: string): Promise<boolean>;
}
