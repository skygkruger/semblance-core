// Weather Web Fallback — Retrieves weather via web search when no native API.
//
// Used on Android and desktop where no native weather API is available.
// Sends web search queries through IPCClient → Gateway.
//
// CRITICAL: This file is in packages/core/. No network imports.
// CRITICAL: Methods named query*, NOT the banned word.
// CRITICAL: Uses IPCClient, NOT GatewayClient.

import type { IPCClient } from '../agent/ipc-client.js';
import type { WeatherConditions, HourlyForecast, WeatherConditionType } from '../platform/weather-types.js';
import { WeatherCache } from './weather-cache.js';

const CURRENT_TTL_MS = 30 * 60 * 1000;   // 30 minutes
const FORECAST_TTL_MS = 60 * 60 * 1000;  // 60 minutes

function parseConditionFromText(text: string): WeatherConditionType {
  const lower = text.toLowerCase();
  if (lower.includes('clear') || lower.includes('sunny')) return 'clear';
  if (lower.includes('partly')) return 'partly_cloudy';
  if (lower.includes('cloud') || lower.includes('overcast')) return 'cloudy';
  if (lower.includes('thunder') || lower.includes('storm')) return 'thunderstorm';
  if (lower.includes('heavy rain')) return 'heavy_rain';
  if (lower.includes('rain') || lower.includes('drizzle') || lower.includes('shower')) return 'rain';
  if (lower.includes('snow') || lower.includes('sleet')) return 'snow';
  if (lower.includes('fog') || lower.includes('mist')) return 'fog';
  if (lower.includes('wind') || lower.includes('gust')) return 'wind';
  return 'unknown';
}

export class WeatherWebFallback {
  private ipcClient: IPCClient;
  private cache: WeatherCache;

  constructor(ipcClient: IPCClient) {
    this.ipcClient = ipcClient;
    this.cache = new WeatherCache();
  }

  /**
   * Query current weather for a location label (city name, address, etc.).
   */
  async queryCurrentWeather(locationLabel: string): Promise<WeatherConditions | null> {
    const cacheKey = `current:${locationLabel.toLowerCase()}`;
    const cached = this.cache.get<WeatherConditions>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.ipcClient.sendAction('web.search', {
        query: `current weather ${locationLabel}`,
        count: 3,
      });

      if (response.status === 'success' && response.data) {
        const data = response.data as { results: Array<{ title: string; snippet: string }> };
        if (data.results && data.results.length > 0) {
          const snippet = data.results[0]!.snippet;
          const conditions: WeatherConditions = {
            temperature: this.extractTemperature(snippet),
            feelsLike: this.extractTemperature(snippet),
            humidity: 0,
            condition: parseConditionFromText(snippet),
            conditionDescription: snippet.slice(0, 100),
            windSpeedKmh: 0,
            precipitationMm: 0,
            uvIndex: 0,
            timestamp: new Date().toISOString(),
          };
          this.cache.set(cacheKey, conditions, CURRENT_TTL_MS);
          return conditions;
        }
      }
    } catch {
      // Web search failed
    }

    return null;
  }

  /**
   * Query forecast for a location label.
   */
  async queryForecast(locationLabel: string, hours: number): Promise<HourlyForecast[] | null> {
    const cacheKey = `forecast:${locationLabel.toLowerCase()}:${hours}`;
    const cached = this.cache.get<HourlyForecast[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.ipcClient.sendAction('web.search', {
        query: `${hours} hour weather forecast ${locationLabel}`,
        count: 3,
      });

      if (response.status === 'success' && response.data) {
        const data = response.data as { results: Array<{ title: string; snippet: string }> };
        if (data.results && data.results.length > 0) {
          // Best-effort parse from web search — real hourly data comes from native APIs
          const forecast: HourlyForecast[] = [{
            timestamp: new Date().toISOString(),
            temperature: this.extractTemperature(data.results[0]!.snippet),
            condition: parseConditionFromText(data.results[0]!.snippet),
            conditionDescription: data.results[0]!.snippet.slice(0, 100),
            precipitationChance: 0,
            precipitationMm: 0,
            windSpeedKmh: 0,
          }];
          this.cache.set(cacheKey, forecast, FORECAST_TTL_MS);
          return forecast;
        }
      }
    } catch {
      // Web search failed
    }

    return null;
  }

  private extractTemperature(text: string): number {
    // Try to find temperature patterns like "72°F", "22°C", "72 degrees"
    const fahrenheit = text.match(/(\d+)\s*°?\s*F/i);
    if (fahrenheit) {
      return Math.round(((parseInt(fahrenheit[1]!, 10) - 32) * 5) / 9);
    }
    const celsius = text.match(/(\d+)\s*°?\s*C/i);
    if (celsius) {
      return parseInt(celsius[1]!, 10);
    }
    const degrees = text.match(/(\d+)\s*degrees/i);
    if (degrees) {
      return parseInt(degrees[1]!, 10);
    }
    return 0;
  }
}
