// Proximity Engine — Checks location-tagged reminders against current position.
//
// When the user enters the radius around a reminder's coordinate, the reminder fires.
// Uses Haversine distance from location-privacy.ts.
//
// CRITICAL: This file is in packages/core/. No network imports.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import type { ReminderStore, Reminder } from '../knowledge/reminder-store.js';
import type { LocationStore } from './location-store.js';
import type { LocationCoordinate } from '../platform/location-types.js';
import { distanceMeters } from './location-privacy.js';

export interface ProximityMatch {
  reminder: Reminder;
  distanceM: number;
}

export class ProximityEngine {
  private reminderStore: ReminderStore;
  private _locationStore: LocationStore;

  constructor(reminderStore: ReminderStore, locationStore: LocationStore) {
    this.reminderStore = reminderStore;
    this._locationStore = locationStore;
  }

  /**
   * Check all armed location-tagged reminders against the current location.
   * Returns reminders that are within their trigger radius.
   * Fires matched reminders (marks as fired).
   */
  checkProximity(currentLocation: LocationCoordinate): ProximityMatch[] {
    const armed = this.reminderStore.findArmedLocationReminders();
    const matches: ProximityMatch[] = [];

    for (const reminder of armed) {
      if (!reminder.locationTrigger) continue;
      if (!reminder.locationTrigger.armed) continue;

      const dist = distanceMeters(currentLocation, reminder.locationTrigger.coordinate);
      if (dist <= reminder.locationTrigger.radiusMeters) {
        // Fire the reminder
        this.reminderStore.fire(reminder.id);
        matches.push({ reminder, distanceM: dist });
      }
    }

    return matches;
  }

  /**
   * Set the armed state of a location trigger on a reminder.
   */
  setTriggerArmed(reminderId: string, armed: boolean): void {
    const reminder = this.reminderStore.findById(reminderId);
    if (!reminder?.locationTrigger) return;

    const updatedTrigger = { ...reminder.locationTrigger, armed };
    this.reminderStore.updateLocationTrigger(reminderId, updatedTrigger);
  }
}
