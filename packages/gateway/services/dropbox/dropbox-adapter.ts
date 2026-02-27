/**
 * DropboxAdapter — Gateway service adapter for the Dropbox API v2.
 *
 * Extends BaseOAuthAdapter (standard OAuth 2.0 — NOT PKCE).
 * Handles OAuth authentication, token management, file listing, and sync.
 *
 * IMPORTANT: Dropbox API uses POST for most endpoints, including
 * get_current_account (with empty body) and list_folder.
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

const DROPBOX_SCOPES = 'files.metadata.read files.content.read';

/** Dropbox API base URL */
const API_BASE = 'https://api.dropboxapi.com/2';
/** Dropbox content API base (for file downloads) */
const CONTENT_BASE = 'https://content.dropboxapi.com/2';

/** Build the OAuthConfig for Dropbox. */
export function getDropboxOAuthConfig(): OAuthConfig {
  return {
    providerKey: 'dropbox',
    authUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/2/oauth2/token',
    scopes: DROPBOX_SCOPES,
    usePKCE: false,
    clientId: oauthClients.dropbox.clientId,
    clientSecret: oauthClients.dropbox.clientSecret,
    revokeUrl: 'https://api.dropboxapi.com/2/auth/token/revoke',
    extraAuthParams: {
      token_access_type: 'offline',
    },
  };
}

interface DropboxAccount {
  account_id: string;
  name: { display_name: string; given_name: string; surname: string };
  email: string;
  email_verified: boolean;
}

interface DropboxFileMetadata {
  '.tag': 'file';
  id: string;
  name: string;
  path_lower: string;
  path_display: string;
  size: number;
  server_modified: string;
  client_modified: string;
  content_hash?: string;
  is_downloadable: boolean;
}

interface DropboxFolderMetadata {
  '.tag': 'folder';
  id: string;
  name: string;
  path_lower: string;
  path_display: string;
}

type DropboxEntry = DropboxFileMetadata | DropboxFolderMetadata;

interface DropboxListFolderResponse {
  entries: DropboxEntry[];
  cursor: string;
  has_more: boolean;
}

export class DropboxAdapter extends BaseOAuthAdapter {
  constructor(tokenManager: OAuthTokenManager) {
    super(tokenManager, getDropboxOAuthConfig());
  }

  /**
   * Override disconnect to use Dropbox's POST-based token revocation.
   * Dropbox requires a POST to /2/auth/token/revoke with the bearer token.
   */
  async performDisconnect(): Promise<AdapterResult> {
    const accessToken = this.tokenManager.getAccessToken(this.config.providerKey);
    if (accessToken) {
      try {
        await globalThis.fetch(`${API_BASE}/auth/token/revoke`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        // Revocation is best-effort
      }
    }
    this.tokenManager.revokeTokens(this.config.providerKey);
    return { success: true, data: { disconnected: true } };
  }

  protected async getUserInfo(accessToken: string): Promise<{ email?: string; displayName?: string }> {
    // Dropbox uses POST with empty body for get_current_account
    const response = await globalThis.fetch(`${API_BASE}/users/get_current_account`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: 'null',
    });

    if (!response.ok) {
      throw new Error(`Dropbox user info failed: HTTP ${response.status}`);
    }

    const account = await response.json() as DropboxAccount;
    return {
      email: account.email,
      displayName: account.name.display_name,
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

        default:
          return {
            success: false,
            error: { code: 'UNKNOWN_ACTION', message: `DropboxAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'DROPBOX_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Sync files from the Dropbox root folder.
   * Returns ImportedItem[] for the knowledge graph pipeline.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const limit = (payload['limit'] as number) ?? 100;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    try {
      let hasMore = true;
      let cursor: string | undefined;

      // Initial request
      const initialResponse = await globalThis.fetch(`${API_BASE}/files/list_folder`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: '',
          recursive: true,
          include_media_info: false,
          include_deleted: false,
          limit: Math.min(limit, 2000),
        }),
      });

      if (!initialResponse.ok) {
        throw new Error(`HTTP ${initialResponse.status}: ${initialResponse.statusText}`);
      }

      let data = await initialResponse.json() as DropboxListFolderResponse;
      items.push(...this.entriesToImportedItems(data.entries));
      hasMore = data.has_more;
      cursor = data.cursor;

      // Continue pagination
      while (hasMore && items.length < limit && cursor) {
        const continueResponse = await globalThis.fetch(`${API_BASE}/files/list_folder/continue`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ cursor }),
        });

        if (!continueResponse.ok) {
          throw new Error(`HTTP ${continueResponse.status}: ${continueResponse.statusText}`);
        }

        data = await continueResponse.json() as DropboxListFolderResponse;
        items.push(...this.entriesToImportedItems(data.entries));
        hasMore = data.has_more;
        cursor = data.cursor;
      }
    } catch (err) {
      errors.push({ message: `List folder: ${err instanceof Error ? err.message : String(err)}` });
    }

    return {
      success: true,
      data: {
        items: items.slice(0, limit),
        totalItems: Math.min(items.length, limit),
        errors,
      },
    };
  }

  /**
   * List files in a folder with pagination (connector.list_items).
   */
  private async handleListItems(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const pageSize = (payload['pageSize'] as number) ?? 100;
    const cursor = payload['pageToken'] as string | undefined;

    let response: Response;

    if (cursor) {
      // Continue from cursor
      response = await globalThis.fetch(`${API_BASE}/files/list_folder/continue`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cursor }),
      });
    } else {
      // Initial request
      response = await globalThis.fetch(`${API_BASE}/files/list_folder`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: '',
          recursive: false,
          include_media_info: false,
          include_deleted: false,
          limit: Math.min(pageSize, 2000),
        }),
      });
    }

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'DROPBOX_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as DropboxListFolderResponse;
    const items = this.entriesToImportedItems(data.entries);

    return {
      success: true,
      data: {
        items,
        nextPageToken: data.has_more ? data.cursor : null,
      },
    };
  }

  /**
   * List files in a folder (cloud.list_files).
   */
  private async handleListFiles(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const folderPath = (payload['folderId'] as string) ?? '';
    const pageSize = (payload['pageSize'] as number) ?? 100;
    const cursor = payload['pageToken'] as string | undefined;

    let response: Response;

    if (cursor) {
      response = await globalThis.fetch(`${API_BASE}/files/list_folder/continue`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cursor }),
      });
    } else {
      response = await globalThis.fetch(`${API_BASE}/files/list_folder`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: folderPath,
          recursive: false,
          include_media_info: false,
          include_deleted: false,
          limit: Math.min(pageSize, 2000),
        }),
      });
    }

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'DROPBOX_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as DropboxListFolderResponse;

    const files = data.entries.map((entry) => {
      const isFile = entry['.tag'] === 'file';
      const fileEntry = isFile ? entry as DropboxFileMetadata : null;
      return {
        id: entry.id,
        name: entry.name,
        pathDisplay: entry.path_display,
        pathLower: entry.path_lower,
        isFolder: entry['.tag'] === 'folder',
        sizeBytes: fileEntry?.size ?? 0,
        serverModified: fileEntry?.server_modified ?? null,
        clientModified: fileEntry?.client_modified ?? null,
        contentHash: fileEntry?.content_hash ?? null,
      };
    });

    return {
      success: true,
      data: {
        files,
        nextPageToken: data.has_more ? data.cursor : null,
        totalFiles: files.length,
      },
    };
  }

  /**
   * Download a file from Dropbox (cloud.download_file).
   */
  private async handleDownloadFile(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const filePath = payload['fileId'] as string;
    const localPath = payload['localPath'] as string;

    const response = await globalThis.fetch(`${CONTENT_BASE}/files/download`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({ path: filePath }),
      },
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
    const filePath = payload['fileId'] as string;

    const response = await globalThis.fetch(`${API_BASE}/files/get_metadata`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: filePath,
        include_media_info: false,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'METADATA_FAILED', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const entry = await response.json() as DropboxEntry;
    const isFile = entry['.tag'] === 'file';
    const fileEntry = isFile ? entry as DropboxFileMetadata : null;

    return {
      success: true,
      data: {
        id: entry.id,
        name: entry.name,
        pathDisplay: entry.path_display,
        pathLower: entry.path_lower,
        isFolder: entry['.tag'] === 'folder',
        sizeBytes: fileEntry?.size ?? 0,
        serverModified: fileEntry?.server_modified ?? null,
        clientModified: fileEntry?.client_modified ?? null,
        contentHash: fileEntry?.content_hash ?? null,
      },
    };
  }

  private entriesToImportedItems(entries: DropboxEntry[]): ImportedItem[] {
    return entries.map((entry) => {
      const isFile = entry['.tag'] === 'file';
      const fileEntry = isFile ? entry as DropboxFileMetadata : null;

      return {
        id: `dbx_${entry.id.replace(/^id:/, '')}`,
        sourceType: 'productivity' as const,
        title: entry.name,
        content: `Dropbox ${isFile ? 'file' : 'folder'}: "${entry.path_display}"${fileEntry ? `. Size: ${fileEntry.size} bytes. Modified: ${fileEntry.server_modified}` : ''}`,
        timestamp: fileEntry?.server_modified ?? new Date().toISOString(),
        metadata: {
          provider: 'dropbox',
          type: isFile ? 'file' : 'folder',
          entryId: entry.id,
          pathDisplay: entry.path_display,
          pathLower: entry.path_lower,
          sizeBytes: fileEntry?.size ?? 0,
          serverModified: fileEntry?.server_modified ?? null,
          contentHash: fileEntry?.content_hash ?? null,
        },
      };
    });
  }
}
