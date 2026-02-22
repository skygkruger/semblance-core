// Location Store Tests — SQLite storage with precision reduction and deduplication.
//
// Uses in-memory SQLite for testing (same pattern as calendar-indexer tests).
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { LocationStore } from '../../../packages/core/location/location-store';
import type { DatabaseHandle } from '../../../packages/core/platform/types';

let db: DatabaseHandle;
let store: LocationStore;

beforeEach(() => {
  db = new Database(':memory:') as unknown as DatabaseHandle;
  store = new LocationStore(db);
});

describe('LocationStore', () => {
  it('recordLocation reduces precision before storage (query back, verify 3dp)', () => {
    const result = store.recordLocation({
      coordinate: { latitude: 45.52312345, longitude: -122.67654321 },
      accuracyMeters: 10,
      timestamp: new Date().toISOString(),
    });

    expect(result).not.toBeNull();
    // Verify stored coordinates have max 3 decimal places
    const latStr = result!.coordinate.latitude.toString();
    const lonStr = result!.coordinate.longitude.toString();
    const latDecimals = latStr.includes('.') ? latStr.split('.')[1]!.length : 0;
    const lonDecimals = lonStr.includes('.') ? lonStr.split('.')[1]!.length : 0;
    expect(latDecimals).toBeLessThanOrEqual(3);
    expect(lonDecimals).toBeLessThanOrEqual(3);
  });

  it('deduplication: two locations < 100m apart within 5 min yields only one stored', () => {
    const now = new Date();
    store.recordLocation({
      coordinate: { latitude: 45.523, longitude: -122.676 },
      accuracyMeters: 10,
      timestamp: now.toISOString(),
    });

    // Same area, 1 minute later
    const result = store.recordLocation({
      coordinate: { latitude: 45.5231, longitude: -122.6761 },
      accuracyMeters: 10,
      timestamp: new Date(now.getTime() + 60_000).toISOString(),
    });

    expect(result).toBeNull(); // Deduplicated
    expect(store.count()).toBe(1);
  });

  it('purgeOldLocations deletes entries older than threshold', () => {
    // Insert an old location
    const oldTime = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago
    store.recordLocation({
      coordinate: { latitude: 45.523, longitude: -122.676 },
      accuracyMeters: 10,
      timestamp: oldTime,
    });

    // Insert a recent location
    store.recordLocation({
      coordinate: { latitude: 47.606, longitude: -122.332 },
      accuracyMeters: 10,
      timestamp: new Date().toISOString(),
    });

    expect(store.count()).toBe(2);
    const purged = store.purgeOldLocations(7);
    expect(purged).toBe(1);
    expect(store.count()).toBe(1);
  });

  it('clearAllLocations leaves zero rows', () => {
    store.recordLocation({
      coordinate: { latitude: 45.523, longitude: -122.676 },
      accuracyMeters: 10,
      timestamp: new Date().toISOString(),
    });

    expect(store.count()).toBeGreaterThan(0);
    store.clearAllLocations();
    expect(store.count()).toBe(0);
  });

  it('getLastKnownLocation returns most recent', () => {
    const t1 = new Date(Date.now() - 3600_000).toISOString();
    const t2 = new Date().toISOString();

    store.recordLocation({
      coordinate: { latitude: 45.0, longitude: -122.0 },
      accuracyMeters: 10,
      timestamp: t1,
    });
    store.recordLocation({
      coordinate: { latitude: 47.0, longitude: -123.0 },
      accuracyMeters: 10,
      timestamp: t2,
    });

    const last = store.getLastKnownLocation();
    expect(last).not.toBeNull();
    expect(last!.coordinate.latitude).toBe(47.0);
  });
});
