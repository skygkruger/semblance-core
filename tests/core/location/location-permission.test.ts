// Location Permission Manager Tests — Permission state management.
//
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import { describe, it, expect } from 'vitest';
import { LocationPermissionManager } from '../../../packages/core/location/location-permission';
import { createMockLocationAdapter } from '../../../packages/core/platform/desktop-location';
import type { PlatformAdapter } from '../../../packages/core/platform/types';

function createTestPlatform(permission: 'authorized' | 'denied' | 'undetermined' = 'undetermined'): PlatformAdapter {
  return {
    name: 'desktop',
    location: createMockLocationAdapter({ permission }),
    // Minimal stubs for other required fields
    fs: {} as PlatformAdapter['fs'],
    path: {} as PlatformAdapter['path'],
    crypto: {} as PlatformAdapter['crypto'],
    sqlite: {} as PlatformAdapter['sqlite'],
    hardware: {} as PlatformAdapter['hardware'],
    notifications: {} as PlatformAdapter['notifications'],
  };
}

describe('LocationPermissionManager', () => {
  it('requestIfNeeded does not re-request after denial', async () => {
    const platform = createTestPlatform('denied');
    const manager = new LocationPermissionManager(platform);

    // First call — gets denied
    const result1 = await manager.requestIfNeeded();
    expect(result1).toBe('denied');

    // Second call — should NOT re-request, just return denied
    const result2 = await manager.requestIfNeeded();
    expect(result2).toBe('denied');
  });

  it('isLocationAvailable returns false when adapter missing', () => {
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

    const manager = new LocationPermissionManager(platform);
    expect(manager.isLocationAvailable()).toBe(false);
  });
});
