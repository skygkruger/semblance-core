// Weather Cache Tests — In-memory caching with TTL.
//
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import { describe, it, expect, vi } from 'vitest';
import { WeatherCache } from '../../../packages/core/weather/weather-cache';

describe('WeatherCache', () => {
  it('cache hit within TTL returns data', () => {
    const cache = new WeatherCache();
    cache.set('test', { temperature: 20 }, 60_000);
    const result = cache.get<{ temperature: number }>('test');
    expect(result).not.toBeNull();
    expect(result!.temperature).toBe(20);
  });

  it('cache miss after TTL returns null', () => {
    const cache = new WeatherCache();

    // Set with 0ms TTL (already expired)
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    cache.set('test', { temperature: 20 }, 100);

    // Advance past TTL
    vi.setSystemTime(now + 200);
    const result = cache.get<{ temperature: number }>('test');
    expect(result).toBeNull();
    vi.useRealTimers();
  });

  it('same area (3dp key) is cache hit', () => {
    const key1 = WeatherCache.coordKey(45.52312, -122.67654);
    const key2 = WeatherCache.coordKey(45.52387, -122.67699);
    // Both round to 45.523, -122.677
    expect(key1).toBe(key2);
  });
});
