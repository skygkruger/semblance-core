/**
 * BoxAdapter — Gateway service adapter for the Box Content API v2.0.
 *
 * Extends BaseOAuthAdapter (standard OAuth 2.0).
 * Handles both connector.* actions (sync/list) and cloud.* actions (read-only).
 * Box doesn't use scopes in the OAuth flow — permissions are set at app level.
 *
 * All HTTP calls use globalThis.fetch. No external HTTP libraries.
 */

import type { ActionType } from '@semblance/core';
import type { OAuthTokenManager } from '../oauth-token-manager.js';
import type { OAuthConfig } from '../oauth-config.js';
import type { AdapterResult } from '../base-oauth-adapter.js';
import type { ImportedItem } from '@semblance/core/importers/types.js';
import { BaseOAuthAdapter } from '../base-oauth-adapter.js';
import { oauthClients } from '../../config/oauth-clients.js';

const API_BASE = 'https://api.box.com/2.0';

/** Build the OAuthConfig for Box. */
export function getBoxOAuthConfig(): OAuthConfig {
  return {
    providerKey: 'box',
    authUrl: 'https://account.box.com/api/oauth2/authorize',
    tokenUrl: 'https://api.box.com/oauth2/token',
    scopes: 'root_readwrite',
    usePKCE: false,
    clientId: oauthClients.box.clientId,
    clientSecret: oauthClients.box.clientSecret,
    revokeUrl: 'https://api.box.com/oauth2/revoke',
  };
}

interface BoxUser {
  id: string;
  type: 'user';
  name: string;
  login: string; // email
  space_amount: number;
  space_used: number;
}

interface BoxItem {
  id: string;
  type: 'file' | 'folder' | 'web_link';
  name: string;
  description?: string;
  size: number;
  content_created_at: string | null;
  content_modified_at: string | null;
  created_at: string;
  modified_at: string;
  created_by?: { id: string; name: string; login: string };
  modified_by?: { id: string; name: string; login: string };
  parent?: { id: string; name: string; type: string };
  path_collection?: {
    total_count: number;
    entries: Array<{ id: string; name: string; type: string }>;
  };
  shared_link?: {
    url: string;
    download_url?: string;
    access: string;
  };
  extension?: string;
  sha1?: string;
}

interface BoxItemsResponse {
  total_count: number;
  entries: BoxItem[];
  offset: number;
  limit: number;
  order?: Array<{ by: string; direction: string }>;
}

interface BoxFileContent {
  content: Buffer;
  name: string;
  size: number;
}

export class BoxAdapter extends BaseOAuthAdapter {
  constructor(tokenManager: OAuthTokenManager) {
    super(tokenManager, getBoxOAuthConfig());
  }

  protected async getUserInfo(accessToken: string): Promise<{ email?: string; displayName?: string }> {
    const response = await globalThis.fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Box user info failed: HTTP ${response.status}`);
    }

    const user = await response.json() as BoxUser;
    return {
      email: user.login,
      displayName: user.name,
    };
  }

  async execute(action: ActionType, payload: unknown): Promise<AdapterResult> {
    const p = payload as Record<string, unknown>;

    try {
      switch (action) {
        // Connector actions
        case 'connector.auth':
          return await this.performAuthFlow();

        case 'connector.auth_status':
          return this.handleAuthStatus();

        case 'connector.disconnect':
          return await this.performDisconnect();

        case 'connector.sync':
          return await this.handleSync(p);

        case 'connector.list_items':
          return await this.handleListItems(p);

        // Cloud storage actions (read-only)
        case 'cloud.auth':
          return await this.performAuthFlow();

        case 'cloud.auth_status':
          return this.handleAuthStatus();

        case 'cloud.disconnect':
          return await this.performDisconnect();

        case 'cloud.list_files':
          return await this.handleListFiles(p);

        case 'cloud.file_metadata':
          return await this.handleFileMetadata(p);

        case 'cloud.download_file':
          return await this.handleDownloadFile(p);

        case 'cloud.check_changed':
          return await this.handleCheckChanged(p);

        default:
          return {
            success: false,
            error: { code: 'UNKNOWN_ACTION', message: `BoxAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'BOX_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Sync root folder items from Box.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const limit = (payload['limit'] as number) ?? 200;
    const folderId = (payload['folderId'] as string) ?? '0'; // 0 = root
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    try {
      const fileItems = await this.fetchFolderItems(accessToken, folderId, limit);
      items.push(...fileItems);
    } catch (err) {
      errors.push({ message: `Folder items: ${err instanceof Error ? err.message : String(err)}` });
    }

    return {
      success: true,
      data: {
        items,
        totalItems: items.length,
        errors,
      },
    };
  }

  /**
   * List items in a folder with offset-based pagination.
   */
  private async handleListItems(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const folderId = (payload['folderId'] as string) ?? '0';
    const pageSize = (payload['pageSize'] as number) ?? 50;
    const offset = payload['pageToken'] ? parseInt(payload['pageToken'] as string, 10) : 0;

    const url = new URL(`${API_BASE}/folders/${folderId}/items`);
    url.searchParams.set('limit', String(Math.min(pageSize, 1000)));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('fields', 'id,type,name,description,size,created_at,modified_at,content_created_at,content_modified_at,parent,path_collection,extension,sha1');

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'BOX_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as BoxItemsResponse;
    const items = data.entries.map((item) => this.boxItemToImportedItem(item));
    const nextOffset = offset + data.entries.length;
    const nextPageToken = nextOffset < data.total_count ? String(nextOffset) : null;

    return {
      success: true,
      data: {
        items,
        nextPageToken,
        total: data.total_count,
      },
    };
  }

  /**
   * List files in a Box folder (cloud.list_files action).
   */
  private async handleListFiles(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const folderId = (payload['folderId'] as string) ?? '0';
    const pageSize = (payload['pageSize'] as number) ?? 100;
    const pageToken = payload['pageToken'] as string | undefined;
    const offset = pageToken ? parseInt(pageToken, 10) : 0;

    const url = new URL(`${API_BASE}/folders/${folderId}/items`);
    url.searchParams.set('limit', String(Math.min(pageSize, 1000)));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('fields', 'id,type,name,description,size,created_at,modified_at,content_created_at,content_modified_at,parent,path_collection,extension,sha1,shared_link');

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'BOX_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as BoxItemsResponse;

    const files = data.entries.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      sizeBytes: item.size,
      modifiedTime: item.modified_at,
      createdTime: item.created_at,
      parentId: item.parent?.id ?? null,
      sha1: item.sha1 ?? null,
      isFolder: item.type === 'folder',
      extension: item.extension ?? null,
    }));

    const nextOffset = offset + data.entries.length;
    const nextPageTokenValue = nextOffset < data.total_count ? String(nextOffset) : null;

    return {
      success: true,
      data: { files, nextPageToken: nextPageTokenValue, totalFiles: data.total_count },
    };
  }

  /**
   * Get file metadata (cloud.file_metadata action).
   */
  private async handleFileMetadata(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const fileId = payload['fileId'] as string;

    if (!fileId) {
      return {
        success: false,
        error: { code: 'MISSING_FILE_ID', message: 'payload.fileId is required' },
      };
    }

    const url = `${API_BASE}/files/${fileId}?fields=id,type,name,description,size,created_at,modified_at,content_created_at,content_modified_at,parent,path_collection,extension,sha1,shared_link`;

    const response = await globalThis.fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'BOX_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const item = await response.json() as BoxItem;

    return {
      success: true,
      data: {
        id: item.id,
        name: item.name,
        type: item.type,
        sizeBytes: item.size,
        modifiedTime: item.modified_at,
        createdTime: item.created_at,
        parentId: item.parent?.id ?? null,
        sha1: item.sha1 ?? null,
        isFolder: item.type === 'folder',
        extension: item.extension ?? null,
        description: item.description,
        sharedLink: item.shared_link?.url ?? null,
        path: item.path_collection?.entries.map(e => e.name).join('/') ?? null,
      },
    };
  }

  /**
   * Download a file from Box (cloud.download_file action).
   */
  private async handleDownloadFile(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const fileId = payload['fileId'] as string;
    const localPath = payload['localPath'] as string;

    if (!fileId || !localPath) {
      return {
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'payload.fileId and payload.localPath are required' },
      };
    }

    const response = await globalThis.fetch(`${API_BASE}/files/${fileId}/content`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'DOWNLOAD_FAILED', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(localPath, buffer);

    return {
      success: true,
      data: {
        localPath,
        sizeBytes: buffer.length,
      },
    };
  }

  /**
   * Check if a file has been modified since a given timestamp (cloud.check_changed action).
   */
  private async handleCheckChanged(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const fileId = payload['fileId'] as string;
    const sinceTimestamp = payload['sinceTimestamp'] as string;

    if (!fileId || !sinceTimestamp) {
      return {
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'payload.fileId and payload.sinceTimestamp are required' },
      };
    }

    const response = await globalThis.fetch(`${API_BASE}/files/${fileId}?fields=modified_at`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'BOX_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as { modified_at: string };
    const remoteModified = new Date(data.modified_at).getTime();
    const sinceMs = new Date(sinceTimestamp).getTime();

    return {
      success: true,
      data: { changed: remoteModified > sinceMs },
    };
  }

  private async fetchFolderItems(accessToken: string, folderId: string, limit: number): Promise<ImportedItem[]> {
    const items: ImportedItem[] = [];
    let offset = 0;

    while (items.length < limit) {
      const url = new URL(`${API_BASE}/folders/${folderId}/items`);
      url.searchParams.set('limit', String(Math.min(1000, limit - items.length)));
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('fields', 'id,type,name,description,size,created_at,modified_at,content_created_at,content_modified_at,parent,path_collection,extension,sha1');

      const response = await globalThis.fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as BoxItemsResponse;

      if (data.entries.length === 0) break;

      for (const entry of data.entries) {
        if (items.length >= limit) break;
        items.push(this.boxItemToImportedItem(entry));
      }

      offset += data.entries.length;
      if (offset >= data.total_count) break;
    }

    return items;
  }

  private boxItemToImportedItem(item: BoxItem): ImportedItem {
    const pathStr = item.path_collection
      ? item.path_collection.entries.map(e => e.name).join('/')
      : '';

    return {
      id: `box_${item.type}_${item.id}`,
      sourceType: 'productivity' as const,
      title: item.name,
      content: `Box ${item.type}: "${item.name}"${pathStr ? ` at /${pathStr}` : ''}.${item.description ? ` ${item.description}` : ''} Size: ${item.size} bytes. Modified: ${item.modified_at}.`,
      timestamp: item.modified_at,
      metadata: {
        provider: 'box',
        type: item.type,
        itemId: item.id,
        name: item.name,
        size: item.size,
        extension: item.extension,
        sha1: item.sha1,
        parentId: item.parent?.id,
        parentName: item.parent?.name,
        path: pathStr,
        isFolder: item.type === 'folder',
        createdAt: item.created_at,
        contentCreatedAt: item.content_created_at,
        contentModifiedAt: item.content_modified_at,
      },
    };
  }
}
