// Location Types — Platform-agnostic location adapter interfaces.
//
// Desktop: Mock adapter (GPS not meaningful on desktop), optional city config.
// iOS: React Native Geolocation + MapKit (travel time, geocoding).
// Android: React Native Geolocation only (no travel time or geocoding).
//
// CRITICAL: No network imports. All location data stays local.

/**
 * A geographic coordinate pair.
 */
export interface LocationCoordinate {
  latitude: number;
  longitude: number;
}

/**
 * A location reading from the device.
 */
export interface DeviceLocation {
  coordinate: LocationCoordinate;
  /** Accuracy in meters */
  accuracyMeters: number;
  /** ISO timestamp of the reading */
  timestamp: string;
  /** Altitude in meters, if available */
  altitudeMeters?: number;
  /** Speed in m/s, if available */
  speedMps?: number;
}

/**
 * A resolved place from geocoding.
 */
export interface GeocodedPlace {
  name: string;
  coordinate: LocationCoordinate;
  address?: string;
  city?: string;
  region?: string;
  country?: string;
}

/**
 * Travel mode for time estimation.
 */
export type TravelMode = 'driving' | 'walking' | 'transit';

/**
 * A travel time estimate between two points.
 */
export interface TravelEstimate {
  durationSeconds: number;
  distanceMeters: number;
  mode: TravelMode;
}

/**
 * Platform-agnostic location adapter.
 * Desktop: Returns mock/configured location.
 * iOS: Native Geolocation + MapKit for travel/geocoding.
 * Android: Native Geolocation only.
 */
export interface LocationAdapter {
  /** Check if location permission has been granted */
  hasPermission(): Promise<boolean>;

  /** Request location permission from the user */
  requestPermission(): Promise<'authorized' | 'denied'>;

  /** Get the current device location, or null if unavailable */
  getCurrentLocation(): Promise<DeviceLocation | null>;

  /**
   * Watch location changes continuously.
   * Returns a cleanup function to stop watching.
   */
  watchLocation(callback: (location: DeviceLocation) => void): () => void;

  /** Stop all active location watches */
  stopWatching(): void;

  /**
   * Estimate travel time between two points.
   * Returns null if not supported on this platform.
   */
  estimateTravelTime?(
    from: LocationCoordinate,
    to: LocationCoordinate,
    mode?: TravelMode,
  ): Promise<TravelEstimate | null>;

  /**
   * Geocode a place name to coordinates.
   * Returns null if not supported on this platform.
   */
  geocode?(query: string, near?: LocationCoordinate): Promise<GeocodedPlace | null>;
}
