// Weather Types — Platform-agnostic weather adapter interfaces.
//
// iOS: WeatherKit via native bridge (no network, pure local API).
// Android: Returns null (weather goes through web search fallback).
// Desktop: Returns null (weather goes through web search fallback).
//
// CRITICAL: No network imports. Weather data either comes from a local
// platform API (iOS WeatherKit) or through IPCClient web search.

import type { LocationCoordinate } from './location-types.js';

/**
 * Weather condition categories.
 */
export type WeatherConditionType =
  | 'clear'
  | 'partly_cloudy'
  | 'cloudy'
  | 'rain'
  | 'heavy_rain'
  | 'snow'
  | 'thunderstorm'
  | 'fog'
  | 'wind'
  | 'unknown';

/**
 * Current weather conditions at a location.
 */
export interface WeatherConditions {
  temperature: number;          // Celsius
  feelsLike: number;            // Celsius
  humidity: number;             // 0-100 percentage
  condition: WeatherConditionType;
  conditionDescription: string; // Human-readable, e.g. "Partly Cloudy"
  windSpeedKmh: number;
  precipitationMm: number;     // Current precipitation rate
  uvIndex: number;
  timestamp: string;            // ISO timestamp
}

/**
 * One hour in a forecast.
 */
export interface HourlyForecast {
  timestamp: string;            // ISO timestamp
  temperature: number;          // Celsius
  condition: WeatherConditionType;
  conditionDescription: string;
  precipitationChance: number;  // 0-100 percentage
  precipitationMm: number;
  windSpeedKmh: number;
}

/**
 * A weather forecast for a location.
 */
export interface WeatherForecast {
  coordinate: LocationCoordinate;
  current: WeatherConditions;
  hourly: HourlyForecast[];
  retrievedAt: string;          // ISO timestamp
}

/**
 * Platform-agnostic weather adapter.
 * iOS: WeatherKit (local API, no network).
 * Android/Desktop: Returns null — weather goes through web search.
 */
export interface WeatherAdapter {
  /** Get forecast for a location (current + hourly for given hours) */
  getForecast(coordinate: LocationCoordinate, hours: number): Promise<WeatherForecast | null>;

  /** Get current conditions only */
  getCurrentConditions(coordinate: LocationCoordinate): Promise<WeatherConditions | null>;
}
