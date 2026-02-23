// CloudStorageClient — Core-side IPC delegator for cloud storage operations.
// Implements CloudStorageAdapter by delegating all calls to the Gateway via IPCClient.
// Zero network imports — all external operations go through the Gateway IPC channel.

import type { IPCClient } from '../agent/ipc-client.js';
import type {
  CloudStorageAdapter,
  CloudStorageProvider,
  AuthResult,
  ListFilesOptions,
  ListFilesResult,
  CloudFileMetadata,
  DownloadResult,
} from '../platform/cloud-storage-types.js';

export class CloudStorageClient implements CloudStorageAdapter {
  private ipc: IPCClient;
  private defaultProvider: CloudStorageProvider;

  constructor(ipcClient: IPCClient, provider: CloudStorageProvider = 'google_drive') {
    this.ipc = ipcClient;
    this.defaultProvider = provider;
  }

  async authenticate(provider: CloudStorageProvider = this.defaultProvider): Promise<AuthResult> {
    const response = await this.ipc.sendAction('cloud.auth', { provider });
    if (response.status === 'success' && response.data) {
      return response.data as AuthResult;
    }
    return {
      success: false,
      provider,
      error: response.error?.message ?? 'Authentication failed',
    };
  }

  async isAuthenticated(provider: CloudStorageProvider = this.defaultProvider): Promise<boolean> {
    const response = await this.ipc.sendAction('cloud.auth_status', { provider });
    if (response.status === 'success' && response.data) {
      return (response.data as { authenticated: boolean }).authenticated;
    }
    return false;
  }

  async disconnect(provider: CloudStorageProvider = this.defaultProvider): Promise<void> {
    await this.ipc.sendAction('cloud.disconnect', { provider });
  }

  async listFiles(
    provider: CloudStorageProvider = this.defaultProvider,
    options?: ListFilesOptions,
  ): Promise<ListFilesResult> {
    const response = await this.ipc.sendAction('cloud.list_files', {
      provider,
      ...options,
    });
    if (response.status === 'success' && response.data) {
      return response.data as ListFilesResult;
    }
    return { files: [], nextPageToken: null, totalFiles: 0 };
  }

  async getFileMetadata(
    provider: CloudStorageProvider = this.defaultProvider,
    fileId: string,
  ): Promise<CloudFileMetadata> {
    const response = await this.ipc.sendAction('cloud.file_metadata', {
      provider,
      fileId,
    });
    if (response.status === 'success' && response.data) {
      return response.data as CloudFileMetadata;
    }
    throw new Error(`Failed to get file metadata: ${response.error?.message ?? 'Unknown error'}`);
  }

  async downloadFile(
    provider: CloudStorageProvider = this.defaultProvider,
    fileId: string,
    localPath: string,
  ): Promise<DownloadResult> {
    const response = await this.ipc.sendAction('cloud.download_file', {
      provider,
      fileId,
      localPath,
    });
    if (response.status === 'success' && response.data) {
      return response.data as DownloadResult;
    }
    return {
      success: false,
      localPath,
      sizeBytes: 0,
      mimeType: '',
      error: response.error?.message ?? 'Download failed',
    };
  }

  async hasFileChanged(
    provider: CloudStorageProvider = this.defaultProvider,
    fileId: string,
    sinceTimestamp: string,
  ): Promise<boolean> {
    const response = await this.ipc.sendAction('cloud.check_changed', {
      provider,
      fileId,
      sinceTimestamp,
    });
    if (response.status === 'success' && response.data) {
      return (response.data as { changed: boolean }).changed;
    }
    // Default to true (assume changed) if we can't check
    return true;
  }
}
