// Location Store — SQLite storage for location history with precision reduction.
//
// Stores coordinates at 3 decimal places max (~110m precision).
// Deduplicates readings < 100m apart within 5 minutes.
// Auto-purge configurable (default 7 days).
//
// CRITICAL: This file is in packages/core/. No network imports.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import type { DatabaseHandle } from '../platform/types.js';
import type { LocationCoordinate, DeviceLocation } from '../platform/location-types.js';
import { reduceCoordinatePrecision, distanceMeters, isValidCoordinate } from './location-privacy.js';
import { nanoid } from 'nanoid';

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS location_history (
    id TEXT PRIMARY KEY,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy_m REAL NOT NULL,
    timestamp TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_location_timestamp ON location_history(timestamp);
`;

export interface LocationRow {
  id: string;
  latitude: number;
  longitude: number;
  accuracy_m: number;
  timestamp: string;
  created_at: string;
}

export interface StoredLocation {
  id: string;
  coordinate: LocationCoordinate;
  accuracyMeters: number;
  timestamp: string;
  createdAt: string;
}

function rowToStoredLocation(row: LocationRow): StoredLocation {
  return {
    id: row.id,
    coordinate: { latitude: row.latitude, longitude: row.longitude },
    accuracyMeters: row.accuracy_m,
    timestamp: row.timestamp,
    createdAt: row.created_at,
  };
}

export class LocationStore {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_TABLES);
  }

  /**
   * Record a device location. Reduces precision before storage.
   * Deduplicates: skips if < 100m from last reading within 5 minutes.
   */
  recordLocation(location: DeviceLocation): StoredLocation | null {
    if (!isValidCoordinate(location.coordinate)) return null;

    // Reduce precision to 3 decimal places before storage
    const reduced = reduceCoordinatePrecision(location.coordinate, 3);

    // Deduplication: check if last reading is < 100m away and < 5 min old
    const last = this.getLastKnownLocation();
    if (last) {
      const dist = distanceMeters(reduced, last.coordinate);
      const timeDiffMs = new Date(location.timestamp).getTime() - new Date(last.timestamp).getTime();
      const fiveMinMs = 5 * 60 * 1000;
      if (dist < 100 && timeDiffMs < fiveMinMs) {
        return null; // Deduplicated
      }
    }

    const now = new Date().toISOString();
    const id = `loc_${nanoid()}`;

    this.db.prepare(`
      INSERT INTO location_history (id, latitude, longitude, accuracy_m, timestamp, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, reduced.latitude, reduced.longitude, location.accuracyMeters, location.timestamp, now);

    return {
      id,
      coordinate: reduced,
      accuracyMeters: location.accuracyMeters,
      timestamp: location.timestamp,
      createdAt: now,
    };
  }

  /**
   * Retrieve recent locations from the last N hours.
   */
  getRecentLocations(hours: number): StoredLocation[] {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const rows = this.db.prepare(
      'SELECT * FROM location_history WHERE timestamp >= ? ORDER BY timestamp DESC'
    ).all(since) as LocationRow[];
    return rows.map(rowToStoredLocation);
  }

  /**
   * Get the most recent stored location.
   */
  getLastKnownLocation(): StoredLocation | null {
    const row = this.db.prepare(
      'SELECT * FROM location_history ORDER BY timestamp DESC LIMIT 1'
    ).get() as LocationRow | undefined;
    return row ? rowToStoredLocation(row) : null;
  }

  /**
   * Purge locations older than the given number of days.
   */
  purgeOldLocations(daysToKeep: number): number {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
    const result = this.db.prepare(
      'DELETE FROM location_history WHERE timestamp < ?'
    ).run(cutoff);
    return result.changes;
  }

  /**
   * Delete all location history — nuclear wipe.
   */
  clearAllLocations(): void {
    this.db.prepare('DELETE FROM location_history').run();
  }

  /**
   * Count total location entries.
   */
  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM location_history').get() as { count: number };
    return row.count;
  }
}
