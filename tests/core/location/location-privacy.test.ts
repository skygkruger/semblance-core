// Location Privacy Tests — Precision reduction, audit masking, coordinate validation, distance.
//
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import { describe, it, expect } from 'vitest';
import {
  reduceCoordinatePrecision,
  maskLocationForAudit,
  isValidCoordinate,
  distanceMeters,
} from '../../../packages/core/location/location-privacy';

describe('reduceCoordinatePrecision', () => {
  it('reduces 45.52312345 to 45.523', () => {
    const result = reduceCoordinatePrecision({ latitude: 45.52312345, longitude: -122.67654321 }, 3);
    expect(result.latitude).toBe(45.523);
    expect(result.longitude).toBe(-122.677);
  });

  it('handles negative coordinates', () => {
    const result = reduceCoordinatePrecision({ latitude: -33.86882, longitude: 151.20929 }, 3);
    expect(result.latitude).toBe(-33.869);
    expect(result.longitude).toBe(151.209);
  });
});

describe('maskLocationForAudit', () => {
  it('with label returns "near [label]", never coordinates', () => {
    const result = maskLocationForAudit({ latitude: 45.523, longitude: -122.676 }, 'Home Depot');
    expect(result).toBe('near Home Depot');
    expect(result).not.toMatch(/\d+\.\d+/); // No decimal numbers (coordinates)
  });

  it('without label returns "location-based"', () => {
    const result = maskLocationForAudit({ latitude: 45.523, longitude: -122.676 });
    expect(result).toBe('location-based');
    expect(result).not.toMatch(/\d+\.\d+/);
  });
});

describe('isValidCoordinate', () => {
  it('rejects lat > 90 or < -90', () => {
    expect(isValidCoordinate({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isValidCoordinate({ latitude: -91, longitude: 0 })).toBe(false);
  });

  it('rejects NaN', () => {
    expect(isValidCoordinate({ latitude: NaN, longitude: -122 })).toBe(false);
    expect(isValidCoordinate({ latitude: 45, longitude: NaN })).toBe(false);
  });

  it('accepts valid coordinates', () => {
    expect(isValidCoordinate({ latitude: 45.523, longitude: -122.676 })).toBe(true);
    expect(isValidCoordinate({ latitude: 0, longitude: 0 })).toBe(true);
    expect(isValidCoordinate({ latitude: 90, longitude: 180 })).toBe(true);
    expect(isValidCoordinate({ latitude: -90, longitude: -180 })).toBe(true);
  });
});

describe('distanceMeters', () => {
  it('Portland to Seattle is approximately 233km (within 5%)', () => {
    const portland = { latitude: 45.5152, longitude: -122.6784 };
    const seattle = { latitude: 47.6062, longitude: -122.3321 };
    const distance = distanceMeters(portland, seattle);

    // Expected: ~233km = 233,000m
    const expectedKm = 233;
    const tolerance = expectedKm * 0.05; // 5% tolerance
    const distanceKm = distance / 1000;
    expect(distanceKm).toBeGreaterThan(expectedKm - tolerance);
    expect(distanceKm).toBeLessThan(expectedKm + tolerance);
  });
});
