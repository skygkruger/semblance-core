// Commute Analyzer Tests — Commute insight generation.
//
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { CommuteAnalyzer } from '../../../packages/core/location/commute-analyzer';
import { LocationStore } from '../../../packages/core/location/location-store';
import { GeocodingService } from '../../../packages/core/location/geocoding-service';
import type { CalendarIndexer, IndexedCalendarEvent } from '../../../packages/core/knowledge/calendar-indexer';
import type { PlatformAdapter, DatabaseHandle } from '../../../packages/core/platform/types';
import type { IPCClient } from '../../../packages/core/agent/ipc-client';

function makeEvent(overrides: Partial<IndexedCalendarEvent> = {}): IndexedCalendarEvent {
  return {
    id: 'test-id',
    uid: 'test-uid',
    calendarId: 'cal-1',
    title: 'Team Meeting',
    description: '',
    startTime: new Date(Date.now() + 4 * 3600 * 1000).toISOString(), // 4 hours from now
    endTime: new Date(Date.now() + 5 * 3600 * 1000).toISOString(),
    isAllDay: false,
    location: '123 Main St, Portland, OR',
    attendees: '[]',
    organizer: 'boss@example.com',
    status: 'confirmed',
    recurrenceRule: null,
    accountId: 'acc-1',
    indexedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockCalendarIndexer(events: IndexedCalendarEvent[]): CalendarIndexer {
  return {
    getUpcomingEvents: vi.fn().mockReturnValue(events),
    getByUid: vi.fn(),
    indexEvents: vi.fn(),
    searchEvents: vi.fn(),
    getIndexedEvents: vi.fn(),
    count: vi.fn(),
    deleteByAccount: vi.fn(),
  } as unknown as CalendarIndexer;
}

function createMockIPC(): IPCClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    sendAction: vi.fn().mockResolvedValue({
      requestId: 'test',
      timestamp: new Date().toISOString(),
      status: 'success' as const,
      data: { results: [] },
      auditRef: 'audit_test',
    }),
  };
}

let db: DatabaseHandle;
let locationStore: LocationStore;
let platform: PlatformAdapter;

beforeEach(() => {
  db = new Database(':memory:') as unknown as DatabaseHandle;
  locationStore = new LocationStore(db);
  locationStore.recordLocation({
    coordinate: { latitude: 45.523, longitude: -122.676 },
    accuracyMeters: 10,
    timestamp: new Date().toISOString(),
  });
  platform = {
    name: 'desktop',
    fs: {} as PlatformAdapter['fs'],
    path: {} as PlatformAdapter['path'],
    crypto: {} as PlatformAdapter['crypto'],
    sqlite: {} as PlatformAdapter['sqlite'],
    hardware: {} as PlatformAdapter['hardware'],
    notifications: {} as PlatformAdapter['notifications'],
  };
});

describe('CommuteAnalyzer', () => {
  it('event with physical address generates departure suggestion', async () => {
    const events = [makeEvent({ location: '123 Main St, Portland, OR' })];
    const calendarIndexer = createMockCalendarIndexer(events);
    const ipc = createMockIPC();
    const geocoding = new GeocodingService(platform, ipc);
    const analyzer = new CommuteAnalyzer(calendarIndexer, locationStore, geocoding, platform, ipc);

    const insights = await analyzer.analyzeUpcomingCommutes();
    expect(insights.length).toBe(1);
    expect(insights[0]!.destination).toBe('123 Main St, Portland, OR');
    expect(insights[0]!.suggestedDepartureTime).toBeDefined();
    expect(new Date(insights[0]!.suggestedDepartureTime).getTime()).toBeLessThan(
      new Date(events[0]!.startTime).getTime()
    );
  });

  it('event with Zoom link is skipped', async () => {
    const events = [makeEvent({ location: 'https://zoom.us/j/123456789' })];
    const calendarIndexer = createMockCalendarIndexer(events);
    const ipc = createMockIPC();
    const geocoding = new GeocodingService(platform, ipc);
    const analyzer = new CommuteAnalyzer(calendarIndexer, locationStore, geocoding, platform, ipc);

    const insights = await analyzer.analyzeUpcomingCommutes();
    expect(insights.length).toBe(0);
  });

  it('event with no location is skipped', async () => {
    const events = [makeEvent({ location: '' })];
    const calendarIndexer = createMockCalendarIndexer(events);
    const ipc = createMockIPC();
    const geocoding = new GeocodingService(platform, ipc);
    const analyzer = new CommuteAnalyzer(calendarIndexer, locationStore, geocoding, platform, ipc);

    const insights = await analyzer.analyzeUpcomingCommutes();
    expect(insights.length).toBe(0);
  });

  it('departure = event time - travel time - buffer', async () => {
    const eventStart = new Date(Date.now() + 4 * 3600 * 1000);
    const events = [makeEvent({ startTime: eventStart.toISOString(), location: 'Office' })];
    const calendarIndexer = createMockCalendarIndexer(events);
    const ipc = createMockIPC();
    const geocoding = new GeocodingService(platform, ipc);
    const analyzer = new CommuteAnalyzer(calendarIndexer, locationStore, geocoding, platform, ipc);

    const insights = await analyzer.analyzeUpcomingCommutes();
    expect(insights.length).toBe(1);

    const departureTime = new Date(insights[0]!.suggestedDepartureTime).getTime();
    const travelPlusBuffer = (insights[0]!.travelTimeMinutes + 15) * 60 * 1000;
    const expectedDeparture = eventStart.getTime() - travelPlusBuffer;

    expect(departureTime).toBe(expectedDeparture);
  });
});
