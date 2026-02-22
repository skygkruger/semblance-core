// Weather Service Tests — Unified weather access.
//
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { WeatherService } from '../../../packages/core/weather/weather-service';
import { LocationStore } from '../../../packages/core/location/location-store';
import { createMockWeatherAdapter } from '../../../packages/core/platform/desktop-weather';
import type { PlatformAdapter, DatabaseHandle } from '../../../packages/core/platform/types';
import type { IPCClient } from '../../../packages/core/agent/ipc-client';
import type { WeatherConditions, WeatherForecast } from '../../../packages/core/platform/weather-types';

function createMockIPC(snippet: string = '72°F Clear'): IPCClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    sendAction: vi.fn().mockResolvedValue({
      requestId: 'test',
      timestamp: new Date().toISOString(),
      status: 'success' as const,
      data: { results: [{ title: 'Weather', snippet }] },
      auditRef: 'audit_test',
    }),
  };
}

const mockConditions: WeatherConditions = {
  temperature: 15,
  feelsLike: 13,
  humidity: 65,
  condition: 'clear',
  conditionDescription: 'Clear Sky',
  windSpeedKmh: 10,
  precipitationMm: 0,
  uvIndex: 3,
  timestamp: new Date().toISOString(),
};

let db: DatabaseHandle;
let locationStore: LocationStore;

beforeEach(() => {
  db = new Database(':memory:') as unknown as DatabaseHandle;
  locationStore = new LocationStore(db);
  // Seed a location
  locationStore.recordLocation({
    coordinate: { latitude: 45.523, longitude: -122.676 },
    accuracyMeters: 10,
    timestamp: new Date().toISOString(),
  });
});

describe('WeatherService', () => {
  it('iOS path uses WeatherAdapter (not web search)', async () => {
    const forecast: WeatherForecast = {
      coordinate: { latitude: 45.523, longitude: -122.676 },
      current: mockConditions,
      hourly: [],
      retrievedAt: new Date().toISOString(),
    };
    const platform: PlatformAdapter = {
      name: 'mobile-ios',
      weather: createMockWeatherAdapter({ conditions: mockConditions, forecast }),
      fs: {} as PlatformAdapter['fs'],
      path: {} as PlatformAdapter['path'],
      crypto: {} as PlatformAdapter['crypto'],
      sqlite: {} as PlatformAdapter['sqlite'],
      hardware: {} as PlatformAdapter['hardware'],
      notifications: {} as PlatformAdapter['notifications'],
    };
    const ipc = createMockIPC();
    const service = new WeatherService(platform, ipc, locationStore);

    const result = await service.getCurrentWeather();
    expect(result).not.toBeNull();
    expect(result!.temperature).toBe(15);
    // IPC should NOT have been called
    expect(ipc.sendAction).not.toHaveBeenCalled();
  });

  it('Android/desktop uses web search fallback', async () => {
    const platform: PlatformAdapter = {
      name: 'desktop',
      // No weather adapter
      fs: {} as PlatformAdapter['fs'],
      path: {} as PlatformAdapter['path'],
      crypto: {} as PlatformAdapter['crypto'],
      sqlite: {} as PlatformAdapter['sqlite'],
      hardware: {} as PlatformAdapter['hardware'],
      notifications: {} as PlatformAdapter['notifications'],
    };
    const ipc = createMockIPC('72°F Clear');
    const service = new WeatherService(platform, ipc, locationStore);

    const result = await service.getCurrentWeather('Portland');
    expect(result).not.toBeNull();
    expect(ipc.sendAction).toHaveBeenCalled();
  });

  it('returns null when both paths fail', async () => {
    const platform: PlatformAdapter = {
      name: 'desktop',
      fs: {} as PlatformAdapter['fs'],
      path: {} as PlatformAdapter['path'],
      crypto: {} as PlatformAdapter['crypto'],
      sqlite: {} as PlatformAdapter['sqlite'],
      hardware: {} as PlatformAdapter['hardware'],
      notifications: {} as PlatformAdapter['notifications'],
    };
    const ipc: IPCClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
      sendAction: vi.fn().mockRejectedValue(new Error('Network error')),
    };
    const service = new WeatherService(platform, ipc, locationStore);

    const result = await service.getCurrentWeather('Unknown');
    expect(result).toBeNull();
  });

  it('getWeatherAt returns closest hourly entry', async () => {
    const now = new Date();
    const hourlyEntry = {
      timestamp: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      temperature: 18,
      condition: 'partly_cloudy' as const,
      conditionDescription: 'Partly Cloudy',
      precipitationChance: 20,
      precipitationMm: 0,
      windSpeedKmh: 15,
    };

    const forecast: WeatherForecast = {
      coordinate: { latitude: 45.523, longitude: -122.676 },
      current: mockConditions,
      hourly: [hourlyEntry],
      retrievedAt: now.toISOString(),
    };
    const platform: PlatformAdapter = {
      name: 'mobile-ios',
      weather: createMockWeatherAdapter({ forecast }),
      fs: {} as PlatformAdapter['fs'],
      path: {} as PlatformAdapter['path'],
      crypto: {} as PlatformAdapter['crypto'],
      sqlite: {} as PlatformAdapter['sqlite'],
      hardware: {} as PlatformAdapter['hardware'],
      notifications: {} as PlatformAdapter['notifications'],
    };
    const ipc = createMockIPC();
    const service = new WeatherService(platform, ipc, locationStore);

    const result = await service.getWeatherAt(
      new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    );
    expect(result).not.toBeNull();
    expect(result!.temperature).toBe(18);
  });
});
