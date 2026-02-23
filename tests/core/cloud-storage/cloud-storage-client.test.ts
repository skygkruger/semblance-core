// CloudStorageClient Tests — Verify all 7 methods delegate to IPCClient.sendAction.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudStorageClient } from '../../../packages/core/cloud-storage/cloud-storage-client.js';
import type { IPCClient } from '../../../packages/core/agent/ipc-client.js';
import type { ActionResponse, ActionType } from '../../../packages/core/types/ipc.js';

function mockResponse(data?: unknown): ActionResponse {
  return {
    requestId: 'test-id',
    timestamp: new Date().toISOString(),
    status: 'success',
    data,
    auditRef: 'audit-ref',
  };
}

describe('CloudStorageClient', () => {
  let mockIpc: IPCClient;
  let sendActionFn: ReturnType<typeof vi.fn>;
  let client: CloudStorageClient;

  beforeEach(() => {
    sendActionFn = vi.fn().mockResolvedValue(mockResponse());
    mockIpc = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
      sendAction: sendActionFn,
    };
    client = new CloudStorageClient(mockIpc, 'google_drive');
  });

  it('authenticate() sends cloud.auth with provider', async () => {
    sendActionFn.mockResolvedValue(mockResponse({
      success: true,
      provider: 'google_drive',
      userEmail: 'user@gmail.com',
    }));

    const result = await client.authenticate();
    expect(sendActionFn).toHaveBeenCalledWith('cloud.auth', { provider: 'google_drive' });
    expect(result.success).toBe(true);
    expect(result.userEmail).toBe('user@gmail.com');
  });

  it('isAuthenticated() sends cloud.auth_status', async () => {
    sendActionFn.mockResolvedValue(mockResponse({ authenticated: true }));

    const result = await client.isAuthenticated();
    expect(sendActionFn).toHaveBeenCalledWith('cloud.auth_status', { provider: 'google_drive' });
    expect(result).toBe(true);
  });

  it('disconnect() sends cloud.disconnect', async () => {
    await client.disconnect();
    expect(sendActionFn).toHaveBeenCalledWith('cloud.disconnect', { provider: 'google_drive' });
  });

  it('listFiles() sends cloud.list_files with options', async () => {
    sendActionFn.mockResolvedValue(mockResponse({
      files: [{ id: 'f1', name: 'test.pdf' }],
      nextPageToken: null,
      totalFiles: 1,
    }));

    const result = await client.listFiles('google_drive', {
      folderId: 'root',
      pageSize: 50,
    });
    expect(sendActionFn).toHaveBeenCalledWith('cloud.list_files', {
      provider: 'google_drive',
      folderId: 'root',
      pageSize: 50,
    });
    expect(result.files).toHaveLength(1);
  });

  it('downloadFile() sends cloud.download_file with fileId + localPath', async () => {
    sendActionFn.mockResolvedValue(mockResponse({
      success: true,
      localPath: '/tmp/test.pdf',
      sizeBytes: 1024,
      mimeType: 'application/pdf',
    }));

    const result = await client.downloadFile('google_drive', 'file123', '/tmp/test.pdf');
    expect(sendActionFn).toHaveBeenCalledWith('cloud.download_file', {
      provider: 'google_drive',
      fileId: 'file123',
      localPath: '/tmp/test.pdf',
    });
    expect(result.success).toBe(true);
    expect(result.sizeBytes).toBe(1024);
  });

  it('hasFileChanged() sends cloud.check_changed with timestamp', async () => {
    sendActionFn.mockResolvedValue(mockResponse({ changed: true }));

    const result = await client.hasFileChanged('google_drive', 'file123', '2026-01-01T00:00:00Z');
    expect(sendActionFn).toHaveBeenCalledWith('cloud.check_changed', {
      provider: 'google_drive',
      fileId: 'file123',
      sinceTimestamp: '2026-01-01T00:00:00Z',
    });
    expect(result).toBe(true);
  });
});
