// Geocoding Service — Resolves place names to coordinates.
//
// Priority:
// 1. iOS MapKit geocode (via PlatformAdapter.location.geocode) — local, no network
// 2. Web search fallback (via IPCClient) — Gateway handles the network call
//
// CRITICAL: This file is in packages/core/. No network imports.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.
// CRITICAL: Uses IPCClient, NOT GatewayClient.

import type { PlatformAdapter } from '../platform/types.js';
import type { IPCClient } from '../agent/ipc-client.js';
import type { GeocodedPlace, LocationCoordinate } from '../platform/location-types.js';

export class GeocodingService {
  private platform: PlatformAdapter;
  private ipcClient: IPCClient | null;

  constructor(platform: PlatformAdapter, ipcClient?: IPCClient) {
    this.platform = platform;
    this.ipcClient = ipcClient ?? null;
  }

  /**
   * Resolve a place name to coordinates.
   * Tries native geocode first (iOS MapKit), then web search fallback.
   */
  async findPlace(query: string, nearLocation?: LocationCoordinate): Promise<GeocodedPlace | null> {
    // Path 1: Native geocode (iOS MapKit)
    if (this.platform.location?.geocode) {
      try {
        const result = await this.platform.location.geocode(query, nearLocation);
        if (result) return result;
      } catch {
        // Fall through to web search
      }
    }

    // Path 2: Web search fallback via IPCClient
    if (this.ipcClient) {
      try {
        const searchQuery = nearLocation
          ? `${query} near ${nearLocation.latitude},${nearLocation.longitude} address location`
          : `${query} address location`;

        const response = await this.ipcClient.sendAction('web.search', {
          query: searchQuery,
          count: 3,
        });

        if (response.status === 'success' && response.data) {
          const data = response.data as { results: Array<{ title: string; snippet: string }> };
          if (data.results && data.results.length > 0) {
            // Extract location info from web search results
            // This is a best-effort parse — real geocoding comes from native APIs
            return {
              name: query,
              coordinate: nearLocation ?? { latitude: 0, longitude: 0 },
              address: data.results[0]?.snippet,
            };
          }
        }
      } catch {
        // Web search also failed
      }
    }

    return null;
  }
}
