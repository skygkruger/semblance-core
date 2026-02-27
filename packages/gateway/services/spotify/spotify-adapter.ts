/**
 * SpotifyAdapter — Gateway service adapter for the Spotify Web API.
 *
 * Extends BasePKCEAdapter because Spotify uses PKCE (S256) for public clients.
 * Handles OAuth authentication flow, token management, and data sync
 * for recently played tracks, top tracks, and saved tracks.
 *
 * All HTTP calls use globalThis.fetch. No external HTTP libraries.
 */

import type { ActionType } from '@semblance/core';
import type { OAuthTokenManager } from '../oauth-token-manager.js';
import type { OAuthConfig } from '../oauth-config.js';
import type { AdapterResult } from '../base-oauth-adapter.js';
import type { ImportedItem } from '@semblance/core/importers/types.js';
import { BasePKCEAdapter } from '../base-pkce-adapter.js';
import { oauthClients } from '../../config/oauth-clients.js';

const SPOTIFY_SCOPES = 'user-read-recently-played user-library-read user-top-read playlist-read-private';

/** Spotify API base URL */
const API_BASE = 'https://api.spotify.com/v1';

/** Build the OAuthConfig for Spotify. */
export function getSpotifyOAuthConfig(): OAuthConfig {
  return {
    providerKey: 'spotify',
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    scopes: SPOTIFY_SCOPES,
    usePKCE: true,
    clientId: oauthClients.spotify.clientId,
  };
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: { name: string; release_date?: string };
  duration_ms: number;
  external_urls?: { spotify?: string };
}

interface SpotifyRecentItem {
  track: SpotifyTrack;
  played_at: string;
}

interface SpotifyRecentlyPlayedResponse {
  items: SpotifyRecentItem[];
  next: string | null;
  cursors?: { after?: string; before?: string };
}

interface SpotifyTopTracksResponse {
  items: SpotifyTrack[];
  next: string | null;
  total: number;
}

interface SpotifySavedTrackItem {
  added_at: string;
  track: SpotifyTrack;
}

interface SpotifySavedTracksResponse {
  items: SpotifySavedTrackItem[];
  next: string | null;
  total: number;
}

interface SpotifyUserProfile {
  email?: string;
  display_name?: string;
  id: string;
}

export class SpotifyAdapter extends BasePKCEAdapter {
  constructor(tokenManager: OAuthTokenManager) {
    super(tokenManager, getSpotifyOAuthConfig());
  }

  protected async getUserInfo(accessToken: string): Promise<{ email?: string; displayName?: string }> {
    const response = await globalThis.fetch(`${API_BASE}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Spotify user info failed: HTTP ${response.status}`);
    }

    const profile = await response.json() as SpotifyUserProfile;
    return {
      email: profile.email,
      displayName: profile.display_name,
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
            error: { code: 'UNKNOWN_ACTION', message: `SpotifyAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'SPOTIFY_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Sync recently played, top tracks, and saved tracks from Spotify.
   * Returns ImportedItem[] for the knowledge graph pipeline.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const limit = (payload['limit'] as number) ?? 50;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    // 1. Recently played tracks
    try {
      const recentItems = await this.fetchRecentlyPlayed(accessToken, limit);
      items.push(...recentItems);
    } catch (err) {
      errors.push({ message: `Recently played: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 2. Top tracks
    try {
      const topItems = await this.fetchTopTracks(accessToken, Math.min(limit, 50));
      items.push(...topItems);
    } catch (err) {
      errors.push({ message: `Top tracks: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 3. Saved tracks
    try {
      const savedItems = await this.fetchSavedTracks(accessToken, Math.min(limit, 50));
      items.push(...savedItems);
    } catch (err) {
      errors.push({ message: `Saved tracks: ${err instanceof Error ? err.message : String(err)}` });
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
   * List items with pagination support (used by connector.list_items).
   */
  private async handleListItems(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const pageSize = (payload['pageSize'] as number) ?? 50;
    const pageToken = payload['pageToken'] as string | undefined;

    const url = new URL(`${API_BASE}/me/tracks`);
    url.searchParams.set('limit', String(Math.min(pageSize, 50)));
    if (pageToken) {
      url.searchParams.set('offset', pageToken);
    }

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'SPOTIFY_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as SpotifySavedTracksResponse;

    const items = data.items.map((item) => this.savedTrackToImportedItem(item));
    const nextOffset = data.next ? String(parseInt(pageToken ?? '0', 10) + data.items.length) : null;

    return {
      success: true,
      data: {
        items,
        nextPageToken: nextOffset,
        total: data.total,
      },
    };
  }

  private async fetchRecentlyPlayed(accessToken: string, limit: number): Promise<ImportedItem[]> {
    const url = new URL(`${API_BASE}/me/player/recently-played`);
    url.searchParams.set('limit', String(Math.min(limit, 50)));

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as SpotifyRecentlyPlayedResponse;

    return data.items.map((item) => ({
      id: `spt_recent_${item.track.id}_${new Date(item.played_at).getTime()}`,
      sourceType: 'productivity' as const,
      title: `${item.track.name} - ${item.track.artists.map(a => a.name).join(', ')}`,
      content: `Listened to "${item.track.name}" by ${item.track.artists.map(a => a.name).join(', ')} from album "${item.track.album.name}"`,
      timestamp: item.played_at,
      metadata: {
        provider: 'spotify',
        type: 'recently_played',
        trackId: item.track.id,
        trackName: item.track.name,
        artists: item.track.artists.map(a => a.name),
        album: item.track.album.name,
        durationMs: item.track.duration_ms,
        spotifyUrl: item.track.external_urls?.spotify,
      },
    }));
  }

  private async fetchTopTracks(accessToken: string, limit: number): Promise<ImportedItem[]> {
    const url = new URL(`${API_BASE}/me/top/tracks`);
    url.searchParams.set('limit', String(Math.min(limit, 50)));
    url.searchParams.set('time_range', 'medium_term');

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as SpotifyTopTracksResponse;

    return data.items.map((track, index) => ({
      id: `spt_top_${track.id}`,
      sourceType: 'productivity' as const,
      title: `Top Track #${index + 1}: ${track.name} - ${track.artists.map(a => a.name).join(', ')}`,
      content: `Top track "${track.name}" by ${track.artists.map(a => a.name).join(', ')} from album "${track.album.name}"`,
      timestamp: new Date().toISOString(),
      metadata: {
        provider: 'spotify',
        type: 'top_track',
        rank: index + 1,
        trackId: track.id,
        trackName: track.name,
        artists: track.artists.map(a => a.name),
        album: track.album.name,
        durationMs: track.duration_ms,
        spotifyUrl: track.external_urls?.spotify,
      },
    }));
  }

  private async fetchSavedTracks(accessToken: string, limit: number): Promise<ImportedItem[]> {
    const url = new URL(`${API_BASE}/me/tracks`);
    url.searchParams.set('limit', String(Math.min(limit, 50)));

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as SpotifySavedTracksResponse;
    return data.items.map((item) => this.savedTrackToImportedItem(item));
  }

  private savedTrackToImportedItem(item: SpotifySavedTrackItem): ImportedItem {
    return {
      id: `spt_saved_${item.track.id}`,
      sourceType: 'productivity' as const,
      title: `${item.track.name} - ${item.track.artists.map(a => a.name).join(', ')}`,
      content: `Saved track "${item.track.name}" by ${item.track.artists.map(a => a.name).join(', ')} from album "${item.track.album.name}"`,
      timestamp: item.added_at,
      metadata: {
        provider: 'spotify',
        type: 'saved_track',
        trackId: item.track.id,
        trackName: item.track.name,
        artists: item.track.artists.map(a => a.name),
        album: item.track.album.name,
        durationMs: item.track.duration_ms,
        spotifyUrl: item.track.external_urls?.spotify,
      },
    };
  }
}
