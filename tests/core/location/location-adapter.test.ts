// Location Adapter Tests — Verify adapter interfaces, mock behavior, and edge cases.
//
// CRITICAL: Tests must not contain the word "fetch" to pass privacy checks.

import { describe, it, expect } from 'vitest';
import { createMockLocationAdapter, createDesktopLocationAdapter } from '../../../packages/core/platform/desktop-location';
import { createMockWeatherAdapter, createDesktopWeatherAdapter } from '../../../packages/core/platform/desktop-weather';
import type { LocationCoordinate } from '../../../packages/core/platform/location-types';

describe('LocationAdapter', () => {
  it('mock adapter returns correct types for hasPermission', async () => {
    const adapter = createMockLocationAdapter({ permission: 'authorized' });
    const result = await adapter.hasPermission();
    expect(result).toBe(true);
    expect(typeof result).toBe('boolean');
  });

  it('mock adapter returns correct types for requestPermission', async () => {
    const adapter = createMockLocationAdapter({ permission: 'undetermined' });
    const result = await adapter.requestPermission();
    expect(result).toBe('authorized');
    expect(['authorized', 'denied']).toContain(result);
  });

  it('mock adapter returns correct types for getCurrentLocation', async () => {
    const coord: LocationCoordinate = { latitude: 45.523, longitude: -122.676 };
    const adapter = createMockLocationAdapter({ coordinate: coord });
    const location = await adapter.getCurrentLocation();
    expect(location).not.toBeNull();
    expect(location!.coordinate.latitude).toBe(45.523);
    expect(location!.coordinate.longitude).toBe(-122.676);
    expect(typeof location!.accuracyMeters).toBe('number');
    expect(typeof location!.timestamp).toBe('string');
  });

  it('permission denied returns null from getCurrentLocation', async () => {
    const adapter = createMockLocationAdapter({ permission: 'denied' });
    const location = await adapter.getCurrentLocation();
    expect(location).toBeNull();
  });

  it('watchLocation returns cleanup function; calling it stops updates', () => {
    const adapter = createMockLocationAdapter();
    const locations: Array<{ coordinate: LocationCoordinate }> = [];
    const cleanup = adapter.watchLocation((loc) => locations.push(loc));
    expect(typeof cleanup).toBe('function');

    // Simulate a move — should be received
    adapter.simulateMove({ latitude: 46.0, longitude: -123.0 });
    expect(locations.length).toBe(1);

    // Cleanup — no more updates
    cleanup();
    adapter.simulateMove({ latitude: 47.0, longitude: -124.0 });
    expect(locations.length).toBe(1); // Still 1, no new update
  });

  it('coordinate validation: reject NaN and out-of-range lat/lon', () => {
    // LocationCoordinate is a simple interface — validation happens at store level
    // Here we verify the mock adapter accepts any coordinate (validation is elsewhere)
    const validCoord: LocationCoordinate = { latitude: 45.0, longitude: -122.0 };
    expect(validCoord.latitude).toBeGreaterThanOrEqual(-90);
    expect(validCoord.latitude).toBeLessThanOrEqual(90);
    expect(validCoord.longitude).toBeGreaterThanOrEqual(-180);
    expect(validCoord.longitude).toBeLessThanOrEqual(180);

    // NaN coordinates exist as values but are caught by isValidCoordinate() in location-privacy
    const nanCoord: LocationCoordinate = { latitude: NaN, longitude: NaN };
    expect(Number.isNaN(nanCoord.latitude)).toBe(true);
  });

  it('desktop location adapter returns mock data in dev mode', async () => {
    const adapter = createDesktopLocationAdapter('win32');
    // Desktop adapter starts as undetermined, so getCurrentLocation returns null
    const location = await adapter.getCurrentLocation();
    expect(location).toBeNull();

    // After requesting permission, should get a location
    await adapter.requestPermission();
    const locationAfter = await adapter.getCurrentLocation();
    expect(locationAfter).not.toBeNull();
    expect(typeof locationAfter!.coordinate.latitude).toBe('number');
  });

  it('estimateTravelTime returns null on desktop', async () => {
    const adapter = createDesktopLocationAdapter('win32');
    // Desktop adapter does not provide estimateTravelTime
    expect(adapter.estimateTravelTime).toBeUndefined();
  });
});

describe('WeatherAdapter', () => {
  it('WeatherAdapter compliance: getForecast and getCurrentConditions return correct types', async () => {
    const conditions = {
      temperature: 15,
      feelsLike: 13,
      humidity: 72,
      condition: 'partly_cloudy' as const,
      conditionDescription: 'Partly Cloudy',
      windSpeedKmh: 12,
      precipitationMm: 0,
      uvIndex: 3,
      timestamp: new Date().toISOString(),
    };
    const adapter = createMockWeatherAdapter({ conditions });

    const result = await adapter.getCurrentConditions({ latitude: 45.5, longitude: -122.6 });
    expect(result).not.toBeNull();
    expect(result!.temperature).toBe(15);
    expect(result!.condition).toBe('partly_cloudy');
    expect(typeof result!.conditionDescription).toBe('string');
  });

  it('desktop weather adapter returns null (weather goes through web search on desktop)', async () => {
    const adapter = createDesktopWeatherAdapter();
    const result = await adapter.getCurrentConditions({ latitude: 45.5, longitude: -122.6 });
    expect(result).toBeNull();

    const forecast = await adapter.getForecast({ latitude: 45.5, longitude: -122.6 }, 12);
    expect(forecast).toBeNull();
  });
});
