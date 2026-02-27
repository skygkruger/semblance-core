/**
 * LastFmAdapter — Gateway service adapter for the Last.fm API.
 *
 * Does NOT extend BaseOAuthAdapter. Last.fm uses API key + session authentication:
 *   1. Redirect to https://www.last.fm/api/auth/?api_key={key}
 *   2. Callback with token parameter
 *   3. GET method=auth.getSession with token + api_sig to get session_key
 *   4. api_sig = md5(sorted params as key+value strings + api_secret)
 *
 * Implements ServiceAdapter directly.
 *
 * All HTTP calls use globalThis.fetch. No external HTTP libraries.
 */

import { createHash } from 'node:crypto';
import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from '../types.js';
import type { AdapterResult } from '../base-oauth-adapter.js';
import type { OAuthTokenManager } from '../oauth-token-manager.js';
import type { ImportedItem } from '@semblance/core/importers/types.js';
import { OAuthCallbackServer } from '../oauth-callback-server.js';

const PROVIDER_KEY = 'lastfm';
const API_BASE = 'https://ws.audioscrobbler.com/2.0/';

interface LastFmTrack {
  name: string;
  artist: { '#text': string; mbid?: string };
  album: { '#text': string; mbid?: string };
  url: string;
  date?: { uts: string; '#text': string };
  mbid?: string;
  '@attr'?: { nowplaying?: string };
  streamable?: string;
  image?: Array<{ '#text': string; size: string }>;
}

interface LastFmRecentTracksResponse {
  recenttracks: {
    track: LastFmTrack[];
    '@attr': {
      user: string;
      totalPages: string;
      page: string;
      perPage: string;
      total: string;
    };
  };
}

interface LastFmLovedTracksResponse {
  lovedtracks: {
    track: Array<{
      name: string;
      artist: { name: string; mbid?: string; url?: string };
      url: string;
      date: { uts: string; '#text': string };
      mbid?: string;
    }>;
    '@attr': {
      user: string;
      totalPages: string;
      page: string;
      perPage: string;
      total: string;
    };
  };
}

interface LastFmSessionResponse {
  session: {
    name: string;
    key: string;
    subscriber: number;
  };
}

export class LastFmAdapter implements ServiceAdapter {
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
            error: { code: 'UNKNOWN_ACTION', message: `LastFmAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'LASTFM_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Last.fm auth flow:
   * 1. Redirect to https://www.last.fm/api/auth/?api_key={key}
   * 2. User authorizes and callback receives a token
   * 3. Call auth.getSession with token and api_sig to get session key
   */
  async performAuthFlow(): Promise<AdapterResult> {
    const callbackServer = new OAuthCallbackServer();
    const { callbackUrl } = await callbackServer.start();

    try {
      // Step 1-2: Open auth URL; wait for callback with token
      // The frontend opens: https://www.last.fm/api/auth/?api_key={key}&cb={callbackUrl}
      const { code: token } = await callbackServer.waitForCallback();

      // Step 3: Exchange token for session key
      const apiSig = this.generateApiSig({
        api_key: this.apiKey,
        method: 'auth.getSession',
        token,
      });

      const url = new URL(API_BASE);
      url.searchParams.set('method', 'auth.getSession');
      url.searchParams.set('api_key', this.apiKey);
      url.searchParams.set('token', token);
      url.searchParams.set('api_sig', apiSig);
      url.searchParams.set('format', 'json');

      const response = await globalThis.fetch(url.toString());

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: { code: 'SESSION_ERROR', message: `Last.fm session exchange failed: ${errorText}` },
        };
      }

      const data = await response.json() as LastFmSessionResponse;

      if (!data.session?.key) {
        return {
          success: false,
          error: { code: 'SESSION_ERROR', message: 'No session key in Last.fm response' },
        };
      }

      // Store session key as access token. Last.fm session keys don't expire.
      this.tokenManager.storeTokens({
        provider: PROVIDER_KEY,
        accessToken: data.session.key,
        refreshToken: '', // Last.fm doesn't use refresh tokens
        expiresAt: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
        scopes: 'read',
        userEmail: data.session.name, // Store username as email field
      });

      return {
        success: true,
        data: {
          provider: PROVIDER_KEY,
          username: data.session.name,
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
   * Sync recent tracks and loved tracks from Last.fm.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const username = this.getUsername();
    const limit = (payload['limit'] as number) ?? 200;
    const from = payload['from'] as number | undefined; // Unix timestamp
    const to = payload['to'] as number | undefined;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    // 1. Recent tracks (paginated)
    try {
      const recentItems = await this.fetchRecentTracks(username, limit, from, to);
      items.push(...recentItems);
    } catch (err) {
      errors.push({ message: `Recent tracks: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 2. Loved tracks
    try {
      const lovedItems = await this.fetchLovedTracks(username, Math.min(limit, 200));
      items.push(...lovedItems);
    } catch (err) {
      errors.push({ message: `Loved tracks: ${err instanceof Error ? err.message : String(err)}` });
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
   * List recent tracks with pagination.
   */
  private async handleListItems(payload: Record<string, unknown>): Promise<AdapterResult> {
    const username = this.getUsername();
    const pageSize = (payload['pageSize'] as number) ?? 50;
    const page = payload['pageToken'] ? parseInt(payload['pageToken'] as string, 10) : 1;

    const url = new URL(API_BASE);
    url.searchParams.set('method', 'user.getRecentTracks');
    url.searchParams.set('user', username);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', String(Math.min(pageSize, 200)));
    url.searchParams.set('page', String(page));

    const response = await globalThis.fetch(url.toString());

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'LASTFM_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as LastFmRecentTracksResponse;
    const tracks = data.recenttracks.track.filter(t => !t['@attr']?.nowplaying);

    const items = tracks.map((track) => this.scrobbleToImportedItem(track));
    const totalPages = parseInt(data.recenttracks['@attr'].totalPages, 10);
    const currentPage = parseInt(data.recenttracks['@attr'].page, 10);
    const nextPageToken = currentPage < totalPages ? String(currentPage + 1) : null;

    return {
      success: true,
      data: {
        items,
        nextPageToken,
        total: parseInt(data.recenttracks['@attr'].total, 10),
      },
    };
  }

  private async fetchRecentTracks(
    username: string,
    limit: number,
    from?: number,
    to?: number,
  ): Promise<ImportedItem[]> {
    const items: ImportedItem[] = [];
    let page = 1;
    let totalPages = 1;

    while (items.length < limit && page <= totalPages) {
      const url = new URL(API_BASE);
      url.searchParams.set('method', 'user.getRecentTracks');
      url.searchParams.set('user', username);
      url.searchParams.set('api_key', this.apiKey);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', String(Math.min(limit - items.length, 200)));
      url.searchParams.set('page', String(page));

      if (from !== undefined) url.searchParams.set('from', String(from));
      if (to !== undefined) url.searchParams.set('to', String(to));

      const response = await globalThis.fetch(url.toString());

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as LastFmRecentTracksResponse;
      totalPages = parseInt(data.recenttracks['@attr'].totalPages, 10);

      const tracks = data.recenttracks.track.filter(t => !t['@attr']?.nowplaying);

      for (const track of tracks) {
        if (items.length >= limit) break;
        items.push(this.scrobbleToImportedItem(track));
      }

      page++;
    }

    return items;
  }

  private async fetchLovedTracks(username: string, limit: number): Promise<ImportedItem[]> {
    const url = new URL(API_BASE);
    url.searchParams.set('method', 'user.getLovedTracks');
    url.searchParams.set('user', username);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', String(Math.min(limit, 200)));

    const response = await globalThis.fetch(url.toString());

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as LastFmLovedTracksResponse;

    return data.lovedtracks.track.map((track) => ({
      id: `lfm_loved_${track.mbid || `${track.artist.name}_${track.name}`.replace(/\s+/g, '_')}`,
      sourceType: 'productivity' as const,
      title: `Loved: ${track.name} - ${track.artist.name}`,
      content: `Loved track: "${track.name}" by ${track.artist.name}.`,
      timestamp: track.date ? new Date(parseInt(track.date.uts, 10) * 1000).toISOString() : new Date().toISOString(),
      metadata: {
        provider: 'lastfm',
        type: 'loved_track',
        trackName: track.name,
        artistName: track.artist.name,
        mbid: track.mbid,
        url: track.url,
      },
    }));
  }

  private scrobbleToImportedItem(track: LastFmTrack): ImportedItem {
    const timestamp = track.date
      ? new Date(parseInt(track.date.uts, 10) * 1000).toISOString()
      : new Date().toISOString();
    const uniqueSuffix = track.date?.uts ?? Date.now().toString();

    return {
      id: `lfm_${track.mbid || `${track.artist['#text']}_${track.name}`.replace(/\s+/g, '_')}_${uniqueSuffix}`,
      sourceType: 'productivity' as const,
      title: `${track.name} - ${track.artist['#text']}`,
      content: `Listened to "${track.name}" by ${track.artist['#text']}${track.album['#text'] ? ` from "${track.album['#text']}"` : ''}.`,
      timestamp,
      metadata: {
        provider: 'lastfm',
        type: 'scrobble',
        trackName: track.name,
        artistName: track.artist['#text'],
        albumName: track.album['#text'],
        mbid: track.mbid,
        url: track.url,
      },
    };
  }

  /**
   * Generate the api_sig for Last.fm API calls.
   * Signature = md5(sorted params as key+value concatenated + api_secret)
   */
  private generateApiSig(params: Record<string, string>): string {
    const sortedKeys = Object.keys(params).sort();
    let sigString = '';
    for (const key of sortedKeys) {
      sigString += key + params[key]!;
    }
    sigString += this.apiSecret;

    return createHash('md5').update(sigString).digest('hex');
  }

  /**
   * Get the stored username. Throws if not authenticated.
   */
  private getUsername(): string {
    const username = this.tokenManager.getUserEmail(PROVIDER_KEY);
    if (!username) {
      throw new Error('Not authenticated with Last.fm. Use connector.auth to connect.');
    }
    return username;
  }
}
