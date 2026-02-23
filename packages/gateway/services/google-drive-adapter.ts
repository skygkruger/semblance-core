// GoogleDriveAdapter — Gateway service adapter for Google Drive API v3.
// Direct REST calls (no googleapis library). Read-only access only.
// CRITICAL: OAuth scope MUST be drive.readonly — never write scope.

import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from './types.js';
import type { OAuthTokenManager } from './oauth-token-manager.js';
import { OAuthCallbackServer } from './oauth-callback-server.js';

export const GOOGLE_DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

// Google Workspace export MIME types
const WORKSPACE_EXPORT_MAP: Record<string, { mimeType: string; extension: string }> = {
  'application/vnd.google-apps.document': { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: '.docx' },
  'application/vnd.google-apps.spreadsheet': { mimeType: 'text/csv', extension: '.csv' },
  'application/vnd.google-apps.presentation': { mimeType: 'application/pdf', extension: '.pdf' },
};

export interface GoogleDriveConfig {
  clientId: string;
  clientSecret: string;
}

export class GoogleDriveAdapter implements ServiceAdapter {
  private tokenManager: OAuthTokenManager;
  private config: GoogleDriveConfig;

  constructor(tokenManager: OAuthTokenManager, config: GoogleDriveConfig) {
    this.tokenManager = tokenManager;
    this.config = config;
  }

  async execute(action: ActionType, payload: unknown): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const p = payload as Record<string, unknown>;

    try {
      switch (action) {
        case 'cloud.auth':
          return await this.handleAuth();

        case 'cloud.auth_status':
          return this.handleAuthStatus();

        case 'cloud.disconnect':
          return await this.handleDisconnect();

        case 'cloud.list_files':
          return await this.handleListFiles(p);

        case 'cloud.file_metadata':
          return await this.handleFileMetadata(p);

        case 'cloud.download_file':
          return await this.handleDownloadFile(p);

        case 'cloud.check_changed':
          return await this.handleCheckChanged(p);

        default:
          return { success: false, error: { code: 'UNKNOWN_ACTION', message: `Unknown action: ${action}` } };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'DRIVE_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  private async handleAuth(): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }> {
    const callbackServer = new OAuthCallbackServer();
    const { callbackUrl, state } = await callbackServer.start();

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', this.config.clientId);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', GOOGLE_DRIVE_READONLY_SCOPE);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    // TODO: Sprint 4 — Open authUrl in the user's browser via Tauri shell plugin
    // For now, return the auth URL for the frontend to open

    try {
      const { code } = await callbackServer.waitForCallback();

      // Exchange code for tokens
      const tokenResponse = await globalThis.fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: callbackUrl,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenResponse.json() as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
        error?: string;
      };

      if (tokenData.error) {
        return { success: false, error: { code: 'TOKEN_ERROR', message: tokenData.error } };
      }

      // Get user info
      const userResponse = await globalThis.fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userResponse.json() as { user?: { emailAddress?: string } };

      this.tokenManager.storeTokens({
        provider: 'google_drive',
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + tokenData.expires_in * 1000,
        scopes: GOOGLE_DRIVE_READONLY_SCOPE,
        userEmail: userData.user?.emailAddress,
      });

      return {
        success: true,
        data: {
          success: true,
          provider: 'google_drive',
          userEmail: userData.user?.emailAddress,
        },
      };
    } catch (err) {
      callbackServer.stop();
      return {
        success: false,
        error: { code: 'AUTH_ERROR', message: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  private handleAuthStatus(): { success: boolean; data?: unknown } {
    const hasTokens = this.tokenManager.hasValidTokens('google_drive');
    const email = this.tokenManager.getUserEmail('google_drive');
    return {
      success: true,
      data: { authenticated: hasTokens, userEmail: email },
    };
  }

  private async handleDisconnect(): Promise<{ success: boolean; data?: unknown }> {
    const accessToken = this.tokenManager.getAccessToken('google_drive');
    if (accessToken) {
      // Attempt to revoke the token (best-effort)
      try {
        await globalThis.fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
          method: 'POST',
        });
      } catch {
        // Revocation is best-effort
      }
    }
    this.tokenManager.revokeTokens('google_drive');
    return { success: true, data: { disconnected: true } };
  }

  private async handleListFiles(payload: Record<string, unknown>): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const accessToken = await this.getValidAccessToken();
    const folderId = (payload['folderId'] as string) || 'root';
    const pageSize = (payload['pageSize'] as number) || 100;
    const pageToken = payload['pageToken'] as string | undefined;

    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${folderId}' in parents and trashed = false`);
    url.searchParams.set('pageSize', String(pageSize));
    url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,parents,md5Checksum,webViewLink)');
    url.searchParams.set('orderBy', 'modifiedTime desc');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json() as {
      files: Array<{
        id: string;
        name: string;
        mimeType: string;
        size?: string;
        modifiedTime: string;
        createdTime: string;
        parents?: string[];
        md5Checksum?: string;
        webViewLink?: string;
      }>;
      nextPageToken?: string;
    };

    const files = data.files.map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      sizeBytes: parseInt(f.size ?? '0', 10),
      modifiedTime: f.modifiedTime,
      createdTime: f.createdTime,
      parentId: f.parents?.[0] ?? null,
      md5Checksum: f.md5Checksum ?? null,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
      webViewLink: f.webViewLink,
    }));

    return {
      success: true,
      data: { files, nextPageToken: data.nextPageToken ?? null, totalFiles: files.length },
    };
  }

  private async handleFileMetadata(payload: Record<string, unknown>): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const accessToken = await this.getValidAccessToken();
    const fileId = payload['fileId'] as string;

    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,modifiedTime,createdTime,parents,md5Checksum,webViewLink`;
    const response = await globalThis.fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const f = await response.json() as {
      id: string;
      name: string;
      mimeType: string;
      size?: string;
      modifiedTime: string;
      createdTime: string;
      parents?: string[];
      md5Checksum?: string;
      webViewLink?: string;
    };

    return {
      success: true,
      data: {
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        sizeBytes: parseInt(f.size ?? '0', 10),
        modifiedTime: f.modifiedTime,
        createdTime: f.createdTime,
        parentId: f.parents?.[0] ?? null,
        md5Checksum: f.md5Checksum ?? null,
        isFolder: f.mimeType === 'application/vnd.google-apps.folder',
        webViewLink: f.webViewLink,
      },
    };
  }

  private async handleDownloadFile(payload: Record<string, unknown>): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const accessToken = await this.getValidAccessToken();
    const fileId = payload['fileId'] as string;
    const localPath = payload['localPath'] as string;

    // Check if it's a Google Workspace file that needs export
    const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name,size`;
    const metaResponse = await globalThis.fetch(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meta = await metaResponse.json() as { mimeType: string; name: string; size?: string };

    let downloadUrl: string;
    let finalMimeType = meta.mimeType;

    const exportInfo = WORKSPACE_EXPORT_MAP[meta.mimeType];
    if (exportInfo) {
      // Google Workspace file — use export endpoint
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportInfo.mimeType)}`;
      finalMimeType = exportInfo.mimeType;
    } else {
      // Regular file — direct download
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    }

    const downloadResponse = await globalThis.fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!downloadResponse.ok) {
      return {
        success: false,
        error: { code: 'DOWNLOAD_FAILED', message: `HTTP ${downloadResponse.status}` },
      };
    }

    const buffer = Buffer.from(await downloadResponse.arrayBuffer());

    // Write to localPath — caller is responsible for ensuring directory exists
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
        success: true,
        localPath,
        sizeBytes: buffer.length,
        mimeType: finalMimeType,
      },
    };
  }

  private async handleCheckChanged(payload: Record<string, unknown>): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const accessToken = await this.getValidAccessToken();
    const fileId = payload['fileId'] as string;
    const sinceTimestamp = payload['sinceTimestamp'] as string;

    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=modifiedTime`;
    const response = await globalThis.fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json() as { modifiedTime: string };

    const remoteModified = new Date(data.modifiedTime).getTime();
    const sinceMs = new Date(sinceTimestamp).getTime();

    return {
      success: true,
      data: { changed: remoteModified > sinceMs },
    };
  }

  private async getValidAccessToken(): Promise<string> {
    if (!this.tokenManager.isTokenExpired('google_drive')) {
      const token = this.tokenManager.getAccessToken('google_drive');
      if (token) return token;
    }

    // Token expired or missing — try to refresh
    const refreshToken = this.tokenManager.getRefreshToken('google_drive');
    if (!refreshToken) {
      throw new Error('Not authenticated with Google Drive');
    }

    const response = await globalThis.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    const data = await response.json() as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };

    this.tokenManager.refreshAccessToken(
      'google_drive',
      data.access_token,
      Date.now() + data.expires_in * 1000,
      data.refresh_token,
    );

    return data.access_token;
  }

  /** Get the workspace export map (for testing) */
  static getWorkspaceExportMap(): Record<string, { mimeType: string; extension: string }> {
    return { ...WORKSPACE_EXPORT_MAP };
  }
}
