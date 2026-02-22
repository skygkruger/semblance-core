// Geocoding Service Tests — Place resolution via native and web search paths.
//
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import { describe, it, expect, vi } from 'vitest';
import { GeocodingService } from '../../../packages/core/location/geocoding-service';
import { createMockLocationAdapter } from '../../../packages/core/platform/desktop-location';
import type { PlatformAdapter } from '../../../packages/core/platform/types';
import type { IPCClient } from '../../../packages/core/agent/ipc-client';
import type { GeocodedPlace } from '../../../packages/core/platform/location-types';

function createTestPlatform(geocodeResult?: GeocodedPlace | null): PlatformAdapter {
  const locationAdapter = createMockLocationAdapter();
  if (geocodeResult !== undefined) {
    locationAdapter.geocode = vi.fn().mockResolvedValue(geocodeResult);
  }
  return {
    name: 'mobile-ios',
    location: locationAdapter,
    fs: {} as PlatformAdapter['fs'],
    path: {} as PlatformAdapter['path'],
    crypto: {} as PlatformAdapter['crypto'],
    sqlite: {} as PlatformAdapter['sqlite'],
    hardware: {} as PlatformAdapter['hardware'],
    notifications: {} as PlatformAdapter['notifications'],
  };
}

function createMockIPCClient(response?: unknown): IPCClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    sendAction: vi.fn().mockResolvedValue({
      requestId: 'test',
      timestamp: new Date().toISOString(),
      status: 'success' as const,
      data: response ?? { results: [{ title: 'Safeway', snippet: '123 Main St, Portland, OR' }] },
      auditRef: 'audit_test',
    }),
  };
}

describe('GeocodingService', () => {
  it('iOS path returns result from MapKit geocode', async () => {
    const geocodeResult: GeocodedPlace = {
      name: 'Safeway',
      coordinate: { latitude: 45.52, longitude: -122.67 },
      address: '123 Main St, Portland, OR',
    };
    const platform = createTestPlatform(geocodeResult);
    const service = new GeocodingService(platform);

    const result = await service.findPlace('Safeway');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Safeway');
    expect(result!.coordinate.latitude).toBe(45.52);
  });

  it('non-iOS falls back to web search via IPCClient', async () => {
    const platform = createTestPlatform(null); // geocode returns null
    const ipcClient = createMockIPCClient();
    const service = new GeocodingService(platform, ipcClient);

    const result = await service.findPlace('Safeway');
    expect(result).not.toBeNull();
    expect(ipcClient.sendAction).toHaveBeenCalledWith('web.search', expect.any(Object));
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
      // No location adapter
    };
    const service = new GeocodingService(platform);

    const result = await service.findPlace('Safeway');
    expect(result).toBeNull();
  });
});
