/**
 * ReadwiseAdapter — Gateway service adapter for the Readwise API v2.
 *
 * Does NOT extend BaseOAuthAdapter. Readwise uses API key authentication,
 * not OAuth 2.0. Implements ServiceAdapter directly.
 *
 * The API key is stored via OAuthTokenManager with the access_token field
 * holding the API key and no refresh token. This reuses existing encrypted
 * storage without requiring a new persistence layer.
 *
 * All HTTP calls use globalThis.fetch. No external HTTP libraries.
 */

import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from '../types.js';
import type { AdapterResult } from '../base-oauth-adapter.js';
import type { OAuthTokenManager } from '../oauth-token-manager.js';
import type { ImportedItem } from '@semblance/core/importers/types.js';

const PROVIDER_KEY = 'readwise';
const API_BASE = 'https://readwise.io/api/v2';

interface ReadwiseHighlight {
  id: number;
  text: string;
  note: string | null;
  location: number | null;
  location_type: string | null;
  highlighted_at: string | null;
  url: string | null;
  color: string | null;
  updated: string;
  book_id: number;
  tags: Array<{ name: string }>;
}

interface ReadwiseHighlightsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ReadwiseHighlight[];
}

interface ReadwiseBook {
  id: number;
  title: string;
  author: string | null;
  category: string;
  source: string;
  num_highlights: number;
  cover_image_url: string | null;
  highlights_url: string;
  updated: string;
}

interface ReadwiseBooksResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ReadwiseBook[];
}

export class ReadwiseAdapter implements ServiceAdapter {
  private tokenManager: OAuthTokenManager;

  constructor(tokenManager: OAuthTokenManager) {
    this.tokenManager = tokenManager;
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
            error: { code: 'UNKNOWN_ACTION', message: `ReadwiseAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'READWISE_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Authenticate with an API key. Validates the key against the Readwise auth endpoint.
   */
  private async handleAuth(payload: Record<string, unknown>): Promise<AdapterResult> {
    const apiKey = payload['apiKey'] as string | undefined;

    if (!apiKey) {
      return {
        success: false,
        error: { code: 'MISSING_API_KEY', message: 'payload.apiKey is required for Readwise' },
      };
    }

    // Validate the key by calling the auth endpoint
    const response = await globalThis.fetch(`${API_BASE}/auth/`, {
      headers: { Authorization: `Token ${apiKey}` },
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'INVALID_API_KEY', message: `Readwise API key validation failed: HTTP ${response.status}` },
      };
    }

    // Store the API key as the access token. No refresh token needed.
    // Set a very long expiry (10 years) since API keys don't expire.
    this.tokenManager.storeTokens({
      provider: PROVIDER_KEY,
      accessToken: apiKey,
      refreshToken: '',
      expiresAt: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
      scopes: 'readwise:read',
    });

    return {
      success: true,
      data: {
        provider: PROVIDER_KEY,
        authenticated: true,
      },
    };
  }

  private handleAuthStatus(): AdapterResult {
    const hasTokens = this.tokenManager.hasValidTokens(PROVIDER_KEY);
    return {
      success: true,
      data: { authenticated: hasTokens },
    };
  }

  private handleDisconnect(): AdapterResult {
    this.tokenManager.revokeTokens(PROVIDER_KEY);
    return { success: true, data: { disconnected: true } };
  }

  /**
   * Sync highlights and books from Readwise.
   * Returns ImportedItem[] for the knowledge graph pipeline.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const apiKey = this.getApiKey();
    const limit = (payload['limit'] as number) ?? 1000;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    // 1. Fetch highlights (paginated)
    try {
      const highlightItems = await this.fetchAllHighlights(apiKey, limit);
      items.push(...highlightItems);
    } catch (err) {
      errors.push({ message: `Highlights: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 2. Fetch books
    try {
      const bookItems = await this.fetchAllBooks(apiKey, limit);
      items.push(...bookItems);
    } catch (err) {
      errors.push({ message: `Books: ${err instanceof Error ? err.message : String(err)}` });
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
   * List highlights with pagination (used by connector.list_items).
   */
  private async handleListItems(payload: Record<string, unknown>): Promise<AdapterResult> {
    const apiKey = this.getApiKey();
    const pageSize = (payload['pageSize'] as number) ?? 100;
    const pageToken = payload['pageToken'] as string | undefined;

    const url = pageToken ?? `${API_BASE}/highlights/?page_size=${Math.min(pageSize, 1000)}`;

    const response = await globalThis.fetch(url, {
      headers: { Authorization: `Token ${apiKey}` },
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'READWISE_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as ReadwiseHighlightsResponse;

    const items = data.results.map((h) => this.highlightToImportedItem(h));

    return {
      success: true,
      data: {
        items,
        nextPageToken: data.next,
        total: data.count,
      },
    };
  }

  /**
   * Fetch all highlights with pagination, up to the specified limit.
   */
  private async fetchAllHighlights(apiKey: string, limit: number): Promise<ImportedItem[]> {
    const items: ImportedItem[] = [];
    let nextUrl: string | null = `${API_BASE}/highlights/?page_size=${Math.min(limit, 1000)}`;

    while (nextUrl && items.length < limit) {
      const response = await globalThis.fetch(nextUrl, {
        headers: { Authorization: `Token ${apiKey}` },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as ReadwiseHighlightsResponse;

      for (const highlight of data.results) {
        if (items.length >= limit) break;
        items.push(this.highlightToImportedItem(highlight));
      }

      nextUrl = data.next;
    }

    return items;
  }

  /**
   * Fetch all books with pagination.
   */
  private async fetchAllBooks(apiKey: string, limit: number): Promise<ImportedItem[]> {
    const items: ImportedItem[] = [];
    let nextUrl: string | null = `${API_BASE}/books/?page_size=${Math.min(limit, 1000)}`;

    while (nextUrl && items.length < limit) {
      const response = await globalThis.fetch(nextUrl, {
        headers: { Authorization: `Token ${apiKey}` },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as ReadwiseBooksResponse;

      for (const book of data.results) {
        if (items.length >= limit) break;
        items.push(this.bookToImportedItem(book));
      }

      nextUrl = data.next;
    }

    return items;
  }

  private highlightToImportedItem(highlight: ReadwiseHighlight): ImportedItem {
    return {
      id: `rw_highlight_${highlight.id}`,
      sourceType: 'research' as const,
      title: highlight.text.slice(0, 100) + (highlight.text.length > 100 ? '...' : ''),
      content: highlight.text + (highlight.note ? `\n\nNote: ${highlight.note}` : ''),
      timestamp: highlight.highlighted_at ?? highlight.updated,
      metadata: {
        provider: 'readwise',
        type: 'highlight',
        highlightId: highlight.id,
        bookId: highlight.book_id,
        location: highlight.location,
        locationType: highlight.location_type,
        color: highlight.color,
        url: highlight.url,
        tags: highlight.tags.map(t => t.name),
      },
    };
  }

  private bookToImportedItem(book: ReadwiseBook): ImportedItem {
    return {
      id: `rw_book_${book.id}`,
      sourceType: 'research' as const,
      title: book.title,
      content: `"${book.title}" by ${book.author ?? 'Unknown'}. Category: ${book.category}. Source: ${book.source}. ${book.num_highlights} highlights.`,
      timestamp: book.updated,
      metadata: {
        provider: 'readwise',
        type: 'book',
        bookId: book.id,
        author: book.author,
        category: book.category,
        source: book.source,
        numHighlights: book.num_highlights,
        coverImageUrl: book.cover_image_url,
      },
    };
  }

  /**
   * Get the stored API key. Throws if not authenticated.
   */
  private getApiKey(): string {
    const apiKey = this.tokenManager.getAccessToken(PROVIDER_KEY);
    if (!apiKey) {
      throw new Error('Not authenticated with Readwise. Provide an API key via connector.auth.');
    }
    return apiKey;
  }
}
