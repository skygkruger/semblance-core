// Desktop Weather Adapter — Platform-specific weather integration.
//
// Desktop has no native weather API. Weather data goes through the
// web search fallback path (via IPCClient → Gateway).
//
// The mock adapter is used for testing only.

import type { WeatherAdapter, WeatherForecast, WeatherConditions } from './weather-types.js';
import type { LocationCoordinate } from './location-types.js';

/**
 * Create a mock weather adapter for development and testing.
 * Returns configurable weather data.
 */
export function createMockWeatherAdapter(options?: {
  forecast?: WeatherForecast;
  conditions?: WeatherConditions;
}): WeatherAdapter {
  return {
    async getForecast(coordinate: LocationCoordinate, hours: number) {
      if (options?.forecast) return options.forecast;
      return null;
    },

    async getCurrentConditions(coordinate: LocationCoordinate) {
      if (options?.conditions) return options.conditions;
      return null;
    },
  };
}

/**
 * Create the desktop weather adapter.
 * Desktop has no native weather API — returns null for all methods.
 * Weather data on desktop goes through the web search fallback path.
 */
export function createDesktopWeatherAdapter(): WeatherAdapter {
  // TODO(Sprint 4): Wire up when native weather available
  return createMockWeatherAdapter();
}
