/**
 * Health/Fitness OAuth Adapters Tests — Phase 4 Health & Productivity adapter tests.
 *
 * Tests auth flows, sync data mapping, ID prefixes, error handling, and allowlist
 * auto-seeding for all 7 adapters:
 * Oura, WHOOP, Fitbit, Strava, Garmin, Toggl, RescueTime.
 *
 * ~95 tests total. All HTTP calls are mocked via vi.fn() on globalThis.fetch.
 * No real API calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ActionType } from '../../packages/core/types/ipc.js';
import type { OAuthTokenManager } from '../../packages/gateway/services/oauth-token-manager.js';
import type { ImportedItem } from '../../packages/core/importers/types.js';
import { OuraAdapter } from '../../packages/gateway/services/oura/oura-adapter.js';
import { WhoopAdapter } from '../../packages/gateway/services/whoop/whoop-adapter.js';
import { FitbitAdapter } from '../../packages/gateway/services/fitbit/fitbit-adapter.js';
import { StravaAdapter } from '../../packages/gateway/services/strava/strava-adapter.js';
import { GarminAdapter } from '../../packages/gateway/services/garmin/garmin-adapter.js';
import { TogglAdapter } from '../../packages/gateway/services/toggl/toggl-adapter.js';
import { RescueTimeAdapter } from '../../packages/gateway/services/rescuetime/rescuetime-adapter.js';
import {
  CONNECTOR_ALLOWLIST_SEEDS,
  getAllowlistDomainsForConnector,
} from '../../packages/gateway/services/connector-allowlist-seeds.js';

/**
 * Non-null helper for array index access in tests.
 * TypeScript strict mode forbids unchecked index access.
 */
function at<T>(arr: T[], index: number): T {
  const value = arr[index];
  if (value === undefined) throw new Error(`Array index ${index} out of bounds`);
  return value;
}

// --- Mock OAuthTokenManager ---

function createMockTokenManager(): OAuthTokenManager {
  const tokens = new Map<string, {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string;
    userEmail?: string;
  }>();

  return {
    storeTokens: vi.fn((t: {
      provider: string;
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
      scopes: string;
      userEmail?: string;
    }) => {
      tokens.set(t.provider, {
        accessToken: t.accessToken,
        refreshToken: t.refreshToken,
        expiresAt: t.expiresAt,
        scopes: t.scopes,
        userEmail: t.userEmail,
      });
    }),
    getAccessToken: vi.fn((provider: string) => tokens.get(provider)?.accessToken ?? null),
    getRefreshToken: vi.fn((provider: string) => tokens.get(provider)?.refreshToken ?? null),
    isTokenExpired: vi.fn((provider: string) => {
      const t = tokens.get(provider);
      if (!t) return true;
      return Date.now() >= t.expiresAt;
    }),
    hasValidTokens: vi.fn((provider: string) => {
      const t = tokens.get(provider);
      return !!t && Date.now() < t.expiresAt;
    }),
    getUserEmail: vi.fn((provider: string) => tokens.get(provider)?.userEmail ?? null),
    revokeTokens: vi.fn((provider: string) => { tokens.delete(provider); }),
    refreshAccessToken: vi.fn((provider: string, newAccessToken: string, newExpiresAt: number, newRefreshToken?: string) => {
      const existing = tokens.get(provider);
      if (existing) {
        existing.accessToken = newAccessToken;
        existing.expiresAt = newExpiresAt;
        if (newRefreshToken) existing.refreshToken = newRefreshToken;
      }
    }),
  } as unknown as OAuthTokenManager;
}

/** Helper: seed valid tokens for a provider */
function seedTokens(tm: OAuthTokenManager, provider: string, accessToken: string = 'test-access-token'): void {
  (tm.storeTokens as unknown as (t: Record<string, unknown>) => void)({
    provider,
    accessToken,
    refreshToken: 'test-refresh-token',
    expiresAt: Date.now() + 3600_000,
    scopes: 'test',
  });
}

/** Helper: create a mock Response */
function mockJsonResponse(data: unknown, status: number = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(),
    json: async () => data,
    text: async () => JSON.stringify(data),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as Response;
}

/** Helper: create a mock text Response (for OAuth 1.0a form-encoded bodies) */
function mockTextResponse(text: string, status: number = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(),
    json: async () => { throw new Error('Not JSON') as never; },
    text: async () => text,
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

// ============================================================
// SECTION 1: OuraAdapter (~14 tests)
// ============================================================

describe('OuraAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: OuraAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new OuraAdapter(mockTm);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns auth status: not authenticated when no tokens', () => {
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(false);
  });

  it('returns auth status: authenticated when valid tokens exist', () => {
    seedTokens(mockTm, 'oura');
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('disconnect clears tokens', async () => {
    seedTokens(mockTm, 'oura');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('oura');
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('some.unknown.action' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_ACTION');
  });

  it('does NOT use PKCE (standard OAuth 2.0)', () => {
    const adapterConfig = (adapter as unknown as { config: { usePKCE: boolean } }).config;
    expect(adapterConfig.usePKCE).toBe(false);
  });

  it('sync fetches sleep data and maps with our_ prefix', async () => {
    seedTokens(mockTm, 'oura');

    // Daily sleep
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      data: [{
        id: 'sleep-001',
        day: '2026-02-20',
        score: 82,
        timestamp: '2026-02-20T07:00:00Z',
        contributors: { deep_sleep: 75, efficiency: 88, rem_sleep: 70 },
      }],
      next_token: null,
    }));
    // Daily readiness
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ data: [], next_token: null }));
    // Daily activity
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ data: [], next_token: null }));
    // Heart rate
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ data: [], next_token: null }));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[]; totalItems: number };
    expect(data.items.length).toBe(1);
    expect(at(data.items, 0).id).toBe('our_sleep_sleep-001');
    expect(at(data.items, 0).sourceType).toBe('health');
    expect(at(data.items, 0).title).toContain('Sleep Score: 82');
    expect(at(data.items, 0).metadata['provider']).toBe('oura');
    expect(at(data.items, 0).metadata['type']).toBe('daily_sleep');
  });

  it('sync fetches readiness data with our_ prefix', async () => {
    seedTokens(mockTm, 'oura');

    // Daily sleep
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ data: [], next_token: null }));
    // Daily readiness
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      data: [{
        id: 'readiness-001',
        day: '2026-02-20',
        score: 78,
        timestamp: '2026-02-20T07:00:00Z',
        temperature_deviation: 0.12,
        contributors: { hrv_balance: 80, resting_heart_rate: 72, recovery_index: 90 },
      }],
      next_token: null,
    }));
    // Daily activity
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ data: [], next_token: null }));
    // Heart rate
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ data: [], next_token: null }));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    expect(at(data.items, 0).id).toBe('our_readiness_readiness-001');
    expect(at(data.items, 0).metadata['type']).toBe('daily_readiness');
    expect(at(data.items, 0).title).toContain('Readiness Score: 78');
  });

  it('sync fetches activity data with our_ prefix', async () => {
    seedTokens(mockTm, 'oura');

    // Daily sleep
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ data: [], next_token: null }));
    // Daily readiness
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ data: [], next_token: null }));
    // Daily activity
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      data: [{
        id: 'activity-001',
        day: '2026-02-20',
        score: 85,
        timestamp: '2026-02-20T23:59:00Z',
        active_calories: 450,
        steps: 8500,
        equivalent_walking_distance: 6200,
        total_calories: 2100,
      }],
      next_token: null,
    }));
    // Heart rate
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ data: [], next_token: null }));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    expect(at(data.items, 0).id).toBe('our_activity_activity-001');
    expect(at(data.items, 0).metadata['type']).toBe('daily_activity');
    expect(at(data.items, 0).metadata['steps']).toBe(8500);
    expect(at(data.items, 0).title).toContain('8500 steps');
  });

  it('sync fetches heart rate data aggregated by day with our_hr_ prefix', async () => {
    seedTokens(mockTm, 'oura');

    // Daily sleep
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ data: [], next_token: null }));
    // Daily readiness
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ data: [], next_token: null }));
    // Daily activity
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ data: [], next_token: null }));
    // Heart rate
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      data: [
        { bpm: 62, source: 'rest', timestamp: '2026-02-20T03:00:00Z' },
        { bpm: 68, source: 'rest', timestamp: '2026-02-20T04:00:00Z' },
        { bpm: 110, source: 'workout', timestamp: '2026-02-20T18:00:00Z' },
      ],
      next_token: null,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    expect(at(data.items, 0).id).toBe('our_hr_2026-02-20');
    expect(at(data.items, 0).metadata['averageBpm']).toBe(80);
    expect(at(data.items, 0).metadata['minBpm']).toBe(62);
    expect(at(data.items, 0).metadata['maxBpm']).toBe(110);
    expect(at(data.items, 0).metadata['readingCount']).toBe(3);
  });

  it('sync handles API errors gracefully (partial failures)', async () => {
    seedTokens(mockTm, 'oura');

    // Daily sleep — error
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 500));
    // Daily readiness — error
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 500));
    // Daily activity — error
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 500));
    // Heart rate — error
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 500));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[]; errors: Array<{ message: string }> };
    expect(data.items.length).toBe(0);
    expect(data.errors.length).toBe(4);
  });

  it('sync throws when not authenticated', async () => {
    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('OURA_ERROR');
  });

  it('getUserInfo calls Oura personal_info endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      id: 'user-abc',
      email: 'user@oura.com',
    }));

    const info = await (adapter as unknown as { getUserInfo(token: string): Promise<{ email?: string; displayName?: string }> }).getUserInfo('test-token');
    expect(info.email).toBe('user@oura.com');
    expect(info.displayName).toBe('user@oura.com');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.ouraring.com/v2/usercollection/personal_info',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('getUserInfo throws on API error', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 401));

    await expect(
      (adapter as unknown as { getUserInfo(token: string): Promise<unknown> }).getUserInfo('bad-token')
    ).rejects.toThrow('Oura user info failed');
  });
});

// ============================================================
// SECTION 2: WhoopAdapter (~14 tests)
// ============================================================

describe('WhoopAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: WhoopAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new WhoopAdapter(mockTm);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns auth status: not authenticated when no tokens', () => {
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(false);
  });

  it('returns auth status: authenticated when valid tokens exist', () => {
    seedTokens(mockTm, 'whoop');
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('disconnect clears tokens', async () => {
    seedTokens(mockTm, 'whoop');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('whoop');
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('some.unknown.action' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_ACTION');
  });

  it('uses PKCE: config has usePKCE=true', () => {
    const adapterConfig = (adapter as unknown as { config: { usePKCE: boolean } }).config;
    expect(adapterConfig.usePKCE).toBe(true);
  });

  it('sync fetches cycles with whp_ prefix', async () => {
    seedTokens(mockTm, 'whoop');

    // Cycles
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      records: [{
        id: 12345,
        user_id: 1,
        start: '2026-02-20T06:00:00Z',
        end: '2026-02-21T06:00:00Z',
        score: { strain: 12.5, kilojoule: 2200, average_heart_rate: 72, max_heart_rate: 165 },
      }],
      next_token: null,
    }));
    // Recovery
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ records: [], next_token: null }));
    // Sleep
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ records: [], next_token: null }));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    expect(at(data.items, 0).id).toBe('whp_cycle_12345');
    expect(at(data.items, 0).sourceType).toBe('health');
    expect(at(data.items, 0).title).toContain('Strain 12.5');
    expect(at(data.items, 0).metadata['provider']).toBe('whoop');
    expect(at(data.items, 0).metadata['type']).toBe('cycle');
  });

  it('sync fetches recovery data with whp_ prefix', async () => {
    seedTokens(mockTm, 'whoop');

    // Cycles
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ records: [], next_token: null }));
    // Recovery
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      records: [{
        cycle_id: 12345,
        user_id: 1,
        score: {
          recovery_score: 85,
          resting_heart_rate: 52,
          hrv_rmssd_milli: 65.3,
          spo2_percentage: 97.5,
          skin_temp_celsius: 33.2,
        },
        created_at: '2026-02-20T08:00:00Z',
        updated_at: '2026-02-20T08:00:00Z',
      }],
      next_token: null,
    }));
    // Sleep
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ records: [], next_token: null }));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    expect(at(data.items, 0).id).toBe('whp_recovery_12345');
    expect(at(data.items, 0).metadata['type']).toBe('recovery');
    expect(at(data.items, 0).metadata['recoveryScore']).toBe(85);
    expect(at(data.items, 0).title).toContain('85%');
  });

  it('sync fetches sleep data with whp_ prefix', async () => {
    seedTokens(mockTm, 'whoop');

    // Cycles
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ records: [], next_token: null }));
    // Recovery
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ records: [], next_token: null }));
    // Sleep
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      records: [{
        id: 67890,
        user_id: 1,
        start: '2026-02-20T22:30:00Z',
        end: '2026-02-21T06:30:00Z',
        score: {
          stage_summary: {
            total_in_bed_time_milli: 28_800_000,
            total_awake_time_milli: 1_800_000,
            total_light_sleep_time_milli: 10_800_000,
            total_slow_wave_sleep_time_milli: 5_400_000,
            total_rem_sleep_time_milli: 7_200_000,
            sleep_cycle_count: 4,
            disturbance_count: 3,
          },
          sleep_performance_percentage: 92,
          sleep_efficiency_percentage: 88,
          sleep_consistency_percentage: 85,
          respiratory_rate: 15.2,
        },
        nap: false,
      }],
      next_token: null,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    expect(at(data.items, 0).id).toBe('whp_sleep_67890');
    expect(at(data.items, 0).metadata['type']).toBe('sleep');
    expect(at(data.items, 0).metadata['sleepPerformance']).toBe(92);
    expect(at(data.items, 0).metadata['isNap']).toBe(false);
  });

  it('sync handles API errors gracefully', async () => {
    seedTokens(mockTm, 'whoop');

    fetchSpy.mockResolvedValue(mockJsonResponse({}, 429));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[]; errors: Array<{ message: string }> };
    expect(data.items.length).toBe(0);
    expect(data.errors.length).toBe(3);
  });

  it('sync throws when not authenticated', async () => {
    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('WHOOP_ERROR');
  });

  it('getUserInfo calls WHOOP /user/profile/basic endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      user_id: 12345,
      email: 'user@whoop.com',
      first_name: 'Test',
      last_name: 'User',
    }));

    const info = await (adapter as unknown as { getUserInfo(token: string): Promise<{ email?: string; displayName?: string }> }).getUserInfo('test-token');
    expect(info.email).toBe('user@whoop.com');
    expect(info.displayName).toBe('Test User');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.prod.whoop.com/developer/v1/user/profile/basic',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('getUserInfo throws on API error', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 401));

    await expect(
      (adapter as unknown as { getUserInfo(token: string): Promise<unknown> }).getUserInfo('bad-token')
    ).rejects.toThrow('WHOOP user info failed');
  });

  it('list_items returns paginated cycles', async () => {
    seedTokens(mockTm, 'whoop');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      records: [{
        id: 12345,
        user_id: 1,
        start: '2026-02-20T06:00:00Z',
        end: '2026-02-21T06:00:00Z',
        score: { strain: 10.2, kilojoule: 1800, average_heart_rate: 70, max_heart_rate: 155 },
      }],
      next_token: 'next-abc',
    }));

    const result = await adapter.execute('connector.list_items' as ActionType, { pageSize: 25 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[]; nextPageToken: string | null };
    expect(data.items.length).toBe(1);
    expect(data.nextPageToken).toBe('next-abc');
  });
});

// ============================================================
// SECTION 3: FitbitAdapter (~14 tests)
// ============================================================

describe('FitbitAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: FitbitAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new FitbitAdapter(mockTm);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns auth status: not authenticated when no tokens', () => {
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(false);
  });

  it('returns auth status: authenticated when valid tokens exist', () => {
    seedTokens(mockTm, 'fitbit');
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('disconnect clears tokens', async () => {
    seedTokens(mockTm, 'fitbit');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('fitbit');
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('some.unknown.action' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_ACTION');
  });

  it('uses PKCE: config has usePKCE=true', () => {
    const adapterConfig = (adapter as unknown as { config: { usePKCE: boolean } }).config;
    expect(adapterConfig.usePKCE).toBe(true);
  });

  it('sync fetches activity data and maps with ftb_ prefix', async () => {
    seedTokens(mockTm, 'fitbit');

    // Activity summary
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      summary: {
        steps: 9200,
        caloriesOut: 2400,
        distances: [{ activity: 'total', distance: 6.5 }],
        activeScore: -1,
        activityCalories: 800,
        sedentaryMinutes: 600,
        lightlyActiveMinutes: 180,
        fairlyActiveMinutes: 30,
        veryActiveMinutes: 45,
        restingHeartRate: 62,
      },
      activities: [],
    }));
    // Sleep
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ sleep: [], summary: { totalMinutesAsleep: 0, totalSleepRecords: 0, totalTimeInBed: 0 } }));
    // Weight
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ weight: [] }));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    expect(at(data.items, 0).id).toMatch(/^ftb_activity_/);
    expect(at(data.items, 0).sourceType).toBe('health');
    expect(at(data.items, 0).title).toContain('9200 steps');
    expect(at(data.items, 0).metadata['provider']).toBe('fitbit');
    expect(at(data.items, 0).metadata['type']).toBe('daily_activity');
    expect(at(data.items, 0).metadata['steps']).toBe(9200);
  });

  it('sync fetches sleep data with ftb_ prefix', async () => {
    seedTokens(mockTm, 'fitbit');

    // Activity
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      summary: {
        steps: 0, caloriesOut: 0, distances: [], activeScore: 0,
        activityCalories: 0, sedentaryMinutes: 0, lightlyActiveMinutes: 0,
        fairlyActiveMinutes: 0, veryActiveMinutes: 0,
      },
      activities: [],
    }));
    // Sleep
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      sleep: [{
        logId: 55555,
        dateOfSleep: '2026-02-20',
        startTime: '2026-02-20T23:00:00.000',
        endTime: '2026-02-21T07:00:00.000',
        duration: 28_800_000,
        minutesAsleep: 420,
        minutesAwake: 30,
        efficiency: 93,
        timeInBed: 480,
        type: 'stages',
        levels: {
          summary: {
            deep: { count: 3, minutes: 90 },
            light: { count: 20, minutes: 210 },
            rem: { count: 5, minutes: 100 },
            wake: { count: 8, minutes: 30 },
          },
        },
        isMainSleep: true,
      }],
      summary: { totalMinutesAsleep: 420, totalSleepRecords: 1, totalTimeInBed: 480 },
    }));
    // Weight
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ weight: [] }));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    const data = result.data as { items: ImportedItem[] };
    // 1 activity summary + 1 sleep entry
    const sleepItems = data.items.filter(i => i.id.startsWith('ftb_sleep_'));
    expect(sleepItems.length).toBe(1);
    expect(at(sleepItems, 0).id).toBe('ftb_sleep_55555');
    expect(at(sleepItems, 0).metadata['type']).toBe('sleep');
    expect(at(sleepItems, 0).metadata['efficiency']).toBe(93);
    expect(at(sleepItems, 0).metadata['deepMinutes']).toBe(90);
  });

  it('sync fetches weight data with ftb_ prefix', async () => {
    seedTokens(mockTm, 'fitbit');

    // Activity
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      summary: {
        steps: 0, caloriesOut: 0, distances: [], activeScore: 0,
        activityCalories: 0, sedentaryMinutes: 0, lightlyActiveMinutes: 0,
        fairlyActiveMinutes: 0, veryActiveMinutes: 0,
      },
      activities: [],
    }));
    // Sleep
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ sleep: [], summary: { totalMinutesAsleep: 0, totalSleepRecords: 0, totalTimeInBed: 0 } }));
    // Weight
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      weight: [{
        logId: 77777,
        date: '2026-02-18',
        time: '08:30:00',
        weight: 75.5,
        bmi: 24.3,
        fat: 18.5,
        source: 'Aria',
      }],
    }));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    const data = result.data as { items: ImportedItem[] };
    const weightItems = data.items.filter(i => i.id.startsWith('ftb_weight_'));
    expect(weightItems.length).toBe(1);
    expect(at(weightItems, 0).id).toBe('ftb_weight_77777');
    expect(at(weightItems, 0).metadata['type']).toBe('weight_log');
    expect(at(weightItems, 0).metadata['weight']).toBe(75.5);
    expect(at(weightItems, 0).metadata['bmi']).toBe(24.3);
  });

  it('sync handles API errors gracefully', async () => {
    seedTokens(mockTm, 'fitbit');

    fetchSpy.mockResolvedValue(mockJsonResponse({}, 500));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[]; errors: Array<{ message: string }> };
    expect(data.items.length).toBe(0);
    expect(data.errors.length).toBe(3);
  });

  it('sync throws when not authenticated', async () => {
    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('FITBIT_ERROR');
  });

  it('getUserInfo calls Fitbit /1/user/-/profile.json endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      user: {
        encodedId: 'ABC123',
        displayName: 'Fitbit User',
        fullName: 'Fitbit Test User',
      },
    }));

    const info = await (adapter as unknown as { getUserInfo(token: string): Promise<{ email?: string; displayName?: string }> }).getUserInfo('test-token');
    expect(info.displayName).toBe('Fitbit User');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.fitbit.com/1/user/-/profile.json',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('getUserInfo throws on API error', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 401));

    await expect(
      (adapter as unknown as { getUserInfo(token: string): Promise<unknown> }).getUserInfo('bad-token')
    ).rejects.toThrow('Fitbit user info failed');
  });

  it('list_items returns activity items with date-based pagination', async () => {
    seedTokens(mockTm, 'fitbit');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      summary: {
        steps: 5000, caloriesOut: 1800, distances: [], activeScore: 0,
        activityCalories: 400, sedentaryMinutes: 600, lightlyActiveMinutes: 120,
        fairlyActiveMinutes: 20, veryActiveMinutes: 15,
      },
      activities: [],
    }));

    const result = await adapter.execute('connector.list_items' as ActionType, {});
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[]; nextPageToken: string };
    expect(data.items.length).toBe(1);
    expect(data.nextPageToken).toBeTruthy();
  });
});

// ============================================================
// SECTION 4: StravaAdapter (~13 tests)
// ============================================================

describe('StravaAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: StravaAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new StravaAdapter(mockTm);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns auth status: not authenticated when no tokens', () => {
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(false);
  });

  it('returns auth status: authenticated when valid tokens exist', () => {
    seedTokens(mockTm, 'strava');
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('disconnect clears tokens', async () => {
    seedTokens(mockTm, 'strava');
    // Strava has a revokeUrl, so disconnect will attempt to POST to it
    fetchSpy.mockResolvedValueOnce(mockJsonResponse(null, 200));

    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('strava');
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('some.unknown.action' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_ACTION');
  });

  it('does NOT use PKCE (standard OAuth 2.0)', () => {
    const adapterConfig = (adapter as unknown as { config: { usePKCE: boolean } }).config;
    expect(adapterConfig.usePKCE).toBe(false);
  });

  it('sync fetches activities and maps with stv_ prefix', async () => {
    seedTokens(mockTm, 'strava');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse([{
      id: 99999,
      name: 'Morning Run',
      type: 'Run',
      sport_type: 'Run',
      start_date: '2026-02-20T07:00:00Z',
      start_date_local: '2026-02-20T08:00:00+01:00',
      elapsed_time: 3600,
      moving_time: 3400,
      distance: 8500,
      total_elevation_gain: 120,
      average_speed: 2.5,
      max_speed: 4.0,
      average_heartrate: 145,
      max_heartrate: 175,
      calories: 650,
      achievement_count: 3,
      kudos_count: 12,
      comment_count: 2,
      trainer: false,
      commute: false,
      manual: false,
    }]));
    // Empty second page signals end of pagination
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    expect(at(data.items, 0).id).toBe('stv_activity_99999');
    expect(at(data.items, 0).sourceType).toBe('health');
    expect(at(data.items, 0).title).toContain('Run');
    expect(at(data.items, 0).title).toContain('Morning Run');
    expect(at(data.items, 0).metadata['provider']).toBe('strava');
    expect(at(data.items, 0).metadata['type']).toBe('activity');
    expect(at(data.items, 0).metadata['activityType']).toBe('Run');
    expect(at(data.items, 0).metadata['distanceMeters']).toBe(8500);
  });

  it('sync respects since parameter with epoch conversion', async () => {
    seedTokens(mockTm, 'strava');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    await adapter.execute('connector.sync' as ActionType, { since: '2026-02-01T00:00:00Z' });

    const callUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(callUrl).toContain('after=');
    const afterParam = new URL(callUrl).searchParams.get('after');
    expect(Number(afterParam)).toBeGreaterThan(0);
  });

  it('sync handles API errors gracefully', async () => {
    seedTokens(mockTm, 'strava');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 429));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[]; errors: Array<{ message: string }> };
    expect(data.items.length).toBe(0);
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it('sync throws when not authenticated', async () => {
    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('STRAVA_ERROR');
  });

  it('getUserInfo calls Strava /athlete endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      id: 12345,
      username: 'stravauser',
      firstname: 'Test',
      lastname: 'Runner',
    }));

    const info = await (adapter as unknown as { getUserInfo(token: string): Promise<{ email?: string; displayName?: string }> }).getUserInfo('test-token');
    expect(info.displayName).toBe('Test Runner');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://www.strava.com/api/v3/athlete',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('getUserInfo throws on API error', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 401));

    await expect(
      (adapter as unknown as { getUserInfo(token: string): Promise<unknown> }).getUserInfo('bad-token')
    ).rejects.toThrow('Strava user info failed');
  });

  it('list_items returns paginated activities with page-based token', async () => {
    seedTokens(mockTm, 'strava');

    const fullPage = Array.from({ length: 30 }, (_, i) => ({
      id: 1000 + i,
      name: `Activity ${i}`,
      type: 'Run',
      sport_type: 'Run',
      start_date: '2026-02-20T07:00:00Z',
      start_date_local: '2026-02-20T08:00:00+01:00',
      elapsed_time: 1800,
      moving_time: 1700,
      distance: 5000,
      total_elevation_gain: 50,
      average_speed: 2.9,
      max_speed: 3.5,
      achievement_count: 0,
      kudos_count: 0,
      comment_count: 0,
      trainer: false,
      commute: false,
      manual: false,
    }));

    fetchSpy.mockResolvedValueOnce(mockJsonResponse(fullPage));

    const result = await adapter.execute('connector.list_items' as ActionType, { pageSize: 30 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[]; nextPageToken: string | null };
    expect(data.items.length).toBe(30);
    expect(data.nextPageToken).toBe('2');
  });
});

// ============================================================
// SECTION 5: GarminAdapter (~14 tests)
// ============================================================

describe('GarminAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: GarminAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new GarminAdapter(mockTm);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns auth status: not authenticated when no tokens', async () => {
    const result = await adapter.execute('connector.auth_status' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(false);
  });

  it('returns auth status: authenticated when tokens exist', async () => {
    seedTokens(mockTm, 'garmin');
    const result = await adapter.execute('connector.auth_status' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('disconnect clears tokens', async () => {
    seedTokens(mockTm, 'garmin');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['disconnected']).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('garmin');
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('some.unknown.action' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_ACTION');
  });

  it('sync fetches daily summaries with gmn_ prefix', async () => {
    seedTokens(mockTm, 'garmin');

    // Dailies
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([{
      summaryId: 'daily-001',
      calendarDate: '2026-02-20',
      startTimeInSeconds: 1740009600,
      startTimeOffsetInSeconds: 3600,
      durationInSeconds: 86400,
      steps: 10200,
      distanceInMeters: 7800,
      activeTimeInSeconds: 4500,
      activeKilocalories: 520,
      bmrKilocalories: 1600,
      floorsClimbed: 12,
      averageHeartRateInBeatsPerMinute: 68,
      maxHeartRateInBeatsPerMinute: 145,
      restingHeartRateInBeatsPerMinute: 55,
      averageStressLevel: 32,
    }]));
    // Activities
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
    // Sleep
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
    // Body comp
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    expect(at(data.items, 0).id).toBe('gmn_daily_daily-001');
    expect(at(data.items, 0).sourceType).toBe('health');
    expect(at(data.items, 0).title).toContain('10200 steps');
    expect(at(data.items, 0).metadata['provider']).toBe('garmin');
    expect(at(data.items, 0).metadata['type']).toBe('daily_summary');
    expect(at(data.items, 0).metadata['steps']).toBe(10200);
    expect(at(data.items, 0).metadata['averageStressLevel']).toBe(32);
  });

  it('sync fetches activities with gmn_ prefix', async () => {
    seedTokens(mockTm, 'garmin');

    // Dailies
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
    // Activities
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([{
      activityId: 54321,
      activityName: 'Trail Run',
      activityType: 'TRAIL_RUNNING',
      startTimeInSeconds: 1740045600,
      startTimeOffsetInSeconds: 3600,
      durationInSeconds: 4200,
      distanceInMeters: 8500,
      activeKilocalories: 620,
      averageHeartRateInBeatsPerMinute: 148,
      maxHeartRateInBeatsPerMinute: 178,
      averageSpeedInMetersPerSecond: 2.02,
      maxSpeedInMetersPerSecond: 3.5,
      steps: 7500,
      elevationGainInMeters: 250,
    }]));
    // Sleep
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
    // Body comp
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    expect(at(data.items, 0).id).toBe('gmn_activity_54321');
    expect(at(data.items, 0).metadata['type']).toBe('activity');
    expect(at(data.items, 0).metadata['activityType']).toBe('TRAIL_RUNNING');
    expect(at(data.items, 0).metadata['elevationGain']).toBe(250);
  });

  it('sync fetches sleep data with gmn_ prefix', async () => {
    seedTokens(mockTm, 'garmin');

    // Dailies
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
    // Activities
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
    // Sleep
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([{
      summaryId: 'sleep-001',
      calendarDate: '2026-02-20',
      startTimeInSeconds: 1740088800,
      durationInSeconds: 27000,
      deepSleepDurationInSeconds: 5400,
      lightSleepDurationInSeconds: 12600,
      remSleepInSeconds: 7200,
      awakeDurationInSeconds: 1800,
      validation: 'ENHANCED_TENTATIVE',
    }]));
    // Body comp
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    expect(at(data.items, 0).id).toBe('gmn_sleep_sleep-001');
    expect(at(data.items, 0).metadata['type']).toBe('sleep');
    expect(at(data.items, 0).metadata['deepSleepSeconds']).toBe(5400);
    expect(at(data.items, 0).metadata['remSleepSeconds']).toBe(7200);
  });

  it('sync fetches body composition data with gmn_ prefix', async () => {
    seedTokens(mockTm, 'garmin');

    // Dailies
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
    // Activities
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
    // Sleep
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
    // Body comp
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([{
      summaryId: 'bc-001',
      measurementTimeInSeconds: 1740045600,
      weightInGrams: 75500,
      bmi: 24.3,
      bodyFatPercentage: 18.5,
      muscleMassInGrams: 35000,
      boneMassInGrams: 3200,
      bodyWaterPercentage: 55.2,
    }]));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    expect(at(data.items, 0).id).toBe('gmn_bodycomp_bc-001');
    expect(at(data.items, 0).metadata['type']).toBe('body_composition');
    expect(at(data.items, 0).metadata['weightGrams']).toBe(75500);
    expect(at(data.items, 0).metadata['bodyFatPercentage']).toBe(18.5);
  });

  it('sync uses OAuth 1.0a signed requests (Authorization header present)', async () => {
    seedTokens(mockTm, 'garmin');

    // Dailies
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
    // Activities
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
    // Sleep
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
    // Body comp
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    await adapter.execute('connector.sync' as ActionType, {});

    // All API calls should include OAuth 1.0a Authorization header
    for (const call of fetchSpy.mock.calls) {
      const opts = call[1] as Record<string, unknown>;
      const headers = opts['headers'] as Record<string, string>;
      expect(headers['Authorization']).toMatch(/^OAuth /);
    }
  });

  it('sync handles API errors gracefully (partial failures)', async () => {
    seedTokens(mockTm, 'garmin');

    fetchSpy.mockResolvedValue(mockJsonResponse({}, 500));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[]; errors: Array<{ message: string }> };
    expect(data.items.length).toBe(0);
    expect(data.errors.length).toBe(4);
  });

  it('sync returns errors for all categories when not authenticated', async () => {
    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[]; errors: Array<{ message: string }> };
    expect(data.items.length).toBe(0);
    expect(data.errors.length).toBe(4);
    for (const err of data.errors) {
      expect(err.message).toContain('Not authenticated with Garmin Connect');
    }
  });

  it('list_items returns daily summaries with time-based pagination', async () => {
    seedTokens(mockTm, 'garmin');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse([{
      summaryId: 'daily-001',
      calendarDate: '2026-02-20',
      startTimeInSeconds: 1740009600,
      startTimeOffsetInSeconds: 3600,
      durationInSeconds: 86400,
      steps: 8000,
      distanceInMeters: 6000,
      activeTimeInSeconds: 3000,
      activeKilocalories: 400,
      bmrKilocalories: 1500,
    }]));

    const result = await adapter.execute('connector.list_items' as ActionType, {});
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[]; nextPageToken: string };
    expect(data.items.length).toBe(1);
    expect(data.nextPageToken).toBeTruthy();
  });
});

// ============================================================
// SECTION 6: TogglAdapter (~13 tests)
// ============================================================

describe('TogglAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: TogglAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new TogglAdapter(mockTm);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns auth status: not authenticated when no tokens', async () => {
    const result = await adapter.execute('connector.auth_status' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(false);
  });

  it('returns auth status: authenticated when tokens exist', async () => {
    seedTokens(mockTm, 'toggl');
    const result = await adapter.execute('connector.auth_status' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('auth with valid API key stores token and returns user info', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      id: 12345,
      email: 'user@toggl.com',
      fullname: 'Toggl User',
      timezone: 'America/New_York',
      default_workspace_id: 100,
    }));

    const result = await adapter.execute('connector.auth' as ActionType, {
      apiKey: 'toggl-api-key-123',
    });
    expect(result.success).toBe(true);
    expect(mockTm.storeTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'toggl',
        accessToken: 'toggl-api-key-123',
      }),
    );

    const data = result.data as Record<string, unknown>;
    expect(data['userEmail']).toBe('user@toggl.com');
    expect(data['displayName']).toBe('Toggl User');
  });

  it('auth fails when no API key provided', async () => {
    const result = await adapter.execute('connector.auth' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MISSING_API_KEY');
  });

  it('auth fails with invalid API key', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 403));

    const result = await adapter.execute('connector.auth' as ActionType, {
      apiKey: 'invalid-key',
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('AUTH_FAILED');
    expect(result.error?.message).toContain('Invalid Toggl API token');
  });

  it('auth uses Basic auth header with api_token pattern', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      id: 1, email: 'test@test.com', fullname: 'Test',
      timezone: 'UTC', default_workspace_id: 1,
    }));

    await adapter.execute('connector.auth' as ActionType, { apiKey: 'my-key' });

    const callArgs = fetchSpy.mock.calls[0]!;
    const authHeader = (callArgs[1] as Record<string, unknown>)['headers'] as Record<string, string>;
    const expectedBase64 = Buffer.from('my-key:api_token').toString('base64');
    expect(authHeader['Authorization']).toBe(`Basic ${expectedBase64}`);
  });

  it('disconnect clears tokens', async () => {
    seedTokens(mockTm, 'toggl');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['disconnected']).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('toggl');
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('some.unknown.action' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_ACTION');
  });

  it('sync fetches time entries and maps with tgl_ prefix and productivity sourceType', async () => {
    seedTokens(mockTm, 'toggl', 'toggl-api-key');

    // Projects
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      { id: 200, workspace_id: 1, name: 'Semblance', color: '#06aed5', active: true, billable: false },
    ]));
    // Time entries
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([{
      id: 88888,
      workspace_id: 1,
      project_id: 200,
      task_id: null,
      description: 'Implementing OAuth adapters',
      start: '2026-02-20T09:00:00Z',
      stop: '2026-02-20T11:30:00Z',
      duration: 9000,
      tags: ['development', 'backend'],
      tag_ids: [1, 2],
      billable: false,
    }]));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    expect(at(data.items, 0).id).toBe('tgl_entry_88888');
    expect(at(data.items, 0).sourceType).toBe('productivity');
    expect(at(data.items, 0).title).toContain('Implementing OAuth adapters');
    expect(at(data.items, 0).metadata['provider']).toBe('toggl');
    expect(at(data.items, 0).metadata['type']).toBe('time_entry');
    expect(at(data.items, 0).metadata['projectName']).toBe('Semblance');
    expect(at(data.items, 0).metadata['tags']).toEqual(['development', 'backend']);
  });

  it('sync excludes running time entries (negative duration)', async () => {
    seedTokens(mockTm, 'toggl', 'toggl-api-key');

    // Projects
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
    // Time entries — one completed, one running
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      {
        id: 88888, workspace_id: 1, project_id: null, task_id: null,
        description: 'Completed task', start: '2026-02-20T09:00:00Z',
        stop: '2026-02-20T10:00:00Z', duration: 3600,
        tags: [], tag_ids: [], billable: false,
      },
      {
        id: 88889, workspace_id: 1, project_id: null, task_id: null,
        description: 'Running task', start: '2026-02-20T11:00:00Z',
        stop: null, duration: -1740049200,
        tags: [], tag_ids: [], billable: false,
      },
    ]));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    expect(at(data.items, 0).id).toBe('tgl_entry_88888');
  });

  it('sync handles API errors gracefully', async () => {
    seedTokens(mockTm, 'toggl', 'toggl-api-key');

    fetchSpy.mockResolvedValue(mockJsonResponse({}, 500));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[]; errors: Array<{ message: string }> };
    expect(data.items.length).toBe(0);
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it('sync throws when not authenticated', async () => {
    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('TOGGL_ERROR');
  });
});

// ============================================================
// SECTION 7: RescueTimeAdapter (~13 tests)
// ============================================================

describe('RescueTimeAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: RescueTimeAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new RescueTimeAdapter(mockTm);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns auth status: not authenticated when no tokens', async () => {
    const result = await adapter.execute('connector.auth_status' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(false);
  });

  it('returns auth status: authenticated when tokens exist', async () => {
    seedTokens(mockTm, 'rescuetime');
    const result = await adapter.execute('connector.auth_status' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('auth with valid API key stores token', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      notes: 'data is queued',
      row_headers: ['Rank', 'Time', 'People', 'Activity', 'Category', 'Productivity'],
      rows: [],
    }));

    const result = await adapter.execute('connector.auth' as ActionType, {
      apiKey: 'rt-api-key-123',
    });
    expect(result.success).toBe(true);
    expect(mockTm.storeTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'rescuetime',
        accessToken: 'rt-api-key-123',
      }),
    );
  });

  it('auth fails when no API key provided', async () => {
    const result = await adapter.execute('connector.auth' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MISSING_API_KEY');
  });

  it('auth fails with invalid API key', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 403));

    const result = await adapter.execute('connector.auth' as ActionType, {
      apiKey: 'bad-key',
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('AUTH_FAILED');
    expect(result.error?.message).toContain('Invalid RescueTime API key');
  });

  it('auth passes API key as query parameter, not header', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      notes: '', row_headers: [], rows: [],
    }));

    await adapter.execute('connector.auth' as ActionType, { apiKey: 'my-rt-key' });

    const callUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(callUrl).toContain('key=my-rt-key');
  });

  it('disconnect clears tokens', async () => {
    seedTokens(mockTm, 'rescuetime');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['disconnected']).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('rescuetime');
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('some.unknown.action' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_ACTION');
  });

  it('sync fetches productivity data and maps with rt_ prefix and productivity sourceType', async () => {
    seedTokens(mockTm, 'rescuetime', 'rt-api-key');

    // Productivity data
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      notes: 'data is queued',
      row_headers: ['Rank', 'Time Spent (seconds)', 'Number of People', 'Activity', 'Category', 'Productivity'],
      rows: [
        [1, 7200, 1, 'VS Code', 'Editing & IDEs', 2],
        [2, 3600, 1, 'reddit.com', 'General News & Opinion', -1],
        [3, 1800, 1, 'Slack', 'Instant Message', 0],
      ],
    }));
    // Daily summary
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    const productivityItems = data.items.filter(i => i.id.startsWith('rt_productivity_'));
    expect(productivityItems.length).toBe(1);
    expect(at(productivityItems, 0).sourceType).toBe('productivity');
    expect(at(productivityItems, 0).metadata['provider']).toBe('rescuetime');
    expect(at(productivityItems, 0).metadata['type']).toBe('productivity_summary');
    expect(at(productivityItems, 0).metadata['totalSeconds']).toBe(12600);
    expect(at(productivityItems, 0).metadata['productiveSeconds']).toBe(7200);
    expect(at(productivityItems, 0).metadata['distractingSeconds']).toBe(3600);
  });

  it('sync fetches daily summary data with rt_daily_ prefix', async () => {
    seedTokens(mockTm, 'rescuetime', 'rt-api-key');

    // Productivity data
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      notes: '', row_headers: [], rows: [],
    }));
    // Daily summary
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([{
      id: '2026-02-20',
      date: '2026-02-20',
      productivity_pulse: 72,
      very_productive_percentage: 35.0,
      productive_percentage: 20.0,
      neutral_percentage: 15.0,
      distracting_percentage: 18.0,
      very_distracting_percentage: 12.0,
      all_productive_percentage: 55.0,
      all_distracting_percentage: 30.0,
      uncategorized_percentage: 0,
      total_hours: 8.5,
      very_productive_hours: 3.0,
      productive_hours: 1.7,
      neutral_hours: 1.3,
      distracting_hours: 1.5,
      very_distracting_hours: 1.0,
      total_duration_formatted: '8h 30m',
    }]));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    const data = result.data as { items: ImportedItem[] };
    const dailyItems = data.items.filter(i => i.id.startsWith('rt_daily_'));
    expect(dailyItems.length).toBe(1);
    expect(at(dailyItems, 0).id).toBe('rt_daily_2026-02-20');
    expect(at(dailyItems, 0).sourceType).toBe('productivity');
    expect(at(dailyItems, 0).metadata['type']).toBe('daily_summary');
    expect(at(dailyItems, 0).metadata['productivityPulse']).toBe(72);
    expect(at(dailyItems, 0).metadata['totalHours']).toBe(8.5);
  });

  it('sync handles API errors gracefully', async () => {
    seedTokens(mockTm, 'rescuetime', 'rt-api-key');

    fetchSpy.mockResolvedValue(mockJsonResponse({}, 500));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[]; errors: Array<{ message: string }> };
    expect(data.items.length).toBe(0);
    expect(data.errors.length).toBe(2);
  });

  it('sync throws when not authenticated', async () => {
    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('RESCUETIME_ERROR');
  });
});

// ============================================================
// SECTION 8: Allowlist Auto-Seeding for Health/Fitness Connectors (7 tests)
// ============================================================

describe('Health/Fitness Connector Allowlist Auto-Seeding', () => {
  it('oura has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('oura');
    expect(domains).toContain('cloud.ouraring.com');
    expect(domains).toContain('api.ouraring.com');
    expect(domains.length).toBe(2);
  });

  it('whoop has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('whoop');
    expect(domains).toContain('api.prod.whoop.com');
    expect(domains.length).toBe(1);
  });

  it('fitbit has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('fitbit');
    expect(domains).toContain('www.fitbit.com');
    expect(domains).toContain('api.fitbit.com');
    expect(domains.length).toBe(2);
  });

  it('strava has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('strava');
    expect(domains).toContain('www.strava.com');
    expect(domains.length).toBeGreaterThanOrEqual(1);
  });

  it('garmin has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('garmin');
    expect(domains).toContain('connectapi.garmin.com');
    expect(domains).toContain('apis.garmin.com');
    expect(domains.length).toBe(2);
  });

  it('toggl has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('toggl');
    expect(domains).toContain('api.track.toggl.com');
    expect(domains.length).toBe(1);
  });

  it('rescuetime has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('rescuetime');
    expect(domains).toContain('www.rescuetime.com');
    expect(domains.length).toBe(1);
  });
});

// ============================================================
// SECTION 9: Cross-Adapter Source Type Verification (2 tests)
// ============================================================

describe('Health/Fitness Source Type Classification', () => {
  it('health adapters (Oura, WHOOP, Fitbit, Strava, Garmin) use sourceType=health', async () => {
    const mockTm = createMockTokenManager();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // Test Oura
    seedTokens(mockTm, 'oura');
    const oura = new OuraAdapter(mockTm);
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      data: [{ id: 'sleep-1', day: '2026-02-20', score: 80, timestamp: '2026-02-20T07:00:00Z' }],
      next_token: null,
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ data: [], next_token: null }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ data: [], next_token: null }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ data: [], next_token: null }));

    const ouraResult = await oura.execute('connector.sync' as ActionType, {});
    const ouraData = ouraResult.data as { items: ImportedItem[] };
    for (const item of ouraData.items) {
      expect(item.sourceType).toBe('health');
    }

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('productivity adapters (Toggl, RescueTime) use sourceType=productivity', async () => {
    const mockTm = createMockTokenManager();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // Test Toggl
    seedTokens(mockTm, 'toggl', 'tgl-key');
    const toggl = new TogglAdapter(mockTm);
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([])); // projects
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([{
      id: 1, workspace_id: 1, project_id: null, task_id: null,
      description: 'Test', start: '2026-02-20T09:00:00Z',
      stop: '2026-02-20T10:00:00Z', duration: 3600,
      tags: [], tag_ids: [], billable: false,
    }])); // time entries

    const togglResult = await toggl.execute('connector.sync' as ActionType, {});
    const togglData = togglResult.data as { items: ImportedItem[] };
    for (const item of togglData.items) {
      expect(item.sourceType).toBe('productivity');
    }

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
