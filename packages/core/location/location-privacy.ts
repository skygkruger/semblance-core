// Location Privacy — Coordinate precision reduction, audit masking, validation.
//
// GPS coordinates are PII. This module ensures:
// - Stored coordinates never exceed 3 decimal places (~110m precision)
// - Audit trail entries NEVER contain raw coordinates
// - Haversine distance calculation for proximity checks
//
// CRITICAL: This file is in packages/core/. No network imports.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import type { LocationCoordinate } from '../platform/location-types.js';

/**
 * Reduce coordinate precision to the given number of decimal places.
 * Default: 3 decimal places ≈ 110m precision.
 * Full precision coordinates exist only in ephemeral memory.
 */
export function reduceCoordinatePrecision(
  coord: LocationCoordinate,
  decimalPlaces: number = 3,
): LocationCoordinate {
  const factor = Math.pow(10, decimalPlaces);
  return {
    latitude: Math.round(coord.latitude * factor) / factor,
    longitude: Math.round(coord.longitude * factor) / factor,
  };
}

/**
 * Mask a location for audit trail entries.
 * NEVER returns raw coordinates. Returns a label like "near Home Depot"
 * or "location-based" if no label is provided.
 */
export function maskLocationForAudit(
  _coord: LocationCoordinate,
  label?: string,
): string {
  if (label && label.trim().length > 0) {
    return `near ${label.trim()}`;
  }
  return 'location-based';
}

/**
 * Validate that a coordinate is within valid geographic bounds.
 * Rejects NaN, out-of-range, and non-finite values.
 */
export function isValidCoordinate(coord: LocationCoordinate): boolean {
  if (
    typeof coord.latitude !== 'number' ||
    typeof coord.longitude !== 'number'
  ) {
    return false;
  }
  if (Number.isNaN(coord.latitude) || Number.isNaN(coord.longitude)) {
    return false;
  }
  if (!Number.isFinite(coord.latitude) || !Number.isFinite(coord.longitude)) {
    return false;
  }
  if (coord.latitude < -90 || coord.latitude > 90) {
    return false;
  }
  if (coord.longitude < -180 || coord.longitude > 180) {
    return false;
  }
  return true;
}

/**
 * Calculate the distance between two coordinates using the Haversine formula.
 * Returns distance in meters.
 */
export function distanceMeters(a: LocationCoordinate, b: LocationCoordinate): number {
  const R = 6_371_000; // Earth's radius in meters

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const aVal =
    sinDLat * sinDLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinDLon * sinDLon;

  const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));

  return R * c;
}
