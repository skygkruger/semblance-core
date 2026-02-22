// Location Insight Tracker Tests — Proactive insights from location updates.
//
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ReminderStore } from '../../../packages/core/knowledge/reminder-store';
import { LocationStore } from '../../../packages/core/location/location-store';
import { ProximityEngine } from '../../../packages/core/location/proximity-engine';
import { LocationInsightTracker } from '../../../packages/core/location/location-insight-tracker';
import type { DatabaseHandle } from '../../../packages/core/platform/types';

let db: DatabaseHandle;
let reminderStore: ReminderStore;
let locationStore: LocationStore;
let proximityEngine: ProximityEngine;
let tracker: LocationInsightTracker;

beforeEach(() => {
  db = new Database(':memory:') as unknown as DatabaseHandle;
  reminderStore = new ReminderStore(db);
  locationStore = new LocationStore(db);
  proximityEngine = new ProximityEngine(reminderStore, locationStore);
  tracker = new LocationInsightTracker(proximityEngine);
});

describe('LocationInsightTracker', () => {
  it('proximity match generates location-reminder insight', () => {
    reminderStore.create({
      text: 'Buy milk',
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      source: 'location_trigger',
      locationTrigger: {
        coordinate: { latitude: 45.523, longitude: -122.676 },
        radiusMeters: 500,
        label: 'Safeway',
        armed: true,
      },
    });

    const insights = tracker.generateInsights({ latitude: 45.523, longitude: -122.676 });

    expect(insights.length).toBe(1);
    expect(insights[0]!.type).toBe('location-reminder');
    expect(insights[0]!.priority).toBe('high');
    expect(insights[0]!.title).toBe('Buy milk');
    expect(insights[0]!.sourceIds.length).toBe(1);
    expect(insights[0]!.estimatedTimeSavedSeconds).toBe(120);
  });

  it('audit entry uses masked location (no coordinates in summary)', () => {
    reminderStore.create({
      text: 'Pick up prescription',
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      source: 'location_trigger',
      locationTrigger: {
        coordinate: { latitude: 45.523, longitude: -122.676 },
        radiusMeters: 200,
        label: 'Walgreens',
        armed: true,
      },
    });

    const insights = tracker.generateInsights({ latitude: 45.5231, longitude: -122.6761 });

    expect(insights.length).toBe(1);
    // Summary should use masked location, never raw coordinates
    expect(insights[0]!.summary).toContain('near Walgreens');
    expect(insights[0]!.summary).not.toMatch(/\d+\.\d{4,}/);
    expect(insights[0]!.summary).not.toContain('45.523');
    expect(insights[0]!.summary).not.toContain('-122.676');
  });

  it('no proximity matches generates no insights', () => {
    // No armed reminders at all
    const insights = tracker.generateInsights({ latitude: 45.523, longitude: -122.676 });
    expect(insights.length).toBe(0);
  });
});
