/**
 * OuraAdapter — Gateway service adapter for the Oura Ring API v2.
 *
 * Extends BaseOAuthAdapter (standard OAuth 2.0, not PKCE).
 * Handles OAuth authentication flow, token management, and data sync
 * for sleep, readiness, activity, and heart rate data.
 *
 * All HTTP calls use globalThis.fetch. No external HTTP libraries.
 */

import type { ActionType } from '@semblance/core';
import type { OAuthTokenManager } from '../oauth-token-manager.js';
import type { OAuthConfig } from '../oauth-config.js';
import type { AdapterResult } from '../base-oauth-adapter.js';
import type { ImportedItem } from '@semblance/core/importers/types.js';
import { BaseOAuthAdapter } from '../base-oauth-adapter.js';
import { oauthClients } from '../../config/oauth-clients.js';

const OURA_SCOPES = 'daily heartrate workout tag session personal email';

/** Oura API base URL */
const API_BASE = 'https://api.ouraring.com/v2';

/** Build the OAuthConfig for Oura. */
export function getOuraOAuthConfig(): OAuthConfig {
  return {
    providerKey: 'oura',
    authUrl: 'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl: 'https://api.ouraring.com/oauth/token',
    scopes: OURA_SCOPES,
    usePKCE: false,
    clientId: oauthClients.oura.clientId,
    clientSecret: oauthClients.oura.clientSecret,
  };
}

interface OuraPersonalInfo {
  id: string;
  email?: string;
  age?: number;
  weight?: number;
  height?: number;
  biological_sex?: string;
}

interface OuraDailySleep {
  id: string;
  day: string;
  score: number | null;
  timestamp: string;
  contributors?: {
    deep_sleep?: number;
    efficiency?: number;
    latency?: number;
    rem_sleep?: number;
    restfulness?: number;
    timing?: number;
    total_sleep?: number;
  };
}

interface OuraDailyReadiness {
  id: string;
  day: string;
  score: number | null;
  timestamp: string;
  temperature_deviation?: number;
  temperature_trend_deviation?: number;
  contributors?: {
    activity_balance?: number;
    body_temperature?: number;
    hrv_balance?: number;
    previous_day_activity?: number;
    previous_night?: number;
    recovery_index?: number;
    resting_heart_rate?: number;
    sleep_balance?: number;
  };
}

interface OuraDailyActivity {
  id: string;
  day: string;
  score: number | null;
  timestamp: string;
  active_calories: number;
  steps: number;
  equivalent_walking_distance?: number;
  total_calories?: number;
  contributors?: {
    meet_daily_targets?: number;
    move_every_hour?: number;
    recovery_time?: number;
    stay_active?: number;
    training_frequency?: number;
    training_volume?: number;
  };
}

interface OuraHeartRate {
  bpm: number;
  source: string;
  timestamp: string;
}

interface OuraCollectionResponse<T> {
  data: T[];
  next_token: string | null;
}

export class OuraAdapter extends BaseOAuthAdapter {
  constructor(tokenManager: OAuthTokenManager) {
    super(tokenManager, getOuraOAuthConfig());
  }

  protected async getUserInfo(accessToken: string): Promise<{ email?: string; displayName?: string }> {
    const response = await globalThis.fetch(`${API_BASE}/usercollection/personal_info`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Oura user info failed: HTTP ${response.status}`);
    }

    const info = await response.json() as OuraPersonalInfo;
    return {
      email: info.email,
      displayName: info.email,
    };
  }

  async execute(action: ActionType, payload: unknown): Promise<AdapterResult> {
    const p = payload as Record<string, unknown>;

    try {
      switch (action) {
        case 'connector.auth':
          return await this.performAuthFlow();

        case 'connector.auth_status':
          return this.handleAuthStatus();

        case 'connector.disconnect':
          return await this.performDisconnect();

        case 'connector.sync':
          return await this.handleSync(p);

        case 'connector.list_items':
          return await this.handleListItems(p);

        default:
          return {
            success: false,
            error: { code: 'UNKNOWN_ACTION', message: `OuraAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'OURA_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Sync sleep, readiness, activity, and heart rate data from Oura.
   * Returns ImportedItem[] for the knowledge graph pipeline.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const since = payload['since'] as string | undefined;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    const startDate = since
      ? since.split('T')[0]!
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
    const endDate = new Date().toISOString().split('T')[0]!;

    // 1. Daily sleep
    try {
      const sleepItems = await this.fetchDailySleep(accessToken, startDate, endDate);
      items.push(...sleepItems);
    } catch (err) {
      errors.push({ message: `Daily sleep: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 2. Daily readiness
    try {
      const readinessItems = await this.fetchDailyReadiness(accessToken, startDate, endDate);
      items.push(...readinessItems);
    } catch (err) {
      errors.push({ message: `Daily readiness: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 3. Daily activity
    try {
      const activityItems = await this.fetchDailyActivity(accessToken, startDate, endDate);
      items.push(...activityItems);
    } catch (err) {
      errors.push({ message: `Daily activity: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 4. Heart rate
    try {
      const hrItems = await this.fetchHeartRate(accessToken, startDate, endDate);
      items.push(...hrItems);
    } catch (err) {
      errors.push({ message: `Heart rate: ${err instanceof Error ? err.message : String(err)}` });
    }

    return {
      success: true,
      data: {
        items,
        totalItems: items.length,
        errors,
      },
    };
  }

  /**
   * List items with pagination support (used by connector.list_items).
   */
  private async handleListItems(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const pageToken = payload['pageToken'] as string | undefined;

    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
    const endDate = new Date().toISOString().split('T')[0]!;

    const url = new URL(`${API_BASE}/usercollection/daily_sleep`);
    url.searchParams.set('start_date', startDate);
    url.searchParams.set('end_date', endDate);
    if (pageToken) {
      url.searchParams.set('next_token', pageToken);
    }

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'OURA_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as OuraCollectionResponse<OuraDailySleep>;
    const items = data.data.map((entry) => this.sleepToImportedItem(entry));

    return {
      success: true,
      data: {
        items,
        nextPageToken: data.next_token,
      },
    };
  }

  private async fetchDailySleep(accessToken: string, startDate: string, endDate: string): Promise<ImportedItem[]> {
    const url = new URL(`${API_BASE}/usercollection/daily_sleep`);
    url.searchParams.set('start_date', startDate);
    url.searchParams.set('end_date', endDate);

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as OuraCollectionResponse<OuraDailySleep>;
    return data.data.map((entry) => this.sleepToImportedItem(entry));
  }

  private sleepToImportedItem(entry: OuraDailySleep): ImportedItem {
    return {
      id: `our_sleep_${entry.id}`,
      sourceType: 'health' as const,
      title: `Oura Sleep Score: ${entry.score ?? 'N/A'} (${entry.day})`,
      content: `Sleep score of ${entry.score ?? 'N/A'} on ${entry.day}. Deep sleep: ${entry.contributors?.deep_sleep ?? 'N/A'}, Efficiency: ${entry.contributors?.efficiency ?? 'N/A'}, REM: ${entry.contributors?.rem_sleep ?? 'N/A'}`,
      timestamp: entry.timestamp,
      metadata: {
        provider: 'oura',
        type: 'daily_sleep',
        day: entry.day,
        score: entry.score,
        contributors: entry.contributors,
      },
    };
  }

  private async fetchDailyReadiness(accessToken: string, startDate: string, endDate: string): Promise<ImportedItem[]> {
    const url = new URL(`${API_BASE}/usercollection/daily_readiness`);
    url.searchParams.set('start_date', startDate);
    url.searchParams.set('end_date', endDate);

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as OuraCollectionResponse<OuraDailyReadiness>;
    return data.data.map((entry) => ({
      id: `our_readiness_${entry.id}`,
      sourceType: 'health' as const,
      title: `Oura Readiness Score: ${entry.score ?? 'N/A'} (${entry.day})`,
      content: `Readiness score of ${entry.score ?? 'N/A'} on ${entry.day}. HRV balance: ${entry.contributors?.hrv_balance ?? 'N/A'}, Resting HR: ${entry.contributors?.resting_heart_rate ?? 'N/A'}, Recovery: ${entry.contributors?.recovery_index ?? 'N/A'}`,
      timestamp: entry.timestamp,
      metadata: {
        provider: 'oura',
        type: 'daily_readiness',
        day: entry.day,
        score: entry.score,
        temperatureDeviation: entry.temperature_deviation,
        contributors: entry.contributors,
      },
    }));
  }

  private async fetchDailyActivity(accessToken: string, startDate: string, endDate: string): Promise<ImportedItem[]> {
    const url = new URL(`${API_BASE}/usercollection/daily_activity`);
    url.searchParams.set('start_date', startDate);
    url.searchParams.set('end_date', endDate);

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as OuraCollectionResponse<OuraDailyActivity>;
    return data.data.map((entry) => ({
      id: `our_activity_${entry.id}`,
      sourceType: 'health' as const,
      title: `Oura Activity: ${entry.steps} steps, Score ${entry.score ?? 'N/A'} (${entry.day})`,
      content: `Activity on ${entry.day}: ${entry.steps} steps, ${entry.active_calories} active calories, score ${entry.score ?? 'N/A'}. Total calories: ${entry.total_calories ?? 'N/A'}`,
      timestamp: entry.timestamp,
      metadata: {
        provider: 'oura',
        type: 'daily_activity',
        day: entry.day,
        score: entry.score,
        steps: entry.steps,
        activeCalories: entry.active_calories,
        totalCalories: entry.total_calories,
        equivalentWalkingDistance: entry.equivalent_walking_distance,
        contributors: entry.contributors,
      },
    }));
  }

  private async fetchHeartRate(accessToken: string, startDate: string, endDate: string): Promise<ImportedItem[]> {
    const url = new URL(`${API_BASE}/usercollection/heartrate`);
    url.searchParams.set('start_date', startDate);
    url.searchParams.set('end_date', endDate);

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as OuraCollectionResponse<OuraHeartRate>;

    // Aggregate heart rate data by day rather than creating one item per reading
    const byDay = new Map<string, OuraHeartRate[]>();
    for (const hr of data.data) {
      const day = hr.timestamp.split('T')[0]!;
      const existing = byDay.get(day) ?? [];
      existing.push(hr);
      byDay.set(day, existing);
    }

    const items: ImportedItem[] = [];
    for (const [day, readings] of byDay) {
      const bpms = readings.map(r => r.bpm);
      const avg = Math.round(bpms.reduce((sum, v) => sum + v, 0) / bpms.length);
      const min = Math.min(...bpms);
      const max = Math.max(...bpms);

      items.push({
        id: `our_hr_${day}`,
        sourceType: 'health' as const,
        title: `Oura Heart Rate: avg ${avg} bpm (${day})`,
        content: `Heart rate on ${day}: average ${avg} bpm, min ${min} bpm, max ${max} bpm (${readings.length} readings)`,
        timestamp: `${day}T00:00:00.000Z`,
        metadata: {
          provider: 'oura',
          type: 'heart_rate_summary',
          day,
          averageBpm: avg,
          minBpm: min,
          maxBpm: max,
          readingCount: readings.length,
        },
      });
    }

    return items;
  }
}
