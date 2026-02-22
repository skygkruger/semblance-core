// Mobile Location Bridge — React Native adapter for device location.
//
// iOS: React Native Geolocation + MapKit via native bridge.
//   - getCurrentLocation, watchLocation: Geolocation API
//   - estimateTravelTime: MapKit native bridge (ETA request)
//   - geocode: MapKit geocoding native bridge
//
// Android: React Native Geolocation only.
//   - getCurrentLocation, watchLocation: Geolocation API
//   - estimateTravelTime: returns null (no MapKit equivalent)
//   - geocode: returns null (no MapKit equivalent)
//
// CRITICAL: No network imports. All location is local device interaction.

import type {
  LocationAdapter,
  DeviceLocation,
  LocationCoordinate,
  TravelEstimate,
  TravelMode,
  GeocodedPlace,
} from '@semblance/core/platform/location-types';

/**
 * Shape of the native MapKit module on iOS.
 */
interface NativeMapKitModule {
  estimateTravelTime(
    fromLat: number, fromLon: number,
    toLat: number, toLon: number,
    mode: string,
  ): Promise<{ durationSeconds: number; distanceMeters: number } | null>;
  geocode(query: string, nearLat?: number, nearLon?: number): Promise<{
    name: string;
    latitude: number;
    longitude: number;
    address?: string;
    city?: string;
    region?: string;
    country?: string;
  } | null>;
}

/**
 * Shape of the Geolocation API from react-native.
 */
interface GeolocationModule {
  getCurrentPosition(
    success: (position: { coords: { latitude: number; longitude: number; accuracy: number; altitude: number | null; speed: number | null }; timestamp: number }) => void,
    error: (err: { code: number; message: string }) => void,
    options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number },
  ): void;
  watchPosition(
    success: (position: { coords: { latitude: number; longitude: number; accuracy: number; altitude: number | null; speed: number | null }; timestamp: number }) => void,
    error: (err: { code: number; message: string }) => void,
    options?: { enableHighAccuracy?: boolean; distanceFilter?: number },
  ): number;
  clearWatch(watchId: number): void;
}

/**
 * Create the React Native location adapter.
 * iOS: Geolocation + MapKit. Android: Geolocation only.
 */
export function createMobileLocationAdapter(platform: 'ios' | 'android'): LocationAdapter {
  let geolocation: GeolocationModule | null = null;
  let mapKit: NativeMapKitModule | null = null;
  const watchIds: number[] = [];

  function getGeolocation(): GeolocationModule | null {
    if (!geolocation) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const RNGeolocation = require('@react-native-community/geolocation');
        geolocation = RNGeolocation.default || RNGeolocation;
      } catch {
        return null;
      }
    }
    return geolocation;
  }

  function getMapKit(): NativeMapKitModule | null {
    if (platform !== 'ios') return null;
    if (!mapKit) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        mapKit = require('react-native-mapkit-bridge').default;
      } catch {
        return null;
      }
    }
    return mapKit;
  }

  function toDeviceLocation(position: {
    coords: { latitude: number; longitude: number; accuracy: number; altitude: number | null; speed: number | null };
    timestamp: number;
  }): DeviceLocation {
    return {
      coordinate: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      },
      accuracyMeters: position.coords.accuracy,
      timestamp: new Date(position.timestamp).toISOString(),
      altitudeMeters: position.coords.altitude ?? undefined,
      speedMps: position.coords.speed ?? undefined,
    };
  }

  const adapter: LocationAdapter = {
    async hasPermission() {
      // Check via Geolocation — if we can get position, permission is granted
      const geo = getGeolocation();
      if (!geo) return false;
      return new Promise<boolean>((resolve) => {
        geo.getCurrentPosition(
          () => resolve(true),
          () => resolve(false),
          { timeout: 1000 },
        );
      });
    },

    async requestPermission() {
      const geo = getGeolocation();
      if (!geo) return 'denied';
      return new Promise<'authorized' | 'denied'>((resolve) => {
        geo.getCurrentPosition(
          () => resolve('authorized'),
          () => resolve('denied'),
          { enableHighAccuracy: true, timeout: 5000 },
        );
      });
    },

    async getCurrentLocation() {
      const geo = getGeolocation();
      if (!geo) return null;
      return new Promise<DeviceLocation | null>((resolve) => {
        geo.getCurrentPosition(
          (position) => resolve(toDeviceLocation(position)),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
        );
      });
    },

    watchLocation(callback: (location: DeviceLocation) => void) {
      const geo = getGeolocation();
      if (!geo) return () => {};
      const id = geo.watchPosition(
        (position) => callback(toDeviceLocation(position)),
        () => {},
        { enableHighAccuracy: true, distanceFilter: 50 },
      );
      watchIds.push(id);
      return () => {
        geo.clearWatch(id);
        const idx = watchIds.indexOf(id);
        if (idx >= 0) watchIds.splice(idx, 1);
      };
    },

    stopWatching() {
      const geo = getGeolocation();
      if (!geo) return;
      for (const id of watchIds) {
        geo.clearWatch(id);
      }
      watchIds.length = 0;
    },
  };

  // iOS: Add MapKit-powered travel time and geocoding
  if (platform === 'ios') {
    adapter.estimateTravelTime = async (
      from: LocationCoordinate,
      to: LocationCoordinate,
      mode?: TravelMode,
    ): Promise<TravelEstimate | null> => {
      const mk = getMapKit();
      if (!mk) return null;
      try {
        const result = await mk.estimateTravelTime(
          from.latitude, from.longitude,
          to.latitude, to.longitude,
          mode ?? 'driving',
        );
        if (!result) return null;
        return {
          durationSeconds: result.durationSeconds,
          distanceMeters: result.distanceMeters,
          mode: mode ?? 'driving',
        };
      } catch {
        return null;
      }
    };

    adapter.geocode = async (
      query: string,
      near?: LocationCoordinate,
    ): Promise<GeocodedPlace | null> => {
      const mk = getMapKit();
      if (!mk) return null;
      try {
        const result = await mk.geocode(query, near?.latitude, near?.longitude);
        if (!result) return null;
        return {
          name: result.name,
          coordinate: { latitude: result.latitude, longitude: result.longitude },
          address: result.address,
          city: result.city,
          region: result.region,
          country: result.country,
        };
      } catch {
        return null;
      }
    };
  }

  return adapter;
}
