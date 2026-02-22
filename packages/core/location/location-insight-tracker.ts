// Location Insight Tracker — Generates proactive insights from location updates.
//
// On location update, runs ProximityEngine to check for location-triggered reminders.
// Generates 'location-reminder' insights when proximity matches occur.
// Uses maskLocationForAudit() to ensure no coordinates appear in audit entries.
//
// CRITICAL: This file is in packages/core/. No network imports.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import type { ProactiveInsight } from '../agent/proactive-engine.js';
import type { ProximityEngine } from './proximity-engine.js';
import type { LocationCoordinate } from '../platform/location-types.js';
import { maskLocationForAudit } from './location-privacy.js';
import { nanoid } from 'nanoid';

export class LocationInsightTracker {
  private proximityEngine: ProximityEngine;

  constructor(proximityEngine: ProximityEngine) {
    this.proximityEngine = proximityEngine;
  }

  /**
   * Check current location against armed reminders and generate insights.
   */
  generateInsights(currentLocation: LocationCoordinate): ProactiveInsight[] {
    const matches = this.proximityEngine.checkProximity(currentLocation);
    const insights: ProactiveInsight[] = [];

    for (const match of matches) {
      const label = match.reminder.locationTrigger?.label;
      const maskedLocation = maskLocationForAudit(currentLocation, label);

      insights.push({
        id: nanoid(),
        type: 'location-reminder',
        priority: 'high',
        title: match.reminder.text,
        summary: `Triggered ${maskedLocation}`,
        sourceIds: [match.reminder.id],
        suggestedAction: null,
        createdAt: new Date().toISOString(),
        expiresAt: null,
        estimatedTimeSavedSeconds: 120,
      });
    }

    return insights;
  }
}
