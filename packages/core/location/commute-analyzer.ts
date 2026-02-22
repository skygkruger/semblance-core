// Commute Analyzer — Analyzes upcoming calendar events for commute insights.
//
// Travel time priority:
// 1. iOS MapKit (via PlatformAdapter.location.estimateTravelTime)
// 2. Web search heuristic (via IPCClient)
// 3. Default heuristic: 30 min local / 60 min non-local
//
// Buffer: 15 minutes added to all travel times.
//
// CRITICAL: This file is in packages/core/. No network imports.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.
// CRITICAL: Uses IPCClient, NOT GatewayClient.

import type { CalendarIndexer, IndexedCalendarEvent } from '../knowledge/calendar-indexer.js';
import type { LocationStore } from './location-store.js';
import type { GeocodingService } from './geocoding-service.js';
import type { PlatformAdapter } from '../platform/types.js';
import type { IPCClient } from '../agent/ipc-client.js';
import type { LocationCoordinate } from '../platform/location-types.js';
import { isVirtualMeeting } from './virtual-meeting-detector.js';

const BUFFER_MINUTES = 15;
const DEFAULT_LOCAL_TRAVEL_MINUTES = 30;
const DEFAULT_NON_LOCAL_TRAVEL_MINUTES = 60;

export interface CommuteInsight {
  eventId: string;
  eventTitle: string;
  eventStartTime: string;
  destination: string;
  travelTimeMinutes: number;
  suggestedDepartureTime: string;
  isEstimated: boolean;
}

export class CommuteAnalyzer {
  private calendarIndexer: CalendarIndexer;
  private locationStore: LocationStore;
  private geocodingService: GeocodingService;
  private platform: PlatformAdapter;
  private _ipcClient: IPCClient;

  constructor(
    calendarIndexer: CalendarIndexer,
    locationStore: LocationStore,
    geocodingService: GeocodingService,
    platform: PlatformAdapter,
    ipcClient: IPCClient,
  ) {
    this.calendarIndexer = calendarIndexer;
    this.locationStore = locationStore;
    this.geocodingService = geocodingService;
    this.platform = platform;
    this._ipcClient = ipcClient;
  }

  /**
   * Analyze upcoming events and return commute insights.
   * Skips virtual meetings and events without locations.
   */
  async analyzeUpcomingCommutes(): Promise<CommuteInsight[]> {
    const events = this.calendarIndexer.getUpcomingEvents({ daysAhead: 1, limit: 10 });
    const insights: CommuteInsight[] = [];

    for (const event of events) {
      // Skip all-day events
      if (event.isAllDay) continue;

      // Skip events without location
      if (!event.location || event.location.trim() === '') continue;

      // Skip virtual meetings
      if (isVirtualMeeting(event)) continue;

      const travelMinutes = await this.estimateTravelMinutes(event);
      const eventStart = new Date(event.startTime);
      const departureMs = eventStart.getTime() - (travelMinutes + BUFFER_MINUTES) * 60 * 1000;

      insights.push({
        eventId: event.uid,
        eventTitle: event.title,
        eventStartTime: event.startTime,
        destination: event.location,
        travelTimeMinutes: travelMinutes,
        suggestedDepartureTime: new Date(departureMs).toISOString(),
        isEstimated: true,
      });
    }

    return insights;
  }

  private async estimateTravelMinutes(event: IndexedCalendarEvent): Promise<number> {
    const currentLocation = this.locationStore.getLastKnownLocation();
    if (!currentLocation) return DEFAULT_LOCAL_TRAVEL_MINUTES;

    // Try to geocode the destination
    const destination = await this.geocodingService.findPlace(
      event.location,
      currentLocation.coordinate,
    );

    if (!destination) return DEFAULT_LOCAL_TRAVEL_MINUTES;

    // Path 1: iOS MapKit travel time
    if (this.platform.location?.estimateTravelTime) {
      try {
        const estimate = await this.platform.location.estimateTravelTime(
          currentLocation.coordinate,
          destination.coordinate,
          'driving',
        );
        if (estimate) {
          return Math.ceil(estimate.durationSeconds / 60);
        }
      } catch {
        // Fall through
      }
    }

    // Path 2: Heuristic based on distance
    return this.heuristicTravelMinutes(currentLocation.coordinate, destination.coordinate);
  }

  private heuristicTravelMinutes(from: LocationCoordinate, to: LocationCoordinate): number {
    // Very rough estimate: < 10km = local, >= 10km = non-local
    const R = 6371000;
    const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
    const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((from.latitude * Math.PI) / 180) * Math.cos((to.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceM = R * c;

    if (distanceM < 10_000) return DEFAULT_LOCAL_TRAVEL_MINUTES;
    return DEFAULT_NON_LOCAL_TRAVEL_MINUTES;
  }
}
