// Desktop Weather Adapter — Platform-specific weather integration.
//
// Desktop has no native weather API. Weather data goes through the
// web search fallback path (via IPCClient → Gateway).
//
// The configurable adapter is used for testing only.

import type { WeatherAdapter, WeatherForecast, WeatherConditions } from './weather-types.js';
import type { LocationCoordinate } from './location-types.js';

/**
 * Create a configurable weather adapter for development and testing.
 * Returns configurable weather data.
 */
export function createConfigurableWeatherAdapter(options?: {
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
/**
 * Desktop weather returns null — weather data on desktop is fetched via the
 * web search fallback path (user asks agent "what's the weather?" → agent
 * calls search_web tool → Gateway performs the search).
 */
export function createDesktopWeatherAdapter(): WeatherAdapter {
  return {
    async getForecast() { return null; },
    async getCurrentConditions() { return null; },
  };
}
