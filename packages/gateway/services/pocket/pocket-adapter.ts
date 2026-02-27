/**
 * PocketAdapter — Gateway service adapter for the Pocket API v3.
 *
 * Does NOT extend BaseOAuthAdapter. Pocket uses a non-standard OAuth flow:
 *   1. POST /v3/oauth/request with consumer_key + redirect_uri to get a request_token
 *   2. Redirect user to authorization URL with request_token
 *   3. POST /v3/oauth/authorize with consumer_key + code to get access_token + username
 *
 * All Pocket API calls include X-Accept: application/json and consumer_key in the body.
 *
 * Implements ServiceAdapter directly.
 *
 * All HTTP calls use globalThis.fetch. No external HTTP libraries.
 */

import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from '../types.js';
import type { AdapterResult } from '../base-oauth-adapter.js';
import type { OAuthTokenManager } from '../oauth-token-manager.js';
import type { ImportedItem } from '@semblance/core/importers/types.js';
import { OAuthCallbackServer } from '../oauth-callback-server.js';
import { oauthClients } from '../../config/oauth-clients.js';

const PROVIDER_KEY = 'pocket';
const API_BASE = 'https://getpocket.com/v3';

/** Standard headers for all Pocket API requests. */
const POCKET_HEADERS = {
  'Content-Type': 'application/json',
  'X-Accept': 'application/json',
} as const;

interface PocketRequestTokenResponse {
  code: string;
  state?: string;
}

interface PocketAuthorizeResponse {
  access_token: string;
  username: string;
}

interface PocketArticle {
  item_id: string;
  resolved_id: string;
  given_title: string;
  resolved_title: string;
  given_url: string;
  resolved_url: string;
  excerpt: string;
  word_count: string;
  time_added: string;
  time_updated: string;
  time_read: string;
  time_favorited: string;
  status: string; // 0=unread, 1=archived, 2=deleted
  is_article: string;
  favorite: string;
  tags?: Record<string, { item_id: string; tag: string }>;
  authors?: Record<string, { author_id: string; name: string }>;
}

interface PocketGetResponse {
  status: number;
  complete: number;
  list: Record<string, PocketArticle>;
  since: number;
  error: string | null;
}

export class PocketAdapter implements ServiceAdapter {
  private tokenManager: OAuthTokenManager;
  private consumerKey: string;

  constructor(tokenManager: OAuthTokenManager) {
    this.tokenManager = tokenManager;
    this.consumerKey = oauthClients.pocket.clientId;
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
          return this.handleDisconnect();

        case 'connector.sync':
          return await this.handleSync(p);

        case 'connector.list_items':
          return await this.handleListItems(p);

        default:
          return {
            success: false,
            error: { code: 'UNKNOWN_ACTION', message: `PocketAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'POCKET_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Pocket's non-standard OAuth flow:
   * 1. Obtain a request token
   * 2. Redirect the user to authorize
   * 3. Exchange the request token for an access token
   */
  async performAuthFlow(): Promise<AdapterResult> {
    const callbackServer = new OAuthCallbackServer();
    const { callbackUrl } = await callbackServer.start();

    try {
      // Step 1: Obtain a request token
      const requestTokenResponse = await globalThis.fetch(`${API_BASE}/oauth/request`, {
        method: 'POST',
        headers: POCKET_HEADERS,
        body: JSON.stringify({
          consumer_key: this.consumerKey,
          redirect_uri: callbackUrl,
        }),
      });

      if (!requestTokenResponse.ok) {
        const errorText = await requestTokenResponse.text();
        return {
          success: false,
          error: { code: 'REQUEST_TOKEN_ERROR', message: `Failed to get request token: ${errorText}` },
        };
      }

      const requestTokenData = await requestTokenResponse.json() as PocketRequestTokenResponse;
      const requestToken = requestTokenData.code;

      // Step 2: The frontend opens:
      // https://getpocket.com/auth/authorize?request_token={token}&redirect_uri={callbackUrl}
      // We wait for the callback from the user's browser.
      await callbackServer.waitForCallback();

      // Step 3: Exchange request token for access token
      const authorizeResponse = await globalThis.fetch(`${API_BASE}/oauth/authorize`, {
        method: 'POST',
        headers: POCKET_HEADERS,
        body: JSON.stringify({
          consumer_key: this.consumerKey,
          code: requestToken,
        }),
      });

      if (!authorizeResponse.ok) {
        const errorText = await authorizeResponse.text();
        return {
          success: false,
          error: { code: 'TOKEN_ERROR', message: `Pocket authorization failed: ${errorText}` },
        };
      }

      const authorizeData = await authorizeResponse.json() as PocketAuthorizeResponse;

      // Store the access token. Pocket tokens don't expire.
      this.tokenManager.storeTokens({
        provider: PROVIDER_KEY,
        accessToken: authorizeData.access_token,
        refreshToken: '', // Pocket doesn't use refresh tokens
        expiresAt: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000, // 10 years
        scopes: 'read',
        userEmail: authorizeData.username,
      });

      return {
        success: true,
        data: {
          provider: PROVIDER_KEY,
          username: authorizeData.username,
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

  private handleAuthStatus(): AdapterResult {
    const hasTokens = this.tokenManager.hasValidTokens(PROVIDER_KEY);
    const username = this.tokenManager.getUserEmail(PROVIDER_KEY);
    return {
      success: true,
      data: { authenticated: hasTokens, username },
    };
  }

  private handleDisconnect(): AdapterResult {
    this.tokenManager.revokeTokens(PROVIDER_KEY);
    return { success: true, data: { disconnected: true } };
  }

  /**
   * Sync all saved articles from Pocket.
   * Uses POST /v3/get with state=all, detailType=complete, sort=newest.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = this.getAccessToken();
    const limit = (payload['limit'] as number) ?? 200;
    const since = payload['since'] as number | undefined;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    try {
      const body: Record<string, unknown> = {
        consumer_key: this.consumerKey,
        access_token: accessToken,
        state: 'all',
        detailType: 'complete',
        sort: 'newest',
        count: Math.min(limit, 5000),
      };

      if (since) {
        body['since'] = since;
      }

      const response = await globalThis.fetch(`${API_BASE}/get`, {
        method: 'POST',
        headers: POCKET_HEADERS,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as PocketGetResponse;

      if (data.error) {
        throw new Error(`Pocket API error: ${data.error}`);
      }

      const articles = Object.values(data.list);

      for (const article of articles) {
        if (items.length >= limit) break;
        items.push(this.articleToImportedItem(article));
      }
    } catch (err) {
      errors.push({ message: `Pocket sync: ${err instanceof Error ? err.message : String(err)}` });
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
   * List articles with offset-based pagination.
   */
  private async handleListItems(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = this.getAccessToken();
    const pageSize = (payload['pageSize'] as number) ?? 30;
    const offset = payload['pageToken'] ? parseInt(payload['pageToken'] as string, 10) : 0;

    const response = await globalThis.fetch(`${API_BASE}/get`, {
      method: 'POST',
      headers: POCKET_HEADERS,
      body: JSON.stringify({
        consumer_key: this.consumerKey,
        access_token: accessToken,
        state: 'all',
        detailType: 'complete',
        sort: 'newest',
        count: pageSize,
        offset,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'POCKET_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as PocketGetResponse;
    const articles = Object.values(data.list);
    const items = articles.map((a) => this.articleToImportedItem(a));
    const nextOffset = articles.length === pageSize ? String(offset + articles.length) : null;

    return {
      success: true,
      data: {
        items,
        nextPageToken: nextOffset,
      },
    };
  }

  private articleToImportedItem(article: PocketArticle): ImportedItem {
    const title = article.resolved_title || article.given_title || 'Untitled';
    const url = article.resolved_url || article.given_url;
    const tags = article.tags ? Object.values(article.tags).map(t => t.tag) : [];
    const authors = article.authors ? Object.values(article.authors).map(a => a.name) : [];
    const statusLabel = article.status === '0' ? 'unread' : article.status === '1' ? 'archived' : 'deleted';

    return {
      id: `pkt_${article.item_id}`,
      sourceType: 'research' as const,
      title,
      content: `"${title}"${article.excerpt ? `: ${article.excerpt}` : ''}. URL: ${url}. Status: ${statusLabel}. Words: ${article.word_count}.${authors.length > 0 ? ` Authors: ${authors.join(', ')}.` : ''}`,
      timestamp: new Date(parseInt(article.time_added, 10) * 1000).toISOString(),
      metadata: {
        provider: 'pocket',
        type: 'article',
        itemId: article.item_id,
        url,
        status: statusLabel,
        favorite: article.favorite === '1',
        wordCount: parseInt(article.word_count, 10),
        tags,
        authors,
        timeRead: article.time_read !== '0' ? new Date(parseInt(article.time_read, 10) * 1000).toISOString() : null,
      },
    };
  }

  /**
   * Get the stored access token. Throws if not authenticated.
   */
  private getAccessToken(): string {
    const token = this.tokenManager.getAccessToken(PROVIDER_KEY);
    if (!token) {
      throw new Error('Not authenticated with Pocket. Use connector.auth to connect.');
    }
    return token;
  }
}
