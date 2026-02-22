// Weather Cache — In-memory cache for weather data.
//
// Keys are generated from 3dp coordinates to ensure same-area cache hits.
// TTL: 30 min for current conditions, 60 min for forecasts.
//
// CRITICAL: This file is in packages/core/. No network imports.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class WeatherCache {
  private store = new Map<string, CacheEntry<unknown>>();

  /**
   * Get a cached value, or null if expired/missing.
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  /**
   * Store a value with a TTL in milliseconds.
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Invalidate a specific key.
   */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Generate a cache key from coordinates (3dp precision).
   */
  static coordKey(lat: number, lon: number, prefix: string = 'weather'): string {
    const lat3 = Math.round(lat * 1000) / 1000;
    const lon3 = Math.round(lon * 1000) / 1000;
    return `${prefix}:${lat3}:${lon3}`;
  }
}
