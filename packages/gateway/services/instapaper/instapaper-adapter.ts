/**
 * InstapaperAdapter — Gateway service adapter for the Instapaper Full API.
 *
 * Does NOT extend BaseOAuthAdapter. Instapaper uses OAuth 1.0a with xAuth flow:
 *   - No request token step. Direct POST to /oauth/access_token with
 *     x_auth_username, x_auth_password, x_auth_mode=client_auth.
 *   - All subsequent API calls are signed with OAuth 1.0a HMAC-SHA1.
 *
 * Uses oauth1-signer.ts for signature generation.
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
import { generateOAuth1Header } from '../oauth1-signer.js';
import type { OAuth1Credentials } from '../oauth1-signer.js';
import { oauthClients } from '../../config/oauth-clients.js';

const PROVIDER_KEY = 'instapaper';
const API_BASE = 'https://www.instapaper.com/api/1';

interface InstapaperBookmark {
  bookmark_id: number;
  title: string;
  url: string;
  description: string;
  time: number; // Unix timestamp
  progress: number;
  progress_timestamp: number;
  type: string;
  starred: string; // "0" or "1"
  hash: string;
}

interface InstapaperBookmarkListItem {
  type: 'bookmark' | 'meta' | 'user';
  bookmark_id?: number;
  title?: string;
  url?: string;
  description?: string;
  time?: number;
  progress?: number;
  progress_timestamp?: number;
  starred?: string;
  hash?: string;
}

interface InstapaperHighlight {
  highlight_id: number;
  text: string;
  note: string | null;
  time: number;
  position: number;
  bookmark_id: number;
  type: string;
}

export class InstapaperAdapter implements ServiceAdapter {
  private tokenManager: OAuthTokenManager;
  private consumerKey: string;
  private consumerSecret: string;

  constructor(tokenManager: OAuthTokenManager) {
    this.tokenManager = tokenManager;
    this.consumerKey = oauthClients.instapaper.consumerKey;
    this.consumerSecret = oauthClients.instapaper.consumerSecret ?? '';
  }

  async execute(action: ActionType, payload: unknown): Promise<AdapterResult> {
    const p = payload as Record<string, unknown>;

    try {
      switch (action) {
        case 'connector.auth':
          return await this.handleAuth(p);

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
            error: { code: 'UNKNOWN_ACTION', message: `InstapaperAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'INSTAPAPER_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * xAuth flow: directly exchange username/password for an OAuth token.
   * No request token step — simpler than full OAuth 1.0a.
   */
  private async handleAuth(payload: Record<string, unknown>): Promise<AdapterResult> {
    const username = payload['username'] as string | undefined;
    const password = payload['password'] as string | undefined;

    if (!username) {
      return {
        success: false,
        error: { code: 'MISSING_USERNAME', message: 'payload.username is required for Instapaper xAuth' },
      };
    }

    const url = `${API_BASE}/oauth/access_token`;
    const extraParams: Record<string, string> = {
      x_auth_username: username,
      x_auth_password: password ?? '',
      x_auth_mode: 'client_auth',
    };

    const credentials: OAuth1Credentials = {
      consumerKey: this.consumerKey,
      consumerSecret: this.consumerSecret,
    };

    const authHeader = generateOAuth1Header(credentials, {
      method: 'POST',
      url,
      extraParams,
    });

    const response = await globalThis.fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(extraParams),
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'AUTH_FAILED', message: `Instapaper xAuth failed: HTTP ${response.status}` },
      };
    }

    // Instapaper returns URL-encoded: oauth_token=xxx&oauth_token_secret=yyy
    const responseText = await response.text();
    const params = new URLSearchParams(responseText);
    const oauthToken = params.get('oauth_token');
    const oauthTokenSecret = params.get('oauth_token_secret');

    if (!oauthToken || !oauthTokenSecret) {
      return {
        success: false,
        error: { code: 'TOKEN_ERROR', message: 'Failed to parse OAuth token from Instapaper response' },
      };
    }

    // Store both token and token_secret. We use accessToken for the token
    // and refreshToken field for the token_secret (since we need both for signing).
    this.tokenManager.storeTokens({
      provider: PROVIDER_KEY,
      accessToken: oauthToken,
      refreshToken: oauthTokenSecret, // Repurposed: stores OAuth 1.0a token_secret
      expiresAt: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000, // Instapaper tokens don't expire
      scopes: 'read',
      userEmail: username,
    });

    return {
      success: true,
      data: {
        provider: PROVIDER_KEY,
        username,
      },
    };
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
   * Sync bookmarks and highlights from Instapaper.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const limit = (payload['limit'] as number) ?? 500;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    // 1. Fetch bookmarks
    try {
      const bookmarkItems = await this.fetchBookmarks(limit);
      items.push(...bookmarkItems);
    } catch (err) {
      errors.push({ message: `Bookmarks: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 2. Fetch highlights for each bookmark (up to limit)
    try {
      const highlightItems = await this.fetchHighlights(items.slice(0, Math.min(items.length, 50)));
      items.push(...highlightItems);
    } catch (err) {
      errors.push({ message: `Highlights: ${err instanceof Error ? err.message : String(err)}` });
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
   * List bookmarks with pagination.
   */
  private async handleListItems(payload: Record<string, unknown>): Promise<AdapterResult> {
    const pageSize = (payload['pageSize'] as number) ?? 25;
    const folderId = (payload['folderId'] as string) ?? 'unread';
    const haveParam = payload['pageToken'] as string | undefined;

    const url = `${API_BASE}/bookmarks/list`;
    const extraParams: Record<string, string> = {
      limit: String(Math.min(pageSize, 500)),
      folder_id: folderId,
    };

    if (haveParam) {
      extraParams['have'] = haveParam;
    }

    const response = await this.makeSignedRequest('POST', url, extraParams);

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'INSTAPAPER_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as InstapaperBookmarkListItem[];
    const bookmarks = data.filter((item): item is InstapaperBookmarkListItem & { type: 'bookmark' } => item.type === 'bookmark');

    const items = bookmarks.map((b) => this.bookmarkItemToImportedItem(b));
    const lastBookmarkId = bookmarks.length > 0 ? String(bookmarks[bookmarks.length - 1]!.bookmark_id) : null;
    const nextPageToken = bookmarks.length === pageSize ? lastBookmarkId : null;

    return {
      success: true,
      data: {
        items,
        nextPageToken,
      },
    };
  }

  private async fetchBookmarks(limit: number): Promise<ImportedItem[]> {
    const url = `${API_BASE}/bookmarks/list`;
    const extraParams: Record<string, string> = {
      limit: String(Math.min(limit, 500)),
    };

    const response = await this.makeSignedRequest('POST', url, extraParams);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as InstapaperBookmarkListItem[];
    const bookmarks = data.filter((item): item is InstapaperBookmarkListItem & { type: 'bookmark' } => item.type === 'bookmark');

    return bookmarks.map((b) => this.bookmarkItemToImportedItem(b));
  }

  private async fetchHighlights(bookmarkItems: ImportedItem[]): Promise<ImportedItem[]> {
    const items: ImportedItem[] = [];

    for (const bookmark of bookmarkItems) {
      const bookmarkId = (bookmark.metadata as Record<string, unknown>)['bookmarkId'] as number | undefined;
      if (!bookmarkId) continue;

      try {
        const url = `${API_BASE}/bookmarks/${bookmarkId}/highlights`;
        const response = await this.makeSignedRequest('GET', url);

        if (!response.ok) continue;

        const highlights = await response.json() as InstapaperHighlight[];

        for (const highlight of highlights) {
          items.push({
            id: `ip_highlight_${highlight.highlight_id}`,
            sourceType: 'research' as const,
            title: `Highlight: ${highlight.text.slice(0, 80)}${highlight.text.length > 80 ? '...' : ''}`,
            content: highlight.text + (highlight.note ? `\n\nNote: ${highlight.note}` : ''),
            timestamp: new Date(highlight.time * 1000).toISOString(),
            metadata: {
              provider: 'instapaper',
              type: 'highlight',
              highlightId: highlight.highlight_id,
              bookmarkId: highlight.bookmark_id,
              position: highlight.position,
            },
          });
        }
      } catch {
        // Skip individual highlight fetch failures
      }
    }

    return items;
  }

  private bookmarkItemToImportedItem(bookmark: InstapaperBookmarkListItem): ImportedItem {
    const title = bookmark.title ?? 'Untitled';
    return {
      id: `ip_${bookmark.bookmark_id}`,
      sourceType: 'research' as const,
      title,
      content: `"${title}"${bookmark.description ? `: ${bookmark.description}` : ''}. URL: ${bookmark.url ?? 'unknown'}.`,
      timestamp: bookmark.time ? new Date(bookmark.time * 1000).toISOString() : new Date().toISOString(),
      metadata: {
        provider: 'instapaper',
        type: 'bookmark',
        bookmarkId: bookmark.bookmark_id,
        url: bookmark.url,
        starred: bookmark.starred === '1',
        progress: bookmark.progress,
        hash: bookmark.hash,
      },
    };
  }

  /**
   * Make an OAuth 1.0a signed request to the Instapaper API.
   */
  private async makeSignedRequest(
    method: string,
    url: string,
    extraParams?: Record<string, string>,
  ): Promise<Response> {
    const oauthToken = this.tokenManager.getAccessToken(PROVIDER_KEY);
    const oauthTokenSecret = this.tokenManager.getRefreshToken(PROVIDER_KEY);

    if (!oauthToken || !oauthTokenSecret) {
      throw new Error('Not authenticated with Instapaper. Use connector.auth to connect.');
    }

    const credentials: OAuth1Credentials = {
      consumerKey: this.consumerKey,
      consumerSecret: this.consumerSecret,
      token: oauthToken,
      tokenSecret: oauthTokenSecret,
    };

    const authHeader = generateOAuth1Header(credentials, {
      method,
      url,
      extraParams,
    });

    const headers: Record<string, string> = {
      Authorization: authHeader,
    };

    const init: RequestInit = {
      method,
      headers,
    };

    if (method === 'POST' && extraParams) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      init.body = new URLSearchParams(extraParams);
    }

    return globalThis.fetch(url, init);
  }
}
