# Step 16 — Location + Weather + Contextual Awareness

## Implementation Prompt for Claude Code

**Date:** February 22, 2026
**Context:** Steps 1–15 complete. Step 15 delivered SMS/Messaging + Clipboard Intelligence with 69 new tests. Sprint 4 is active — "Becomes Part of You." This step adds the most privacy-sensitive capability Semblance has implemented: location awareness. GPS coordinates are PII. Every architectural decision must treat them accordingly.
**Test Baseline:** 2,879 tests passing across 172 files. Privacy audit clean. TypeScript compilation clean (`npx tsc --noEmit` → EXIT_CODE=0).
**Rule:** ZERO stubs, ZERO placeholders, ZERO deferrals. Every deliverable ships production-ready. Platform-deferred adapters (Tauri native APIs, React Native native modules) are acceptable with functional mocks and honest TODO labels.

---

## Read First

Before writing any code, read these files:

- `/CLAUDE.md` — Architecture rules, boundary rules, 5 inviolable rules, code quality standards
- `/docs/DESIGN_SYSTEM.md` — All UI must conform to Trellis design system
- `packages/core/platform/types.ts` — PlatformAdapter interface (LocationAdapter and WeatherAdapter will be added here)
- `packages/core/agent/orchestrator.ts` — Where location-aware tools will be wired
- `packages/core/agent/proactive-engine.ts` — Where location-based and weather-based insights integrate
- `packages/core/agent/proactive-types.ts` — ProactiveInsight type union (you will extend this)
- `packages/core/autonomy/autonomy-types.ts` — AutonomyDomain union + ACTION_DOMAIN_MAP + ACTION_RISK_MAP
- `packages/core/platform/contacts-types.ts` — Reference for the PlatformAdapter extension pattern (Step 14)
- `packages/core/platform/messaging-types.ts` — Reference for the PlatformAdapter extension pattern (Step 15)
- `packages/core/platform/clipboard-types.ts` — Reference for the PlatformAdapter extension pattern (Step 15)
- `packages/core/reminders/reminder-store.ts` — Reminders infrastructure (location-tagged reminders extend this)
- `tests/privacy/contacts-privacy.test.ts` — Reference for the privacy test pattern
- `tests/privacy/clipboard-privacy.test.ts` — Reference for the privacy test pattern

---

## Why This Step Matters — The Moat Argument

Location is the capability that makes cloud AI structurally incapable of competing with Semblance.

ChatGPT cannot know you are near the hardware store. It cannot know traffic is heavy on your commute. It cannot know rain is coming for your outdoor meeting. It doesn't have your location. It *can't* have your location — not continuously, not contextually, not with the granularity that makes proactive intelligence useful.

Semblance can. And because location data never leaves the device, Semblance can be aggressively useful with it without the privacy tradeoffs that make users uncomfortable with Google or Apple's location tracking. The user gets "You're near Home Depot — you wanted lightbulbs" without that data ever touching a server.

This is also the first feature that combines THREE independent data sources: calendar (where your meeting is), location (where you are now), and web search / WeatherKit (travel time, weather forecast). This multi-source orchestration pattern is the foundation for the Morning Brief (Step 23) and every subsequent proactive feature. Get the pattern right here and it compounds.

**Privacy is existential for this step.** GPS coordinates in an audit trail, in a log, in a network request — any of these would be a catastrophic trust violation. Location data must be treated with the same rigor as financial data: locally stored, precision-reduced in logs, never transmitted, and always under user control.

---

## Scope Overview

| Section | Description | Test Target |
|---------|-------------|-------------|
| A | LocationAdapter + WeatherAdapter on PlatformAdapter | 8+ |
| B | Location Services — permission, storage, privacy | 12+ |
| C | Location-Tagged Reminders + Proximity Engine | 12+ |
| D | Weather Integration — WeatherKit (iOS) + Web Search (Android/Desktop) | 10+ |
| E | Commute-Aware Scheduling | 8+ |
| F | ProactiveEngine Integration + Autonomy Wiring | 8+ |
| G | Privacy Audit + UI | 7+ |

**Minimum 65 new tests. Target 70+.**

---

## Section A: PlatformAdapter Extensions

Follow the exact pattern from Steps 14 (ContactsAdapter) and 15 (MessagingAdapter, ClipboardAdapter). Two new optional fields on PlatformAdapter: `location` and `weather`.

### A1: LocationAdapter Interface

Create `packages/core/platform/location-types.ts`:

```typescript
// Location types — all coordinates stored locally, never transmitted

export interface LocationAdapter {
  /** Check if location permission has been granted */
  hasPermission(): Promise<boolean>;

  /** Request location permission from the OS. Returns whether permission was granted. */
  requestPermission(): Promise<boolean>;

  /** Get current device location. Returns null if permission denied or unavailable. */
  getCurrentLocation(): Promise<DeviceLocation | null>;

  /**
   * Start watching location changes. Callback fires on significant location change.
   * Returns a cleanup function to stop watching.
   * "Significant" means >100m movement or >5 min since last update (platform-determined).
   */
  watchLocation(callback: (location: DeviceLocation) => void): Promise<() => void>;

  /** Stop all location watching. Called on app background/shutdown. */
  stopWatching(): Promise<void>;

  /**
   * Estimate travel time from current location to destination.
   * iOS: Uses MapKit for local estimation (no Gateway).
   * Android/Desktop: Returns null (caller falls back to web search via Gateway).
   */
  estimateTravelTime?(
    destination: LocationCoordinate,
    mode: TravelMode
  ): Promise<TravelEstimate | null>;
}

export interface DeviceLocation {
  coordinate: LocationCoordinate;
  accuracy: number; // meters
  timestamp: number; // Unix ms
  speed?: number; // m/s, if available
  heading?: number; // degrees from north, if available
}

export interface LocationCoordinate {
  latitude: number;
  longitude: number;
}

export interface TravelEstimate {
  durationMinutes: number;
  distanceKm: number;
  mode: TravelMode;
  departBy?: number; // Unix ms — suggested departure time
}

export type TravelMode = 'driving' | 'walking' | 'transit';
```

### A2: WeatherAdapter Interface

Create `packages/core/platform/weather-types.ts`:

```typescript
// Weather types — iOS uses WeatherKit (no network), others use Gateway web search

export interface WeatherAdapter {
  /**
   * Get weather forecast for a location.
   * iOS: WeatherKit — pure local, no Gateway involvement.
   * Android/Desktop: Returns null (caller falls back to web search via Gateway).
   */
  getForecast(
    coordinate: LocationCoordinate,
    hours: number // how many hours ahead to forecast
  ): Promise<WeatherForecast | null>;

  /**
   * Get current weather conditions for a location.
   * Same platform split as getForecast.
   */
  getCurrentConditions(
    coordinate: LocationCoordinate
  ): Promise<WeatherConditions | null>;
}

export interface WeatherForecast {
  hourly: HourlyForecast[];
  source: 'weatherkit' | 'web-search';
}

export interface HourlyForecast {
  timestamp: number; // Unix ms
  temperature: number; // Celsius
  conditions: WeatherConditionType;
  precipitationChance: number; // 0-1
  windSpeed?: number; // km/h
  humidity?: number; // 0-1
}

export interface WeatherConditions {
  temperature: number; // Celsius
  conditions: WeatherConditionType;
  precipitationChance: number; // 0-1
  feelsLike?: number; // Celsius
  uvIndex?: number;
  windSpeed?: number; // km/h
  humidity?: number; // 0-1
  source: 'weatherkit' | 'web-search';
}

export type WeatherConditionType =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'rain'
  | 'heavy-rain'
  | 'snow'
  | 'thunderstorm'
  | 'fog'
  | 'windy'
  | 'unknown';
```

### A3: PlatformAdapter Extension

Add to `packages/core/platform/types.ts`:

```typescript
// Add to PlatformAdapter interface (alongside existing contacts?, messaging?, clipboard?)
location?: LocationAdapter;
weather?: WeatherAdapter;
```

### A4: Desktop Adapter Factories

Create `packages/core/platform/desktop-location.ts` and `packages/core/platform/desktop-weather.ts`:

- **Desktop LocationAdapter:** In dev/test mode, returns mock location data (configurable coordinates). In Tauri runtime, wraps the Tauri geolocation plugin (`@tauri-apps/plugin-geolocation`). `estimateTravelTime` returns null on desktop (falls back to web search).
- **Desktop WeatherAdapter:** Returns null for all methods on desktop. Desktop weather goes through the Gateway web search path, not through a native adapter.

Create `packages/mobile/src/native/location-bridge.ts` and `packages/mobile/src/native/weather-bridge.ts`:

- **Mobile LocationAdapter (iOS):** Wraps React Native Geolocation API. `estimateTravelTime` wraps MapKit's `MKDirections` via native bridge.
- **Mobile LocationAdapter (Android):** Wraps React Native Geolocation API. `estimateTravelTime` returns null (falls back to web search).
- **Mobile WeatherAdapter (iOS):** Wraps WeatherKit via native bridge. No Gateway involvement.
- **Mobile WeatherAdapter (Android):** Returns null for all methods (falls back to web search).

**Tests (8+):**
- LocationAdapter interface compliance: `hasPermission`, `requestPermission`, `getCurrentLocation` return correct types
- WeatherAdapter interface compliance: `getForecast`, `getCurrentConditions` return correct types
- Desktop location adapter returns mock data in dev mode
- Desktop weather adapter returns null (weather goes through Gateway on desktop)
- Permission denied → `getCurrentLocation` returns null gracefully
- `watchLocation` returns cleanup function; calling cleanup stops updates
- Location coordinate validation: reject NaN, reject out-of-range lat/lon
- Travel estimate returns null on platforms without MapKit

---

## Section B: Location Services — Permission, Storage, Privacy

### B1: LocationStore

Create `packages/core/location/location-store.ts`:

```typescript
/**
 * LocationStore manages on-device location data.
 *
 * PRIVACY INVARIANTS:
 * - Location data is NEVER transmitted via Gateway or any network path.
 * - Audit trail logs location-triggered events but NOT coordinates.
 *   Example: "Contextual reminder fired: Buy lightbulbs" — NOT "User at 45.5231, -122.6765"
 * - Stored coordinates are precision-reduced for history (3 decimal places ≈ 110m accuracy).
 *   Current location retains full precision in memory only — never persisted at full precision.
 * - Location history is capped (default: 7 days) and auto-purged.
 */
export class LocationStore {
  // SQLite table: location_history
  // Columns: id, latitude (3 decimal places), longitude (3 decimal places),
  //          accuracy_m, timestamp, created_at
  //
  // Methods:
  //   recordLocation(location: DeviceLocation): Promise<void>
  //     - Reduces precision to 3 decimal places before storage
  //     - Deduplicates: skip if <100m from last stored location and <5min elapsed
  //
  //   getRecentLocations(hours: number): Promise<StoredLocation[]>
  //     - Returns locations from the last N hours
  //
  //   getLastKnownLocation(): Promise<StoredLocation | null>
  //     - Returns most recent stored location
  //
  //   purgeOldLocations(daysToKeep: number): Promise<number>
  //     - Deletes locations older than N days. Returns count deleted.
  //     - Called automatically on app startup and daily.
  //
  //   clearAllLocations(): Promise<void>
  //     - Nuclear option. User can wipe all location history.
}
```

### B2: LocationPermissionManager

Create `packages/core/location/location-permission.ts`:

```typescript
/**
 * Manages location permission state and graceful degradation.
 *
 * All location-dependent features MUST check permission before attempting
 * to access location. If denied, features degrade:
 * - Contextual reminders: disabled (user sees "Enable location for contextual reminders")
 * - Weather: falls back to manual city entry or web search with user-specified location
 * - Commute awareness: disabled
 * - ProactiveEngine: skips all location-based insights
 */
export class LocationPermissionManager {
  // Methods:
  //   getPermissionState(): Promise<'granted' | 'denied' | 'not-requested'>
  //   requestIfNeeded(): Promise<boolean>
  //     - Only requests if state is 'not-requested'
  //     - Never re-requests after denial (respects OS convention)
  //   isLocationAvailable(): Promise<boolean>
  //     - Quick check: permission granted AND adapter available
}
```

### B3: LocationPrivacySanitizer

Create `packages/core/location/location-privacy.ts`:

```typescript
/**
 * Utility functions for location privacy.
 * Used by audit trail, ProactiveEngine, and any component that logs location events.
 */

/** Reduce coordinate precision to N decimal places */
export function reduceCoordinatePrecision(
  coord: LocationCoordinate,
  decimalPlaces: number
): LocationCoordinate;

/** Mask coordinates for audit trail — returns area name if available, "near [landmark]" otherwise */
export function maskLocationForAudit(
  coord: LocationCoordinate,
  label?: string
): string;
// Example outputs:
//   "near Home Depot" (if label provided from geofence)
//   "home area" (if near stored home location)
//   "location-based" (fallback — never exposes coordinates)

/** Validate that a coordinate is within valid ranges */
export function isValidCoordinate(coord: LocationCoordinate): boolean;

/** Calculate distance between two coordinates in meters (Haversine formula) */
export function distanceMeters(a: LocationCoordinate, b: LocationCoordinate): number;
```

**Tests (12+):**
- `reduceCoordinatePrecision` to 3 decimal places: input 45.52312345 → output 45.523
- `reduceCoordinatePrecision` handles negative coordinates correctly
- `maskLocationForAudit` with label returns "near [label]", never coordinates
- `maskLocationForAudit` without label returns generic "location-based", never coordinates
- `isValidCoordinate` rejects latitude > 90 or < -90
- `isValidCoordinate` rejects longitude > 180 or < -180
- `isValidCoordinate` rejects NaN
- `distanceMeters` known pair: Portland (45.5231, -122.6765) to Seattle (47.6062, -122.3321) ≈ 233km (±5%)
- `distanceMeters` identical points → 0
- LocationStore: `recordLocation` reduces precision before storage (query back and verify 3 decimal places)
- LocationStore: deduplication — two locations <100m apart within 5 min → only one stored
- LocationStore: `purgeOldLocations` deletes entries older than threshold
- LocationStore: `clearAllLocations` leaves zero rows
- LocationPermissionManager: `requestIfNeeded` does not re-request after denial

---

## Section C: Location-Tagged Reminders + Proximity Engine

### C1: Location-Tagged Reminders

Extend the existing reminders infrastructure (`packages/core/reminders/reminder-store.ts`):

```typescript
// Add to existing Reminder interface:
export interface Reminder {
  // ... existing fields (id, text, due_datetime, recurrence, status, created_at, source)

  // NEW — location-tagged reminders
  locationTrigger?: LocationTrigger;
}

export interface LocationTrigger {
  coordinate: LocationCoordinate; // Where to trigger (precision-reduced for storage)
  radiusMeters: number;           // Proximity radius (default: 200m)
  label: string;                  // Human-readable place name ("Home Depot on 185th")
  armed: boolean;                 // Whether this trigger is currently active
}
```

Update the reminders SQLite schema to include location trigger fields. Migration adds columns: `location_lat`, `location_lon`, `location_radius`, `location_label`, `location_armed`.

### C2: ProximityEngine

Create `packages/core/location/proximity-engine.ts`:

```typescript
/**
 * ProximityEngine checks if the user's current location is near any armed
 * location-tagged reminders. Called on each significant location update.
 *
 * This is NOT a full geofencing SDK. It is a lightweight proximity checker:
 * 1. Get all armed location-tagged reminders
 * 2. For each, compute distance from current location to trigger coordinate
 * 3. If distance < radiusMeters, fire the reminder
 * 4. Mark the reminder as fired (don't re-fire)
 *
 * Performance: for personal scale (<100 location-tagged reminders),
 * iterating all of them on each location update is negligible.
 */
export class ProximityEngine {
  constructor(
    private reminderStore: ReminderStore,
    private locationStore: LocationStore,
    private auditTrail: AuditTrail
  ) {}

  /**
   * Check proximity against all armed location-tagged reminders.
   * Returns reminders that fired (for notification dispatch).
   */
  async checkProximity(currentLocation: DeviceLocation): Promise<Reminder[]>;

  /**
   * Arm/disarm a location trigger on a specific reminder.
   */
  async setTriggerArmed(reminderId: string, armed: boolean): Promise<void>;
}
```

### C3: Natural Language Location Parsing

Extend the existing LLM-based reminder parser to handle location-tagged reminders:

- "Remind me to buy lightbulbs when I'm near Home Depot" → location-tagged reminder with geocoded coordinates for nearby Home Depot
- "Remind me to return the book next time I'm at the library" → location-tagged reminder
- "Remind me about the prescription at Walgreens" → location-tagged reminder

Geocoding for the place name ("Home Depot", "the library", "Walgreens"):
- **iOS:** Use MapKit's `MKLocalSearch` to find the nearest matching place. Pure local — no Gateway.
- **Android/Desktop:** Use web search via Gateway: `"Home Depot near [user's city/area]"` → extract coordinates from results.
- **Fallback:** If geocoding fails, create a time-based reminder instead and inform the user: "I couldn't find that location — I've set this as a regular reminder instead."

The LLM determines whether a reminder is time-based or location-based. If location-based, extract the place name and pass to geocoding. This is a prompt engineering task — add location detection to the existing reminder parsing prompt.

### C4: GeocodingService

Create `packages/core/location/geocoding-service.ts`:

```typescript
/**
 * Resolves place names to coordinates.
 *
 * iOS: MapKit MKLocalSearch (local, no Gateway).
 * Android/Desktop: Web search via Gateway (Brave Search).
 * Fallback: null if place cannot be resolved.
 */
export class GeocodingService {
  constructor(
    private platform: PlatformAdapter,
    private gateway?: GatewayClient // only for web search fallback
  ) {}

  /**
   * Search for a place near the user's current or last known location.
   * Returns the best match or null.
   */
  async findPlace(
    query: string,
    nearLocation?: LocationCoordinate
  ): Promise<GeocodedPlace | null>;
}

export interface GeocodedPlace {
  name: string;
  coordinate: LocationCoordinate;
  address?: string;
  source: 'mapkit' | 'web-search';
}
```

Add `geocode` optional method to LocationAdapter for platforms with native geocoding (iOS MapKit):

```typescript
// Add to LocationAdapter interface
geocode?(query: string, near?: LocationCoordinate): Promise<GeocodedPlace | null>;
```

**Tests (12+):**
- Location-tagged reminder created with correct coordinate and radius
- Location-tagged reminder stored with precision-reduced coordinates
- ProximityEngine: user within radius → reminder fires
- ProximityEngine: user outside radius → reminder does not fire
- ProximityEngine: fired reminder is marked as fired (no re-fire)
- ProximityEngine: disarmed trigger is skipped
- ProximityEngine: handles zero armed reminders gracefully (no crash, no wasted work)
- Natural language: "Remind me to buy milk near Safeway" → location-tagged reminder (mocked LLM)
- Natural language: "Remind me at 3pm to call Sarah" → time-based reminder (NOT location-tagged)
- GeocodingService: iOS path returns result from MapKit geocode
- GeocodingService: non-iOS path falls back to web search via Gateway
- GeocodingService: failed geocoding returns null gracefully
- Proximity check fires audit trail event with masked location (no coordinates in log)

---

## Section D: Weather Integration

### D1: WeatherService

Create `packages/core/weather/weather-service.ts`:

```typescript
/**
 * Unified weather service that abstracts the platform split:
 * - iOS: WeatherAdapter (WeatherKit) — no Gateway, no network, pure local
 * - Android/Desktop: Web search via Gateway — "weather in [city/area]"
 *
 * The service tries the native adapter first. If null (not iOS or not available),
 * falls back to web search.
 */
export class WeatherService {
  constructor(
    private platform: PlatformAdapter,
    private gateway: GatewayClient,
    private locationStore: LocationStore
  ) {}

  /**
   * Get current weather. Uses device location if available,
   * otherwise uses last known location or user-configured city.
   */
  async getCurrentWeather(): Promise<WeatherConditions | null>;

  /**
   * Get forecast for the next N hours.
   */
  async getForecast(hours: number): Promise<WeatherForecast | null>;

  /**
   * Get weather for a specific time (for calendar event weather).
   * Returns the closest hourly forecast entry.
   */
  async getWeatherAt(
    timestamp: number,
    location?: LocationCoordinate
  ): Promise<HourlyForecast | null>;
}
```

### D2: Web Search Weather Fallback

Create `packages/core/weather/weather-web-fallback.ts`:

```typescript
/**
 * Fetches weather via web search for platforms without WeatherKit.
 *
 * Strategy:
 * 1. Determine location label: use reverse-geocoded city name if available,
 *    or user-configured city, or "current location weather"
 * 2. Web search query: "weather [city] today forecast"
 * 3. Parse search results into WeatherConditions / WeatherForecast structure
 * 4. Cache results for 30 minutes (weather doesn't change that fast)
 *
 * All web searches go through the Gateway. Every search visible in Network Monitor.
 * This follows the existing web.search ActionType from Step 10.
 */
export class WeatherWebFallback {
  constructor(private gateway: GatewayClient) {}

  async fetchCurrentWeather(locationLabel: string): Promise<WeatherConditions | null>;
  async fetchForecast(locationLabel: string, hours: number): Promise<WeatherForecast | null>;
}
```

### D3: WeatherCache

Create `packages/core/weather/weather-cache.ts`:

```typescript
/**
 * Simple in-memory cache for weather data.
 * TTL: 30 minutes for current conditions, 60 minutes for forecast.
 * Keyed by precision-reduced coordinates (3 decimal places).
 * Prevents redundant WeatherKit calls and web searches.
 */
export class WeatherCache {
  get(key: string): CachedWeather | null;
  set(key: string, data: WeatherConditions | WeatherForecast, ttlMs: number): void;
  invalidate(key: string): void;
  clear(): void;
}
```

### D4: Orchestrator Weather Tool

Wire a `weather` tool into the Orchestrator so the user can ask weather questions in chat:

- "What's the weather today?" → WeatherService.getCurrentWeather()
- "Will it rain this afternoon?" → WeatherService.getForecast(12) → check precipitationChance
- "What's the weather in Portland?" → WeatherService with specified city (web search path)

This follows the existing tool-use pattern in the Orchestrator. New tool: `get_weather`.

**Tests (10+):**
- WeatherService: iOS path uses WeatherAdapter (not web search)
- WeatherService: Android/desktop path uses web search fallback
- WeatherService: returns null gracefully when both paths fail
- WeatherWebFallback: constructs correct web search query
- WeatherWebFallback: caches results (second call within TTL doesn't fire web search)
- WeatherCache: returns null after TTL expiry
- WeatherCache: key is precision-reduced (same area = cache hit)
- Orchestrator: "What's the weather?" routes to get_weather tool
- Orchestrator: weather tool result formatted for chat display
- Weather data never stored with full-precision coordinates
- Weather web search goes through Gateway (visible in Network Monitor)

---

## Section E: Commute-Aware Scheduling

### E1: CommuteAnalyzer

Create `packages/core/location/commute-analyzer.ts`:

```typescript
/**
 * CommuteAnalyzer combines calendar + location + travel time estimation
 * to produce departure time suggestions.
 *
 * This is the first feature in Semblance that fuses THREE data sources.
 * The pattern established here is reused by the Morning Brief (Step 23).
 *
 * Flow:
 * 1. Read upcoming calendar events (next 24 hours)
 * 2. Filter to events with a location field
 * 3. For each: get user's current/last-known location
 * 4. Estimate travel time:
 *    a. iOS: LocationAdapter.estimateTravelTime (MapKit)
 *    b. Android/Desktop: Web search via Gateway "[origin city] to [destination] drive time"
 *    c. Fallback: heuristic estimate (assume 30 min for local, 60 min for non-local)
 * 5. Subtract travel time + buffer (15 min default) from event start time → departure time
 * 6. If departure time is within 2 hours, generate a proactive insight
 *
 * Calendar event locations are free-text. Geocoding them is best-effort:
 * - If it looks like an address, geocode it
 * - If it's a building/room name ("Conference Room B"), skip commute analysis
 * - If it's a virtual meeting (contains "zoom.us", "teams.microsoft.com", etc.), skip entirely
 */
export class CommuteAnalyzer {
  constructor(
    private calendarStore: CalendarStore,
    private locationStore: LocationStore,
    private geocodingService: GeocodingService,
    private platform: PlatformAdapter,
    private gateway: GatewayClient
  ) {}

  /**
   * Analyze upcoming events and produce departure suggestions.
   * Returns insights for events where a departure suggestion is relevant.
   */
  async analyzeUpcomingCommutes(): Promise<CommuteInsight[]>;
}

export interface CommuteInsight {
  calendarEventId: string;
  eventTitle: string;
  eventStartTime: number; // Unix ms
  destination: string; // Human-readable
  estimatedTravelMinutes: number;
  suggestedDepartureTime: number; // Unix ms
  travelMode: TravelMode;
  weatherAtDestination?: HourlyForecast; // Weather at event time at destination
  source: 'mapkit' | 'web-search' | 'heuristic';
}
```

### E2: Virtual Meeting Detection

Create `packages/core/location/virtual-meeting-detector.ts`:

```typescript
/**
 * Detects whether a calendar event is a virtual meeting.
 * Virtual meetings don't need commute analysis.
 *
 * Detection signals:
 * - Location field contains known virtual meeting URLs (zoom.us, teams.microsoft.com, meet.google.com, etc.)
 * - Location field contains "virtual", "online", "remote"
 * - Description/notes contain meeting links
 * - No location field at all (ambiguous — skip commute analysis)
 */
export function isVirtualMeeting(event: CalendarEvent): boolean;
```

**Tests (8+):**
- CommuteAnalyzer: event with physical address → produces departure suggestion
- CommuteAnalyzer: event with Zoom link in location → skipped (virtual meeting)
- CommuteAnalyzer: event with no location → skipped
- CommuteAnalyzer: event >24 hours away → not analyzed
- CommuteAnalyzer: departure suggestion = event time - travel time - buffer
- CommuteAnalyzer: weather at destination included when available
- `isVirtualMeeting`: Zoom URL → true
- `isVirtualMeeting`: Google Meet URL → true
- `isVirtualMeeting`: "123 Main St, Portland" → false
- `isVirtualMeeting`: "Conference Room B" → false (not virtual, but geocoding may fail → commute skipped naturally)
- Travel time estimation: iOS uses MapKit, non-iOS falls back to web search/heuristic

---

## Section F: ProactiveEngine Integration + Autonomy Wiring

### F1: New ProactiveInsight Types

Add to `ProactiveInsight.type` union:

```typescript
| 'location-reminder'      // "You're near Home Depot — you wanted lightbulbs"
| 'weather-alert'          // "Rain expected during your 2pm meeting"
| 'commute-departure'      // "Leave by 1:15 for your 2pm meeting — traffic is heavy"
| 'weather-summary'        // "Today: 68°F, partly cloudy, rain likely after 3pm"
```

### F2: LocationInsightTracker + WeatherInsightTracker

Create `packages/core/location/location-insight-tracker.ts`:

Follow the BirthdayTracker and ContactFrequencyMonitor patterns from Step 14.

```typescript
/**
 * LocationInsightTracker:
 * - On each significant location update, runs ProximityEngine
 * - If a reminder fires, generates a 'location-reminder' insight
 *
 * WeatherInsightTracker:
 * - Periodically (every 2 hours or on app foreground) checks weather
 * - If precipitation expected during an upcoming calendar event, generates 'weather-alert'
 * - Generates daily 'weather-summary' insight for the Morning Brief foundation
 *
 * Both are optional instances passed to ProactiveEngine constructor.
 * ProactiveEngine.run() calls their check methods.
 */
```

### F3: Autonomy Domain Extension

Add `location` domain to the autonomy system. **ALL of these updates must happen in the SAME commit:**

1. Add `'location'` to `AutonomyDomain` union type
2. Update `ACTION_DOMAIN_MAP` with location-related action types
3. Update `ACTION_RISK_MAP`:
   - `location.reminder_fire` → low risk (notification only)
   - `location.commute_alert` → low risk (notification only)
   - `location.weather_query` → low risk (informational)
4. Update `getConfig()` domains array to include `location`

Default autonomy for location domain: **Partner** (routine notifications autonomous, novel actions require approval).

New action types for the audit trail:
- `location.reminder_fire` — a location-tagged reminder triggered
- `location.commute_alert` — a departure time suggestion was surfaced
- `location.weather_query` — a weather query was answered

**CRITICAL:** Audit trail entries for location actions must use `maskLocationForAudit()`. The audit trail records WHAT happened ("Contextual reminder fired: Buy lightbulbs") but NEVER WHERE ("at coordinates 45.523, -122.677").

### F4: Orchestrator Wiring

Wire into the Orchestrator:
- `get_weather` tool (Section D4)
- `set_location_reminder` tool: creates a location-tagged reminder from chat
- Location context injection: when the user asks about nearby places or commute, inject current location context into the LLM prompt

**Tests (8+):**
- LocationInsightTracker: proximity match generates 'location-reminder' insight
- WeatherInsightTracker: rain during upcoming event generates 'weather-alert' insight
- WeatherInsightTracker: generates daily 'weather-summary' insight
- Autonomy domain 'location' added — `getConfig()` includes it
- ACTION_DOMAIN_MAP includes all location action types
- ACTION_RISK_MAP classifies location actions correctly
- Audit trail entry for location.reminder_fire contains masked location (no coordinates)
- Audit trail entry for location.weather_query does not contain coordinates
- ProactiveEngine.run() calls LocationInsightTracker and WeatherInsightTracker
- Orchestrator routes "What's the weather?" to get_weather tool

---

## Section G: Privacy Audit + UI

### G1: Location Privacy Test Suite

Create `tests/privacy/location-privacy.test.ts`:

Follow the patterns from `contacts-privacy.test.ts` and `clipboard-privacy.test.ts`.

```typescript
describe('Location Privacy Guarantees', () => {
  // Scan packages/core/location/ source files
  it('location module has zero network imports');
  it('location module has zero Gateway imports');
  it('location module has zero fetch/http/https imports');

  // Scan audit trail integration
  it('audit trail entries for location events contain no raw coordinates');

  // Verify LocationStore
  it('stored locations have precision-reduced coordinates (3 decimal places max)');
  it('location history auto-purges entries older than retention period');

  // Verify ProximityEngine
  it('proximity check does not transmit location data');
  it('proximity check audit entry uses maskLocationForAudit');
});
```

### G2: UI — Location Settings

Desktop: Add to Settings screen (follow existing Settings pattern):

- **Location Services** section:
  - Toggle: "Enable location services" (with permission request flow)
  - Current permission status indicator
  - "Location-based reminders" toggle (requires location enabled)
  - "Commute awareness" toggle (requires location enabled)
  - "Weather" toggle (works without location — falls back to configured city)
  - "Default city" text input (for weather when location is unavailable)
  - "Location history" with "Clear location history" button
  - Retention period: dropdown (1 day, 3 days, 7 days, 30 days)

Mobile: Add corresponding location settings section in mobile Settings.

### G3: UI — Weather Card

Add a weather card component for the Universal Inbox / ProactiveInsight display:

- Shows current conditions with icon, temperature, conditions text
- Shows relevant forecast for upcoming events: "Rain likely at 3pm during your meeting"
- Commute departure card: "Leave by 1:15pm for your 2pm meeting at Portland Office — 35 min drive, light rain expected"
- Location-triggered reminder notification: "You're near Home Depot — buy lightbulbs (reminder from Tuesday)"

All UI components must conform to the Trellis design system. Read `/docs/DESIGN_SYSTEM.md` for color tokens, typography, spacing, and component patterns.

**Tests (7+):**
- Privacy test: location source files have zero network imports
- Privacy test: audit trail entries contain no raw coordinates (scan for coordinate regex pattern)
- Privacy test: LocationStore stores only precision-reduced coordinates
- Settings UI: location toggle respects permission state
- Settings UI: weather works with configured city when location unavailable
- Weather card renders current conditions
- Commute card shows departure time and weather

---

## Commit Strategy

10 commits. Each compiles, passes all tests, and leaves the codebase in a working state.

| Commit | Section | Description | Tests |
|--------|---------|-------------|-------|
| 1 | A | LocationAdapter + WeatherAdapter interfaces + PlatformAdapter extension | 8+ |
| 2 | B | LocationStore + LocationPermissionManager + LocationPrivacySanitizer | 12+ |
| 3 | C1-C2 | Location-tagged reminders schema + ProximityEngine | 7+ |
| 4 | C3-C4 | GeocodingService + natural language location reminder parsing | 6+ |
| 5 | D | WeatherService + WeatherWebFallback + WeatherCache + Orchestrator weather tool | 10+ |
| 6 | E | CommuteAnalyzer + VirtualMeetingDetector | 8+ |
| 7 | F | ProactiveEngine integration + autonomy domain + audit trail wiring | 8+ |
| 8 | G1 | Location privacy test suite | 4+ |
| 9 | G2-G3 | Location settings UI + weather card + commute card (desktop + mobile) | 5+ |
| 10 | ALL | Final integration: end-to-end flow test, TypeScript clean check, stub verification | 4+ |

**Minimum 65 new tests. Target: 72+.**

---

## Exit Criteria

Step 16 is complete when ALL of the following are true. No exceptions. No deferrals.

### Location Services (A + B)
1. ☐ LocationAdapter and WeatherAdapter added to PlatformAdapter as separate optional fields
2. ☐ Location permission requested and respected on all platforms
3. ☐ Permission denied → all location features degrade gracefully (no crash, no broken UI)
4. ☐ Location data stored with precision-reduced coordinates (3 decimal places max)
5. ☐ Location history auto-purges based on configured retention period
6. ☐ `clearAllLocations()` wipes all stored location data

### Location-Tagged Reminders (C)
7. ☐ Location-tagged reminders stored with coordinate, radius, and label
8. ☐ ProximityEngine fires reminders when user enters radius
9. ☐ Fired reminders are marked as fired (no re-fire on subsequent location updates)
10. ☐ Natural language "remind me near [place]" creates location-tagged reminder (mocked LLM)
11. ☐ GeocodingService resolves place names: iOS via MapKit, others via web search

### Weather (D)
12. ☐ WeatherService returns weather: iOS via WeatherAdapter (WeatherKit), others via web search
13. ☐ Weather web search goes through Gateway (visible in Network Monitor)
14. ☐ Weather results cached (no redundant web searches within TTL)
15. ☐ Orchestrator `get_weather` tool answers weather queries in chat

### Commute Awareness (E)
16. ☐ CommuteAnalyzer produces departure time suggestions for calendar events with locations
17. ☐ Virtual meetings (Zoom, Teams, Meet) correctly skipped
18. ☐ Weather at destination included in commute insight when available

### ProactiveEngine + Autonomy (F)
19. ☐ `location` autonomy domain added with all maps updated atomically
20. ☐ LocationInsightTracker and WeatherInsightTracker wired into ProactiveEngine
21. ☐ `location-reminder`, `weather-alert`, `commute-departure`, `weather-summary` insight types functional
22. ☐ All location action types logged in audit trail with masked coordinates

### Privacy (G — THE MOST IMPORTANT SECTION)
23. ☐ Privacy test suite: zero network imports in `packages/core/location/`
24. ☐ Privacy test suite: zero Gateway imports in `packages/core/location/`
25. ☐ Audit trail for location events contains NO raw coordinates (verified by regex scan)
26. ☐ Location data NEVER transmitted via Gateway or any network path
27. ☐ WeatherKit path (iOS) uses ZERO Gateway involvement
28. ☐ Privacy audit clean — all existing privacy tests still pass

### Tests + Compilation
29. ☐ `npx tsc --noEmit` → zero errors
30. ☐ All existing 2,879 tests pass — zero regressions
31. ☐ 65+ new tests from this step
32. ☐ Total test suite passes with zero failures

**All 32 criteria must be marked PASS. Step 16 does not close until every line is checked.**

---

## Approved Dependencies

### New (if needed)
- `@tauri-apps/plugin-geolocation` — Tauri geolocation plugin (desktop location, Tauri runtime only)
- No other new production dependencies should be needed

### Pre-approved (already in project)
- `zod` — schema validation for location/weather data structures
- `date-fns` — date handling for commute time calculations
- `better-sqlite3` — SQLite for LocationStore and reminder schema extension
- `nanoid` — ID generation for location records

### NOT Approved
- Any third-party weather API SDK (OpenWeatherMap, AccuWeather, etc.) — weather goes through WeatherKit or web search
- Any third-party geolocation SDK beyond Tauri plugin — use platform APIs
- Any geofencing SDK (Google Geofencing API, Core Location regions) — ProximityEngine is lightweight and custom
- Any cloud geocoding service SDK (Google Maps SDK, Mapbox) — geocoding goes through MapKit or web search
- Any analytics or telemetry package
- Any networking library that bypasses the Gateway

---

## Autonomous Decision Authority

You may proceed without escalating for:
- Choosing the exact Tauri geolocation plugin version
- Weather data parsing heuristics from web search results
- Commute buffer time defaults (suggested: 15 min)
- Location history retention period defaults (suggested: 7 days)
- Proximity radius defaults for location-tagged reminders (suggested: 200m)
- WeatherCache TTL values (suggested: 30 min current, 60 min forecast)
- UI layout decisions within the Trellis design system
- Virtual meeting URL patterns to detect
- Geocoding query formatting for web search path
- Coordinate precision reduction implementation (rounding vs. truncation — use rounding)

## Escalation Triggers — STOP and Report

You MUST stop and report back to Orbital Directors if:
- The Tauri geolocation plugin doesn't exist or doesn't support the APIs needed → need alternative approach
- WeatherKit native bridge for React Native requires an architecture change to the mobile app
- Location permission flow on any platform requires modifications to PlatformAdapter guard tests
- Geocoding quality from web search is too poor to be useful for proximity matching → need to evaluate alternatives
- Any change would require network access in `packages/core/` (RULE 1 VIOLATION — NEVER PROCEED)
- Autonomy domain extension causes type regressions in more than 3 files → need targeted remediation plan
- Location-tagged reminders require changes to the existing Reminder interface that would break Step 10's tests
- Performance: proximity check on 100 reminders takes >100ms → need optimization discussion
- Any uncertainty about whether location data might leak into audit trail, logs, or network requests

---

## Verification Requirements

When the step is complete, provide the following raw command output (not summaries — actual terminal output):

```bash
# 1. Commits
git log --oneline -12

# 2. TypeScript clean
npx tsc --noEmit
echo "EXIT_CODE=$?"

# 3. Test count
npx vitest run 2>&1 | tail -20

# 4. Feature verification — real implementations exist
wc -l packages/core/location/location-store.ts
wc -l packages/core/location/proximity-engine.ts
wc -l packages/core/location/commute-analyzer.ts
wc -l packages/core/weather/weather-service.ts
wc -l packages/core/weather/weather-web-fallback.ts
wc -l packages/core/location/location-privacy.ts
wc -l packages/core/location/geocoding-service.ts

# 5. Privacy verification — CRITICAL
grep -rn "fetch\|http\|https\|XMLHttpRequest\|WebSocket" packages/core/location/ || echo "CLEAN: zero network in location module"
grep -rn "fetch\|http\|https\|XMLHttpRequest\|WebSocket" packages/core/weather/ || echo "CLEAN: zero network in weather module"
grep -rn "gateway" packages/core/location/ || echo "CLEAN: zero gateway in location module"

# 6. Audit trail privacy — no coordinates in log messages
grep -rn "latitude\|longitude\|\.lat\b\|\.lon\b\|\.lng\b\|coordinate" packages/core/location/ | grep -i "audit\|log\|trail" || echo "CLEAN: no coordinate references in audit/log code"

# 7. Stub/placeholder check
grep -rn "TODO\|PLACEHOLDER\|FIXME\|stub\|mock" packages/core/location/ packages/core/weather/ | grep -v "test\|spec\|\.test\." | grep -v "// TODO: Tauri" | grep -v "// TODO: React Native"

# 8. Autonomy domain verification
grep -n "'location'" packages/core/autonomy/autonomy-types.ts
grep -n "location" packages/core/autonomy/autonomy-types.ts | head -10
```

---

## Completion Report

When finished, provide:

```
## Step 16 — Completion Report

### Section A: PlatformAdapter Extensions
| Item | Status | Evidence |
|------|--------|----------|
| LocationAdapter interface | PASS/FAIL | File exists, methods typed |
| WeatherAdapter interface | PASS/FAIL | File exists, methods typed |
| PlatformAdapter extended | PASS/FAIL | Both fields present as optional |
| Desktop adapters | PASS/FAIL | Mock for dev, Tauri wiring for runtime |
| Mobile bridges | PASS/FAIL | iOS + Android platform split handled |

### Section B: Location Services
| Item | Status | Evidence |
|------|--------|----------|
| LocationStore | PASS/FAIL | SQLite storage with precision reduction |
| Permission manager | PASS/FAIL | Graceful degradation verified |
| Privacy sanitizer | PASS/FAIL | Haversine distance, coordinate masking |

### Section C: Location-Tagged Reminders
| Item | Status | Evidence |
|------|--------|----------|
| Reminder schema extended | PASS/FAIL | Migration applied |
| ProximityEngine | PASS/FAIL | Fires within radius, skips outside |
| Natural language parsing | PASS/FAIL | "near [place]" → location reminder |
| GeocodingService | PASS/FAIL | MapKit (iOS) / web search fallback |

### Section D: Weather
| Item | Status | Evidence |
|------|--------|----------|
| WeatherService | PASS/FAIL | Platform-aware routing |
| Web search fallback | PASS/FAIL | Gateway path, cached |
| Orchestrator tool | PASS/FAIL | Chat weather queries work |

### Section E: Commute Awareness
| Item | Status | Evidence |
|------|--------|----------|
| CommuteAnalyzer | PASS/FAIL | Departure suggestions generated |
| Virtual meeting detection | PASS/FAIL | Zoom/Teams/Meet skipped |

### Section F: ProactiveEngine + Autonomy
| Item | Status | Evidence |
|------|--------|----------|
| Autonomy domain | PASS/FAIL | Union + maps updated atomically |
| Insight trackers | PASS/FAIL | Wired into ProactiveEngine |
| Audit trail | PASS/FAIL | Masked coordinates verified |

### Section G: Privacy + UI
| Item | Status | Evidence |
|------|--------|----------|
| Privacy test suite | PASS/FAIL | Zero network in location/weather core |
| Audit trail scan | PASS/FAIL | No raw coordinates in log entries |
| Settings UI | PASS/FAIL | Location + weather toggles |
| Weather/commute cards | PASS/FAIL | Trellis-compliant |

### Test Summary
- Previous: 2,879
- New: [number]
- Total: [number]
- Failures: 0

### Escalation Triggers Hit
- [None / description]

### Decisions Made
- [Any autonomous decisions and rationale]
```

---

## The Bar

This is the most privacy-sensitive capability Semblance has implemented. When this step closes:

- A user with location enabled gets a notification: "You're near Home Depot — you wanted lightbulbs." They didn't open the app. They didn't ask. Their AI knew where they were, knew what they needed, and told them at exactly the right moment. And their GPS coordinates never left their device.

- A user checks the weather in chat. On iOS, the response comes from WeatherKit — zero network, zero Gateway, zero audit trail of the query beyond "weather checked." On Android, it goes through the Gateway via web search — visible in Network Monitor, logged in the audit trail, but still no location data transmitted.

- A user has a meeting at 2pm across town. At 12:45pm, Semblance says: "Leave by 1:15 for your 2pm at Portland Office — 35 min drive, light rain expected." Three data sources fused. Calendar knew the meeting. Location knew where they were. Weather/MapKit/web search estimated the travel time and conditions. All local. All private.

- A privacy auditor inspects the audit trail. They find "Contextual reminder fired: Buy lightbulbs" and "Commute alert: leave by 1:15pm." They do not find a single GPS coordinate anywhere in the audit trail. Because the system was designed so that location data exists only where it's needed and nowhere else.

No cloud AI can do any of this. Not because they lack the technology. Because they don't have your location, your calendar, your reminders, and your trust — all at the same time, all on your device.

That's the moat. Build it right.
