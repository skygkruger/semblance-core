// Desktop Location Adapter — Platform-specific location integration.
//
// Desktop doesn't have meaningful GPS, so:
// - Dev/test: createMockLocationAdapter() provides configurable location + simulateMove
// - Production: createDesktopLocationAdapter() delegates to mock with default coords
//
// Travel time estimation is NOT available on desktop (returns null).
// Geocoding is NOT available on desktop (returns null).

import type {
  LocationAdapter,
  DeviceLocation,
  LocationCoordinate,
} from './location-types.js';

/**
 * Create a mock location adapter for development and testing.
 * Accepts configurable coordinates, permission state, and simulateMove().
 */
export function createMockLocationAdapter(options?: {
  coordinate?: LocationCoordinate;
  permission?: 'authorized' | 'denied' | 'undetermined';
  accuracyMeters?: number;
}): LocationAdapter & { simulateMove(coord: LocationCoordinate): void } {
  let permission = options?.permission ?? 'authorized';
  let currentCoord: LocationCoordinate = options?.coordinate ?? { latitude: 45.523, longitude: -122.676 };
  const accuracy = options?.accuracyMeters ?? 10;
  const watchers: Array<(location: DeviceLocation) => void> = [];

  function buildLocation(): DeviceLocation {
    return {
      coordinate: { ...currentCoord },
      accuracyMeters: accuracy,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    async hasPermission() {
      return permission === 'authorized';
    },

    async requestPermission() {
      if (permission === 'undetermined') {
        permission = 'authorized';
      }
      return permission as 'authorized' | 'denied';
    },

    async getCurrentLocation() {
      if (permission !== 'authorized') return null;
      return buildLocation();
    },

    watchLocation(callback: (location: DeviceLocation) => void) {
      watchers.push(callback);
      return () => {
        const idx = watchers.indexOf(callback);
        if (idx >= 0) watchers.splice(idx, 1);
      };
    },

    stopWatching() {
      watchers.length = 0;
    },

    simulateMove(coord: LocationCoordinate) {
      currentCoord = { ...coord };
      const loc = buildLocation();
      for (const watcher of watchers) {
        watcher(loc);
      }
    },
  };
}

/**
 * Create the desktop location adapter.
 * Desktop doesn't have meaningful GPS — delegates to mock adapter.
 * Travel time estimation returns null on desktop.
 */
export function createDesktopLocationAdapter(platform: string): LocationAdapter {
  // No native location API on desktop platforms
  // TODO(Sprint 4): Wire up @tauri-apps/plugin-geolocation when available
  const mock = createMockLocationAdapter({
    coordinate: { latitude: 0, longitude: 0 },
    permission: 'undetermined',
  });

  return {
    hasPermission: mock.hasPermission,
    requestPermission: mock.requestPermission,
    getCurrentLocation: mock.getCurrentLocation,
    watchLocation: mock.watchLocation,
    stopWatching: mock.stopWatching,
    // estimateTravelTime not provided — returns null on desktop
    // geocode not provided — returns null on desktop
  };
}
