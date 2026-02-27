/**
 * LetterboxdAdapter — Gateway service adapter for the Letterboxd API v0.
 *
 * Does NOT extend BaseOAuthAdapter. Letterboxd uses API key + HMAC-SHA256 signed requests.
 * Every request is signed: HMAC-SHA256(method\0url\0body\0, apiSecret).
 *
 * Letterboxd API requires partner status. This adapter implements the signed request flow
 * for use when partner credentials are available.
 *
 * Implements ServiceAdapter directly.
 *
 * All HTTP calls use globalThis.fetch. No external HTTP libraries.
 */

import { createHmac } from 'node:crypto';
import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from '../types.js';
import type { AdapterResult } from '../base-oauth-adapter.js';
import type { OAuthTokenManager } from '../oauth-token-manager.js';
import type { ImportedItem } from '@semblance/core/importers/types.js';

const PROVIDER_KEY = 'letterboxd';
const API_BASE = 'https://api.letterboxd.com/api/v0';

interface LetterboxdLogEntry {
  id: string;
  name: string;
  review?: {
    lbml: string;
    containsSpoilers: boolean;
    text: string;
  };
  diaryDetails?: {
    diaryDate: string;
    rewatch: boolean;
  };
  rating?: number;
  like: boolean;
  whenCreated: string;
  whenUpdated: string;
  film: LetterboxdFilmSummary;
  tags?: Array<{ tag: string; displayTag: string }>;
}

interface LetterboxdFilmSummary {
  id: string;
  name: string;
  releaseYear?: number;
  directors?: Array<{ id: string; name: string }>;
  poster?: { sizes: Array<{ width: number; height: number; url: string }> };
  links?: Array<{ type: string; id: string; url: string }>;
}

interface LetterboxdLogEntriesResponse {
  next: string | null;
  items: LetterboxdLogEntry[];
}

interface LetterboxdWatchlistEntry {
  whenCreated: string;
  whenUpdated: string;
  film: LetterboxdFilmSummary;
}

interface LetterboxdWatchlistResponse {
  next: string | null;
  items: LetterboxdWatchlistEntry[];
}

interface LetterboxdMeResponse {
  member: {
    id: string;
    username: string;
    displayName: string;
  };
}

export class LetterboxdAdapter implements ServiceAdapter {
  private tokenManager: OAuthTokenManager;
  private apiKey: string;
  private apiSecret: string;

  constructor(tokenManager: OAuthTokenManager, apiKey: string, apiSecret: string) {
    this.tokenManager = tokenManager;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
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
            error: { code: 'UNKNOWN_ACTION', message: `LetterboxdAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'LETTERBOXD_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Authenticate with Letterboxd using API key + username/password.
   * The Letterboxd API uses token-based auth after initial authentication.
   */
  private async handleAuth(payload: Record<string, unknown>): Promise<AdapterResult> {
    const username = payload['username'] as string | undefined;
    const password = payload['password'] as string | undefined;

    if (!username || !password) {
      return {
        success: false,
        error: { code: 'MISSING_CREDENTIALS', message: 'payload.username and payload.password are required for Letterboxd' },
      };
    }

    // Letterboxd auth: POST /auth/token with grant_type=password
    const url = `${API_BASE}/auth/token`;
    const body = new URLSearchParams({
      grant_type: 'password',
      username,
      password,
    }).toString();

    const response = await this.makeSignedRequest('POST', url, body, 'application/x-www-form-urlencoded');

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'AUTH_FAILED', message: `Letterboxd authentication failed: HTTP ${response.status}` },
      };
    }

    const data = await response.json() as { access_token: string; token_type: string; refresh_token?: string };

    if (!data.access_token) {
      return {
        success: false,
        error: { code: 'TOKEN_ERROR', message: 'No access token in Letterboxd auth response' },
      };
    }

    // Get user info
    let memberId = username;
    let displayName = username;
    try {
      const meResponse = await this.makeSignedRequest('GET', `${API_BASE}/me`, undefined, undefined, data.access_token);
      if (meResponse.ok) {
        const meData = await meResponse.json() as LetterboxdMeResponse;
        memberId = meData.member.id;
        displayName = meData.member.displayName || meData.member.username;
      }
    } catch {
      // Use username as fallback
    }

    this.tokenManager.storeTokens({
      provider: PROVIDER_KEY,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? '',
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
      scopes: 'read',
      userEmail: memberId,
    });

    return {
      success: true,
      data: {
        provider: PROVIDER_KEY,
        memberId,
        displayName,
      },
    };
  }

  private handleAuthStatus(): AdapterResult {
    const hasTokens = this.tokenManager.hasValidTokens(PROVIDER_KEY);
    const memberId = this.tokenManager.getUserEmail(PROVIDER_KEY);
    return {
      success: true,
      data: { authenticated: hasTokens, memberId },
    };
  }

  private handleDisconnect(): AdapterResult {
    this.tokenManager.revokeTokens(PROVIDER_KEY);
    return { success: true, data: { disconnected: true } };
  }

  /**
   * Sync diary entries and watchlist from Letterboxd.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const memberId = this.getMemberId();
    const accessToken = this.getAccessToken();
    const limit = (payload['limit'] as number) ?? 100;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    // 1. Log entries (diary)
    try {
      const logItems = await this.fetchLogEntries(memberId, accessToken, limit);
      items.push(...logItems);
    } catch (err) {
      errors.push({ message: `Log entries: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 2. Watchlist
    try {
      const watchlistItems = await this.fetchWatchlist(memberId, accessToken, Math.min(limit, 100));
      items.push(...watchlistItems);
    } catch (err) {
      errors.push({ message: `Watchlist: ${err instanceof Error ? err.message : String(err)}` });
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
   * List diary entries with cursor-based pagination.
   */
  private async handleListItems(payload: Record<string, unknown>): Promise<AdapterResult> {
    const memberId = this.getMemberId();
    const accessToken = this.getAccessToken();
    const pageSize = (payload['pageSize'] as number) ?? 20;
    const cursor = payload['pageToken'] as string | undefined;

    const url = new URL(`${API_BASE}/member/${memberId}/log-entries`);
    url.searchParams.set('perPage', String(Math.min(pageSize, 100)));
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await this.makeSignedRequest('GET', url.toString(), undefined, undefined, accessToken);

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'LETTERBOXD_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as LetterboxdLogEntriesResponse;
    const items = data.items.map((entry) => this.logEntryToImportedItem(entry));

    return {
      success: true,
      data: {
        items,
        nextPageToken: data.next,
      },
    };
  }

  private async fetchLogEntries(memberId: string, accessToken: string, limit: number): Promise<ImportedItem[]> {
    const items: ImportedItem[] = [];
    let nextCursor: string | null = null;

    const url = new URL(`${API_BASE}/member/${memberId}/log-entries`);
    url.searchParams.set('perPage', String(Math.min(limit, 100)));

    let fetchUrl = url.toString();

    while (items.length < limit) {
      const response = await this.makeSignedRequest('GET', fetchUrl, undefined, undefined, accessToken);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as LetterboxdLogEntriesResponse;

      for (const entry of data.items) {
        if (items.length >= limit) break;
        items.push(this.logEntryToImportedItem(entry));
      }

      nextCursor = data.next;
      if (!nextCursor || data.items.length === 0) break;
      fetchUrl = nextCursor;
    }

    return items;
  }

  private async fetchWatchlist(memberId: string, accessToken: string, limit: number): Promise<ImportedItem[]> {
    const url = new URL(`${API_BASE}/member/${memberId}/watchlist`);
    url.searchParams.set('perPage', String(Math.min(limit, 100)));

    const response = await this.makeSignedRequest('GET', url.toString(), undefined, undefined, accessToken);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as LetterboxdWatchlistResponse;

    return data.items.map((entry) => {
      const directors = entry.film.directors?.map(d => d.name).join(', ') ?? 'Unknown';
      return {
        id: `lbx_watchlist_${entry.film.id}`,
        sourceType: 'productivity' as const,
        title: `Watchlist: ${entry.film.name}${entry.film.releaseYear ? ` (${entry.film.releaseYear})` : ''}`,
        content: `Watchlisted "${entry.film.name}"${entry.film.releaseYear ? ` (${entry.film.releaseYear})` : ''} directed by ${directors}.`,
        timestamp: entry.whenCreated,
        metadata: {
          provider: 'letterboxd',
          type: 'watchlist',
          filmId: entry.film.id,
          filmName: entry.film.name,
          releaseYear: entry.film.releaseYear,
          directors: entry.film.directors?.map(d => d.name) ?? [],
        },
      };
    });
  }

  private logEntryToImportedItem(entry: LetterboxdLogEntry): ImportedItem {
    const directors = entry.film.directors?.map(d => d.name).join(', ') ?? 'Unknown';
    const ratingStr = entry.rating !== undefined ? ` Rating: ${entry.rating}/5.` : '';
    const reviewStr = entry.review?.text ? ` Review: ${entry.review.text.slice(0, 200)}${entry.review.text.length > 200 ? '...' : ''}` : '';
    const tags = entry.tags?.map(t => t.displayTag) ?? [];

    return {
      id: `lbx_${entry.id}`,
      sourceType: 'productivity' as const,
      title: `${entry.film.name}${entry.film.releaseYear ? ` (${entry.film.releaseYear})` : ''}`,
      content: `Watched "${entry.film.name}"${entry.film.releaseYear ? ` (${entry.film.releaseYear})` : ''} directed by ${directors}.${ratingStr}${entry.diaryDetails?.rewatch ? ' (Rewatch)' : ''}${reviewStr}`,
      timestamp: entry.diaryDetails?.diaryDate ?? entry.whenCreated,
      metadata: {
        provider: 'letterboxd',
        type: 'log_entry',
        entryId: entry.id,
        filmId: entry.film.id,
        filmName: entry.film.name,
        releaseYear: entry.film.releaseYear,
        directors: entry.film.directors?.map(d => d.name) ?? [],
        rating: entry.rating,
        liked: entry.like,
        rewatch: entry.diaryDetails?.rewatch ?? false,
        diaryDate: entry.diaryDetails?.diaryDate,
        hasReview: entry.review !== undefined,
        tags,
      },
    };
  }

  /**
   * Make an HMAC-SHA256 signed request to the Letterboxd API.
   * Signature = HMAC-SHA256(method + '\0' + url + '\0' + body + '\0', apiSecret)
   */
  private async makeSignedRequest(
    method: string,
    url: string,
    body?: string,
    contentType?: string,
    accessToken?: string,
  ): Promise<Response> {
    // Build URL with apikey and nonce
    const urlObj = new URL(url);
    urlObj.searchParams.set('apikey', this.apiKey);
    urlObj.searchParams.set('nonce', crypto.randomUUID());
    urlObj.searchParams.set('timestamp', Math.floor(Date.now() / 1000).toString());

    const finalUrl = urlObj.toString();
    const bodyStr = body ?? '';

    // Generate HMAC-SHA256 signature
    const sigInput = `${method.toUpperCase()}\0${finalUrl}\0${bodyStr}`;
    const signature = createHmac('sha256', this.apiSecret)
      .update(sigInput)
      .digest('hex');

    const headers: Record<string, string> = {
      Authorization: `Signature ${signature}`,
    };

    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      headers['X-Letterboxd-Signature'] = signature;
    }

    const init: RequestInit = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      init.body = body;
    }

    return globalThis.fetch(finalUrl, init);
  }

  private getMemberId(): string {
    const memberId = this.tokenManager.getUserEmail(PROVIDER_KEY);
    if (!memberId) {
      throw new Error('Not authenticated with Letterboxd. Use connector.auth to connect.');
    }
    return memberId;
  }

  private getAccessToken(): string {
    const token = this.tokenManager.getAccessToken(PROVIDER_KEY);
    if (!token) {
      throw new Error('Not authenticated with Letterboxd. Use connector.auth to connect.');
    }
    return token;
  }
}
