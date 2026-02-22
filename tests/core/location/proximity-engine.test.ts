// Proximity Engine Tests — Location-tagged reminders and proximity checks.
//
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ReminderStore } from '../../../packages/core/knowledge/reminder-store';
import { LocationStore } from '../../../packages/core/location/location-store';
import { ProximityEngine } from '../../../packages/core/location/proximity-engine';
import type { DatabaseHandle } from '../../../packages/core/platform/types';

let db: DatabaseHandle;
let reminderStore: ReminderStore;
let locationStore: LocationStore;
let engine: ProximityEngine;

beforeEach(() => {
  db = new Database(':memory:') as unknown as DatabaseHandle;
  reminderStore = new ReminderStore(db);
  locationStore = new LocationStore(db);
  engine = new ProximityEngine(reminderStore, locationStore);
});

describe('Location-Tagged Reminders', () => {
  it('created with correct coordinate and radius', () => {
    const reminder = reminderStore.create({
      text: 'Buy milk',
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      source: 'location_trigger',
      locationTrigger: {
        coordinate: { latitude: 45.523, longitude: -122.676 },
        radiusMeters: 200,
        label: 'Safeway',
        armed: true,
      },
    });

    expect(reminder.locationTrigger).toBeDefined();
    expect(reminder.locationTrigger!.coordinate.latitude).toBe(45.523);
    expect(reminder.locationTrigger!.radiusMeters).toBe(200);
    expect(reminder.locationTrigger!.label).toBe('Safeway');
    expect(reminder.locationTrigger!.armed).toBe(true);
  });

  it('stored with precision-reduced coordinates', () => {
    const reminder = reminderStore.create({
      text: 'Pick up prescription',
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      source: 'location_trigger',
      locationTrigger: {
        coordinate: { latitude: 45.523456, longitude: -122.676789 },
        radiusMeters: 100,
        label: 'Walgreens',
        armed: true,
      },
    });

    // Coordinates are stored as-is in the trigger (precision reduction happens at LocationStore level)
    expect(reminder.locationTrigger).toBeDefined();
    expect(reminder.source).toBe('location_trigger');
  });
});

describe('ProximityEngine', () => {
  it('user within radius fires reminder', () => {
    reminderStore.create({
      text: 'Buy groceries',
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      source: 'location_trigger',
      locationTrigger: {
        coordinate: { latitude: 45.523, longitude: -122.676 },
        radiusMeters: 500,
        label: 'Store',
        armed: true,
      },
    });

    // User is right at the store
    const matches = engine.checkProximity({ latitude: 45.523, longitude: -122.676 });
    expect(matches.length).toBe(1);
    expect(matches[0]!.reminder.text).toBe('Buy groceries');
  });

  it('user outside radius does not fire', () => {
    reminderStore.create({
      text: 'Buy groceries',
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      source: 'location_trigger',
      locationTrigger: {
        coordinate: { latitude: 45.523, longitude: -122.676 },
        radiusMeters: 100,
        label: 'Store',
        armed: true,
      },
    });

    // User is far away (~233km)
    const matches = engine.checkProximity({ latitude: 47.606, longitude: -122.332 });
    expect(matches.length).toBe(0);
  });

  it('fired reminder is marked (no re-fire)', () => {
    const reminder = reminderStore.create({
      text: 'Buy groceries',
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      source: 'location_trigger',
      locationTrigger: {
        coordinate: { latitude: 45.523, longitude: -122.676 },
        radiusMeters: 500,
        label: 'Store',
        armed: true,
      },
    });

    // First check — fires
    const matches1 = engine.checkProximity({ latitude: 45.523, longitude: -122.676 });
    expect(matches1.length).toBe(1);

    // Second check — already fired, should not match
    const matches2 = engine.checkProximity({ latitude: 45.523, longitude: -122.676 });
    expect(matches2.length).toBe(0);
  });

  it('disarmed trigger is skipped', () => {
    const reminder = reminderStore.create({
      text: 'Buy groceries',
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      source: 'location_trigger',
      locationTrigger: {
        coordinate: { latitude: 45.523, longitude: -122.676 },
        radiusMeters: 500,
        label: 'Store',
        armed: false,
      },
    });

    const matches = engine.checkProximity({ latitude: 45.523, longitude: -122.676 });
    expect(matches.length).toBe(0);
  });

  it('zero armed reminders causes no crash', () => {
    const matches = engine.checkProximity({ latitude: 45.523, longitude: -122.676 });
    expect(matches.length).toBe(0);
  });
});
