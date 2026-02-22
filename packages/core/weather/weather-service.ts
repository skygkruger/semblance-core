// Weather Service — Unified weather data access.
//
// Priority:
// 1. Native WeatherAdapter (iOS WeatherKit) — local, no network
// 2. Web search fallback (via IPCClient → Gateway)
//
// CRITICAL: This file is in packages/core/. No network imports.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.
// CRITICAL: Uses IPCClient, NOT GatewayClient.

import type { PlatformAdapter } from '../platform/types.js';
import type { IPCClient } from '../agent/ipc-client.js';
import type { LocationStore } from '../location/location-store.js';
import type {
  WeatherConditions,
  WeatherForecast,
  HourlyForecast,
} from '../platform/weather-types.js';
import type { LocationCoordinate } from '../platform/location-types.js';
import { WeatherWebFallback } from './weather-web-fallback.js';
import { WeatherCache } from './weather-cache.js';

export class WeatherService {
  private platform: PlatformAdapter;
  private webFallback: WeatherWebFallback;
  private locationStore: LocationStore;
  private cache: WeatherCache;

  constructor(platform: PlatformAdapter, ipcClient: IPCClient, locationStore: LocationStore) {
    this.platform = platform;
    this.webFallback = new WeatherWebFallback(ipcClient);
    this.locationStore = locationStore;
    this.cache = new WeatherCache();
  }

  /**
   * Get current weather. Tries native adapter first, falls back to web search.
   */
  async getCurrentWeather(locationLabel?: string): Promise<WeatherConditions | null> {
    // Get location
    const location = this.locationStore.getLastKnownLocation();
    const coord = location?.coordinate;

    // Path 1: Native WeatherAdapter (iOS WeatherKit)
    if (coord && this.platform.weather) {
      const cacheKey = WeatherCache.coordKey(coord.latitude, coord.longitude, 'current');
      const cached = this.cache.get<WeatherConditions>(cacheKey);
      if (cached) return cached;

      try {
        const conditions = await this.platform.weather.getCurrentConditions(coord);
        if (conditions) {
          this.cache.set(cacheKey, conditions, 30 * 60 * 1000);
          return conditions;
        }
      } catch {
        // Fall through to web search
      }
    }

    // Path 2: Web search fallback
    const label = locationLabel || 'current location';
    return this.webFallback.queryCurrentWeather(label);
  }

  /**
   * Get forecast data for the next N hours.
   */
  async getForecastData(hours: number = 24, locationLabel?: string): Promise<HourlyForecast[] | null> {
    const location = this.locationStore.getLastKnownLocation();
    const coord = location?.coordinate;

    // Path 1: Native WeatherAdapter
    if (coord && this.platform.weather) {
      const cacheKey = WeatherCache.coordKey(coord.latitude, coord.longitude, `forecast:${hours}`);
      const cached = this.cache.get<HourlyForecast[]>(cacheKey);
      if (cached) return cached;

      try {
        const forecast = await this.platform.weather.getForecast(coord, hours);
        if (forecast) {
          this.cache.set(cacheKey, forecast.hourly, 60 * 60 * 1000);
          return forecast.hourly;
        }
      } catch {
        // Fall through
      }
    }

    // Path 2: Web search
    const label = locationLabel || 'current location';
    return this.webFallback.queryForecast(label, hours);
  }

  /**
   * Get weather at a specific timestamp and optional location.
   * Returns the closest hourly forecast entry.
   */
  async getWeatherAt(
    timestamp: string,
    location?: LocationCoordinate,
    locationLabel?: string,
  ): Promise<HourlyForecast | null> {
    const targetMs = new Date(timestamp).getTime();
    const nowMs = Date.now();
    const hoursAhead = Math.max(1, Math.ceil((targetMs - nowMs) / (60 * 60 * 1000)));

    if (hoursAhead > 48) return null; // Too far out for hourly data

    const forecast = await this.getForecastData(hoursAhead + 2, locationLabel);
    if (!forecast || forecast.length === 0) return null;

    // Find closest entry to the target timestamp
    let closest: HourlyForecast | null = null;
    let closestDiff = Infinity;

    for (const entry of forecast) {
      const entryMs = new Date(entry.timestamp).getTime();
      const diff = Math.abs(entryMs - targetMs);
      if (diff < closestDiff) {
        closestDiff = diff;
        closest = entry;
      }
    }

    return closest;
  }
}
