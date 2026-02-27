/**
 * OneDriveAdapter — Gateway service adapter for the Microsoft Graph API (OneDrive).
 *
 * Extends BaseOAuthAdapter (standard OAuth 2.0 — NOT PKCE).
 * Uses Microsoft identity platform v2.0 endpoints.
 *
 * OneDrive/Graph API uses @odata.nextLink for pagination.
 * The offline_access scope ensures a refresh token is returned.
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

const ONEDRIVE_SCOPES = 'Files.Read.All User.Read offline_access';

/** Microsoft Graph API base URL */
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/** Build the OAuthConfig for OneDrive. */
export function getOneDriveOAuthConfig(): OAuthConfig {
  return {
    providerKey: 'onedrive',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ONEDRIVE_SCOPES,
    usePKCE: false,
    clientId: oauthClients.onedrive.clientId,
    clientSecret: oauthClients.onedrive.clientSecret,
    extraAuthParams: {
      response_mode: 'query',
    },
  };
}

interface GraphUser {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
}

interface DriveItem {
  id: string;
  name: string;
  size: number;
  createdDateTime: string;
  lastModifiedDateTime: string;
  webUrl: string;
  parentReference?: {
    driveId: string;
    id: string;
    path?: string;
  };
  file?: {
    mimeType: string;
    hashes?: {
      sha1Hash?: string;
      quickXorHash?: string;
    };
  };
  folder?: {
    childCount: number;
  };
}

interface DriveItemListResponse {
  value: DriveItem[];
  '@odata.nextLink'?: string;
}

export class OneDriveAdapter extends BaseOAuthAdapter {
  constructor(tokenManager: OAuthTokenManager) {
    super(tokenManager, getOneDriveOAuthConfig());
  }

  protected async getUserInfo(accessToken: string): Promise<{ email?: string; displayName?: string }> {
    const response = await globalThis.fetch(`${GRAPH_BASE}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`OneDrive user info failed: HTTP ${response.status}`);
    }

    const user = await response.json() as GraphUser;
    return {
      email: user.mail ?? user.userPrincipalName,
      displayName: user.displayName,
    };
  }

  async execute(action: ActionType, payload: unknown): Promise<AdapterResult> {
    const p = payload as Record<string, unknown>;

    try {
      switch (action) {
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

        case 'cloud.list_files':
          return await this.handleListFiles(p);

        case 'cloud.download_file':
          return await this.handleDownloadFile(p);

        case 'cloud.file_metadata':
          return await this.handleFileMetadata(p);

        case 'cloud.check_changed':
          return await this.handleCheckChanged(p);

        default:
          return {
            success: false,
            error: { code: 'UNKNOWN_ACTION', message: `OneDriveAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'ONEDRIVE_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Sync files from the OneDrive root.
   * Paginates using @odata.nextLink.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const limit = (payload['limit'] as number) ?? 100;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    try {
      let nextLink: string | null = `${GRAPH_BASE}/me/drive/root/children?$top=${Math.min(limit, 200)}`;

      while (nextLink && items.length < limit) {
        const response = await globalThis.fetch(nextLink, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json() as DriveItemListResponse;

        for (const item of data.value) {
          if (items.length >= limit) break;
          items.push(this.driveItemToImportedItem(item));
        }

        nextLink = data['@odata.nextLink'] ?? null;
      }
    } catch (err) {
      errors.push({ message: `List files: ${err instanceof Error ? err.message : String(err)}` });
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
   * List items with pagination (connector.list_items).
   */
  private async handleListItems(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const pageSize = (payload['pageSize'] as number) ?? 100;
    const nextLink = payload['pageToken'] as string | undefined;

    const url = nextLink ?? `${GRAPH_BASE}/me/drive/root/children?$top=${Math.min(pageSize, 200)}`;

    const response = await globalThis.fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'ONEDRIVE_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as DriveItemListResponse;
    const items = data.value.map((item) => this.driveItemToImportedItem(item));

    return {
      success: true,
      data: {
        items,
        nextPageToken: data['@odata.nextLink'] ?? null,
      },
    };
  }

  /**
   * List files in a folder (cloud.list_files).
   */
  private async handleListFiles(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const folderId = (payload['folderId'] as string) ?? 'root';
    const pageSize = (payload['pageSize'] as number) ?? 100;
    const nextLink = payload['pageToken'] as string | undefined;

    let url: string;
    if (nextLink) {
      url = nextLink;
    } else if (folderId === 'root') {
      url = `${GRAPH_BASE}/me/drive/root/children?$top=${Math.min(pageSize, 200)}`;
    } else {
      url = `${GRAPH_BASE}/me/drive/items/${folderId}/children?$top=${Math.min(pageSize, 200)}`;
    }

    const response = await globalThis.fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'ONEDRIVE_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as DriveItemListResponse;

    const files = data.value.map((item) => ({
      id: item.id,
      name: item.name,
      isFolder: !!item.folder,
      sizeBytes: item.size,
      mimeType: item.file?.mimeType ?? null,
      createdTime: item.createdDateTime,
      modifiedTime: item.lastModifiedDateTime,
      webUrl: item.webUrl,
      childCount: item.folder?.childCount ?? null,
      parentPath: item.parentReference?.path ?? null,
    }));

    return {
      success: true,
      data: {
        files,
        nextPageToken: data['@odata.nextLink'] ?? null,
        totalFiles: files.length,
      },
    };
  }

  /**
   * Download a file from OneDrive (cloud.download_file).
   */
  private async handleDownloadFile(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const fileId = payload['fileId'] as string;
    const localPath = payload['localPath'] as string;

    // Graph API returns a redirect to the download URL
    const response = await globalThis.fetch(`${GRAPH_BASE}/me/drive/items/${fileId}/content`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: 'follow',
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
   * Get file metadata (cloud.file_metadata).
   */
  private async handleFileMetadata(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const fileId = payload['fileId'] as string;

    const response = await globalThis.fetch(`${GRAPH_BASE}/me/drive/items/${fileId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'METADATA_FAILED', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const item = await response.json() as DriveItem;

    return {
      success: true,
      data: {
        id: item.id,
        name: item.name,
        isFolder: !!item.folder,
        sizeBytes: item.size,
        mimeType: item.file?.mimeType ?? null,
        createdTime: item.createdDateTime,
        modifiedTime: item.lastModifiedDateTime,
        webUrl: item.webUrl,
        childCount: item.folder?.childCount ?? null,
        sha1Hash: item.file?.hashes?.sha1Hash ?? null,
      },
    };
  }

  /**
   * Check if a file has changed since a given timestamp (cloud.check_changed).
   */
  private async handleCheckChanged(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const fileId = payload['fileId'] as string;
    const sinceTimestamp = payload['sinceTimestamp'] as string;

    const response = await globalThis.fetch(
      `${GRAPH_BASE}/me/drive/items/${fileId}?$select=lastModifiedDateTime`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'CHECK_CHANGED_FAILED', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as { lastModifiedDateTime: string };
    const remoteModified = new Date(data.lastModifiedDateTime).getTime();
    const sinceMs = new Date(sinceTimestamp).getTime();

    return {
      success: true,
      data: { changed: remoteModified > sinceMs },
    };
  }

  private driveItemToImportedItem(item: DriveItem): ImportedItem {
    const isFile = !!item.file;

    return {
      id: `od_${item.id}`,
      sourceType: 'productivity' as const,
      title: item.name,
      content: `OneDrive ${isFile ? 'file' : 'folder'}: "${item.name}". Size: ${item.size} bytes. Modified: ${item.lastModifiedDateTime}.${item.file ? ` Type: ${item.file.mimeType}.` : ''}${item.folder ? ` Contains ${item.folder.childCount} items.` : ''}`,
      timestamp: item.lastModifiedDateTime,
      metadata: {
        provider: 'onedrive',
        type: isFile ? 'file' : 'folder',
        itemId: item.id,
        name: item.name,
        sizeBytes: item.size,
        mimeType: item.file?.mimeType ?? null,
        webUrl: item.webUrl,
        createdTime: item.createdDateTime,
        parentPath: item.parentReference?.path ?? null,
        childCount: item.folder?.childCount ?? null,
        sha1Hash: item.file?.hashes?.sha1Hash ?? null,
      },
    };
  }
}
