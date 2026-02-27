/**
 * NotionAdapter — Gateway service adapter for the Notion API.
 *
 * Extends BaseOAuthAdapter (standard OAuth 2.0 — NOT PKCE).
 * Notion uses Integration capabilities instead of scopes.
 *
 * IMPORTANT: Notion's token exchange requires Basic auth
 * (base64(client_id:client_secret)) in the Authorization header
 * instead of sending client_id/client_secret in the request body.
 *
 * IMPORTANT: All Notion API calls require the Notion-Version header.
 *
 * All HTTP calls use globalThis.fetch. No external HTTP libraries.
 */

import type { ActionType } from '@semblance/core';
import type { OAuthTokenManager } from '../oauth-token-manager.js';
import type { OAuthConfig } from '../oauth-config.js';
import type { AdapterResult } from '../base-oauth-adapter.js';
import type { ImportedItem } from '@semblance/core/importers/types.js';
import { BaseOAuthAdapter } from '../base-oauth-adapter.js';
import { OAuthCallbackServer } from '../oauth-callback-server.js';
import { oauthClients } from '../../config/oauth-clients.js';

const NOTION_VERSION = '2022-06-28';

/** Build the OAuthConfig for Notion. */
export function getNotionOAuthConfig(): OAuthConfig {
  return {
    providerKey: 'notion',
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scopes: '', // Notion uses Integration capabilities, not scopes
    usePKCE: false,
    clientId: oauthClients.notion.clientId,
    clientSecret: oauthClients.notion.clientSecret,
    extraAuthParams: {
      owner: 'user',
    },
  };
}

interface NotionUser {
  object: 'user';
  id: string;
  name: string | null;
  type: string;
  person?: {
    email?: string;
  };
}

interface NotionTokenResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_name: string;
  workspace_icon: string | null;
  workspace_id: string;
  owner: {
    type: string;
    user: NotionUser;
  };
  duplicated_template_id: string | null;
  request_id: string;
  error?: string;
}

interface NotionPage {
  object: 'page';
  id: string;
  created_time: string;
  last_edited_time: string;
  url: string;
  properties: Record<string, NotionProperty>;
  parent: { type: string; database_id?: string; page_id?: string; workspace?: boolean };
}

interface NotionDatabase {
  object: 'database';
  id: string;
  created_time: string;
  last_edited_time: string;
  url: string;
  title: Array<{ plain_text: string }>;
  description: Array<{ plain_text: string }>;
}

interface NotionProperty {
  type: string;
  title?: Array<{ plain_text: string }>;
  rich_text?: Array<{ plain_text: string }>;
  [key: string]: unknown;
}

interface NotionSearchResponse {
  object: 'list';
  results: Array<NotionPage | NotionDatabase>;
  next_cursor: string | null;
  has_more: boolean;
}

export class NotionAdapter extends BaseOAuthAdapter {
  constructor(tokenManager: OAuthTokenManager) {
    super(tokenManager, getNotionOAuthConfig());
  }

  /**
   * Override the entire auth flow because Notion's token exchange uses
   * Basic auth (base64(client_id:client_secret)) in the Authorization header
   * instead of client_id/client_secret in the body. Also, user info comes
   * from the token response itself (owner.user).
   */
  async performAuthFlow(): Promise<AdapterResult> {
    const callbackServer = new OAuthCallbackServer();
    const { callbackUrl, state } = await callbackServer.start();

    const authUrl = new URL(this.config.authUrl);
    authUrl.searchParams.set('client_id', this.config.clientId);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('owner', 'user');

    try {
      const { code } = await callbackServer.waitForCallback();

      // Notion requires Basic auth for token exchange
      const basicAuth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret ?? ''}`).toString('base64');

      const tokenResponse = await globalThis.fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${basicAuth}`,
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          redirect_uri: callbackUrl,
        }),
      });

      const tokenData = await tokenResponse.json() as NotionTokenResponse;

      if (tokenData.error || !tokenData.access_token) {
        return {
          success: false,
          error: {
            code: 'TOKEN_ERROR',
            message: tokenData.error ?? 'Notion token exchange failed',
          },
        };
      }

      // Notion access tokens don't expire and there's no refresh token.
      // Set a very long expiry.
      const userEmail = tokenData.owner?.user?.person?.email;
      const displayName = tokenData.owner?.user?.name;

      this.tokenManager.storeTokens({
        provider: this.config.providerKey,
        accessToken: tokenData.access_token,
        refreshToken: '', // Notion doesn't issue refresh tokens
        expiresAt: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
        scopes: this.config.scopes,
        userEmail,
      });

      return {
        success: true,
        data: {
          provider: this.config.providerKey,
          userEmail,
          displayName,
          workspaceName: tokenData.workspace_name,
          workspaceId: tokenData.workspace_id,
        },
      };
    } catch (err) {
      callbackServer.stop();
      return {
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  protected async getUserInfo(accessToken: string): Promise<{ email?: string; displayName?: string }> {
    // Notion doesn't have a dedicated /me endpoint for user info after initial auth.
    // User info is typically obtained from the token exchange response.
    // For refresh scenarios, try to get bot info from /v1/users/me
    const response = await globalThis.fetch('https://api.notion.com/v1/users/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Notion-Version': NOTION_VERSION,
      },
    });

    if (!response.ok) {
      return {};
    }

    const user = await response.json() as NotionUser;
    return {
      email: user.person?.email,
      displayName: user.name ?? undefined,
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

        default:
          return {
            success: false,
            error: { code: 'UNKNOWN_ACTION', message: `NotionAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'NOTION_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Sync all pages and databases from Notion.
   * Uses POST /v1/search with pagination.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const limit = (payload['limit'] as number) ?? 100;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    try {
      let hasMore = true;
      let startCursor: string | undefined;

      while (hasMore && items.length < limit) {
        const body: Record<string, unknown> = {
          page_size: Math.min(limit - items.length, 100),
        };

        if (startCursor) {
          body['start_cursor'] = startCursor;
        }

        const response = await globalThis.fetch('https://api.notion.com/v1/search', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Notion-Version': NOTION_VERSION,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json() as NotionSearchResponse;

        for (const result of data.results) {
          if (items.length >= limit) break;

          if (result.object === 'page') {
            items.push(this.pageToImportedItem(result as NotionPage));
          } else if (result.object === 'database') {
            items.push(this.databaseToImportedItem(result as NotionDatabase));
          }
        }

        hasMore = data.has_more;
        startCursor = data.next_cursor ?? undefined;
      }
    } catch (err) {
      errors.push({ message: `Search: ${err instanceof Error ? err.message : String(err)}` });
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
   * List items with pagination (used by connector.list_items).
   */
  private async handleListItems(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const pageSize = (payload['pageSize'] as number) ?? 100;
    const startCursor = payload['pageToken'] as string | undefined;

    const body: Record<string, unknown> = {
      page_size: Math.min(pageSize, 100),
    };

    if (startCursor) {
      body['start_cursor'] = startCursor;
    }

    const response = await globalThis.fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'NOTION_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as NotionSearchResponse;

    const items: ImportedItem[] = [];
    for (const result of data.results) {
      if (result.object === 'page') {
        items.push(this.pageToImportedItem(result as NotionPage));
      } else if (result.object === 'database') {
        items.push(this.databaseToImportedItem(result as NotionDatabase));
      }
    }

    return {
      success: true,
      data: {
        items,
        nextPageToken: data.has_more ? data.next_cursor : null,
      },
    };
  }

  private pageToImportedItem(page: NotionPage): ImportedItem {
    // Extract title from properties
    let title = 'Untitled';
    for (const prop of Object.values(page.properties)) {
      if (prop.type === 'title' && prop.title && prop.title.length > 0) {
        title = prop.title.map(t => t.plain_text).join('');
        break;
      }
    }

    return {
      id: `ntn_page_${page.id.replace(/-/g, '')}`,
      sourceType: 'notes' as const,
      title,
      content: `Notion page: "${title}". Last edited: ${page.last_edited_time}.`,
      timestamp: page.last_edited_time,
      metadata: {
        provider: 'notion',
        type: 'page',
        pageId: page.id,
        url: page.url,
        parentType: page.parent.type,
        parentId: page.parent.database_id ?? page.parent.page_id ?? null,
        createdTime: page.created_time,
      },
    };
  }

  private databaseToImportedItem(db: NotionDatabase): ImportedItem {
    const title = db.title.map(t => t.plain_text).join('') || 'Untitled Database';
    const description = db.description.map(t => t.plain_text).join('');

    return {
      id: `ntn_db_${db.id.replace(/-/g, '')}`,
      sourceType: 'notes' as const,
      title,
      content: `Notion database: "${title}"${description ? `. ${description}` : ''}. Last edited: ${db.last_edited_time}.`,
      timestamp: db.last_edited_time,
      metadata: {
        provider: 'notion',
        type: 'database',
        databaseId: db.id,
        url: db.url,
        description,
        createdTime: db.created_time,
      },
    };
  }
}
