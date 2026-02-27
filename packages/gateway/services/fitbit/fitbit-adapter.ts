/**
 * FitbitAdapter — Gateway service adapter for the Fitbit Web API.
 *
 * Extends BasePKCEAdapter because Fitbit uses PKCE (S256) for OAuth.
 * Handles OAuth authentication flow, token management, and data sync
 * for activity, sleep, and body weight data.
 *
 * All HTTP calls use globalThis.fetch. No external HTTP libraries.
 */

import type { ActionType } from '@semblance/core';
import type { OAuthTokenManager } from '../oauth-token-manager.js';
import type { OAuthConfig } from '../oauth-config.js';
import type { AdapterResult } from '../base-oauth-adapter.js';
import type { ImportedItem } from '@semblance/core/importers/types.js';
import { BasePKCEAdapter } from '../base-pkce-adapter.js';
import { oauthClients } from '../../config/oauth-clients.js';

const FITBIT_SCOPES = 'activity heartrate sleep weight profile';

/** Fitbit API base URL */
const API_BASE = 'https://api.fitbit.com';

/** Build the OAuthConfig for Fitbit. */
export function getFitbitOAuthConfig(): OAuthConfig {
  return {
    providerKey: 'fitbit',
    authUrl: 'https://www.fitbit.com/oauth2/authorize',
    tokenUrl: 'https://api.fitbit.com/oauth2/token',
    scopes: FITBIT_SCOPES,
    usePKCE: true,
    clientId: oauthClients.fitbit.clientId,
  };
}

interface FitbitUserProfile {
  user: {
    encodedId: string;
    displayName?: string;
    fullName?: string;
    avatar?: string;
    memberSince?: string;
  };
}

interface FitbitActivitySummary {
  summary: {
    steps: number;
    caloriesOut: number;
    distances: Array<{ activity: string; distance: number }>;
    activeScore: number;
    activityCalories: number;
    floors?: number;
    elevation?: number;
    sedentaryMinutes: number;
    lightlyActiveMinutes: number;
    fairlyActiveMinutes: number;
    veryActiveMinutes: number;
    restingHeartRate?: number;
  };
  activities: Array<{
    activityId: number;
    activityParentId: number;
    name: string;
    description?: string;
    startTime: string;
    duration: number;
    calories: number;
    steps?: number;
    distance?: number;
  }>;
}

interface FitbitSleepResponse {
  sleep: Array<{
    logId: number;
    dateOfSleep: string;
    startTime: string;
    endTime: string;
    duration: number;
    minutesAsleep: number;
    minutesAwake: number;
    efficiency: number;
    timeInBed: number;
    type: string;
    levels?: {
      summary: {
        deep?: { count: number; minutes: number };
        light?: { count: number; minutes: number };
        rem?: { count: number; minutes: number };
        wake?: { count: number; minutes: number };
      };
    };
    isMainSleep: boolean;
  }>;
  summary: {
    totalMinutesAsleep: number;
    totalSleepRecords: number;
    totalTimeInBed: number;
  };
}

interface FitbitWeightLog {
  weight: Array<{
    logId: number;
    date: string;
    time: string;
    weight: number;
    bmi: number;
    fat?: number;
    source: string;
  }>;
}

export class FitbitAdapter extends BasePKCEAdapter {
  constructor(tokenManager: OAuthTokenManager) {
    super(tokenManager, getFitbitOAuthConfig());
  }

  protected async getUserInfo(accessToken: string): Promise<{ email?: string; displayName?: string }> {
    const response = await globalThis.fetch(`${API_BASE}/1/user/-/profile.json`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Fitbit user info failed: HTTP ${response.status}`);
    }

    const data = await response.json() as FitbitUserProfile;
    return {
      displayName: data.user.displayName ?? data.user.fullName,
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
            error: { code: 'UNKNOWN_ACTION', message: `FitbitAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'FITBIT_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Sync activity, sleep, and body weight data from Fitbit.
   * Returns ImportedItem[] for the knowledge graph pipeline.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const since = payload['since'] as string | undefined;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    const targetDate = since
      ? since.split('T')[0]!
      : new Date().toISOString().split('T')[0]!;

    // 1. Activity summary
    try {
      const activityItems = await this.fetchActivity(accessToken, targetDate);
      items.push(...activityItems);
    } catch (err) {
      errors.push({ message: `Activity: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 2. Sleep
    try {
      const sleepItems = await this.fetchSleep(accessToken, targetDate);
      items.push(...sleepItems);
    } catch (err) {
      errors.push({ message: `Sleep: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 3. Body weight (last 30 days from target date)
    try {
      const weightItems = await this.fetchWeight(accessToken, targetDate);
      items.push(...weightItems);
    } catch (err) {
      errors.push({ message: `Weight: ${err instanceof Error ? err.message : String(err)}` });
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
   * Returns recent activity days.
   */
  private async handleListItems(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const pageToken = payload['pageToken'] as string | undefined;

    // Fitbit does not have cursor-based pagination for daily summaries.
    // Use date-based pagination: pageToken is a date string.
    const date = pageToken ?? new Date().toISOString().split('T')[0]!;

    const activityItems = await this.fetchActivity(accessToken, date);

    // Calculate previous date for next page
    const dateObj = new Date(date);
    dateObj.setDate(dateObj.getDate() - 1);
    const prevDate = dateObj.toISOString().split('T')[0]!;

    return {
      success: true,
      data: {
        items: activityItems,
        nextPageToken: prevDate,
      },
    };
  }

  private async fetchActivity(accessToken: string, date: string): Promise<ImportedItem[]> {
    const url = `${API_BASE}/1/user/-/activities/date/${date}.json`;

    const response = await globalThis.fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as FitbitActivitySummary;
    const items: ImportedItem[] = [];

    // Daily summary
    items.push({
      id: `ftb_activity_${date}`,
      sourceType: 'health' as const,
      title: `Fitbit Activity: ${data.summary.steps} steps (${date})`,
      content: `Fitbit activity on ${date}: ${data.summary.steps} steps, ${data.summary.caloriesOut} calories burned, ${data.summary.veryActiveMinutes} very active min, ${data.summary.fairlyActiveMinutes} fairly active min, ${data.summary.lightlyActiveMinutes} lightly active min, ${data.summary.sedentaryMinutes} sedentary min${data.summary.restingHeartRate ? `, resting HR ${data.summary.restingHeartRate} bpm` : ''}`,
      timestamp: `${date}T00:00:00.000Z`,
      metadata: {
        provider: 'fitbit',
        type: 'daily_activity',
        date,
        steps: data.summary.steps,
        caloriesOut: data.summary.caloriesOut,
        activityCalories: data.summary.activityCalories,
        floors: data.summary.floors,
        veryActiveMinutes: data.summary.veryActiveMinutes,
        fairlyActiveMinutes: data.summary.fairlyActiveMinutes,
        lightlyActiveMinutes: data.summary.lightlyActiveMinutes,
        sedentaryMinutes: data.summary.sedentaryMinutes,
        restingHeartRate: data.summary.restingHeartRate,
        distances: data.summary.distances,
      },
    });

    // Individual activities
    for (const activity of data.activities) {
      items.push({
        id: `ftb_activity_log_${activity.activityId}_${date}`,
        sourceType: 'health' as const,
        title: `Fitbit ${activity.name}: ${activity.calories} cal (${date})`,
        content: `${activity.name} on ${date}: ${activity.calories} calories, ${activity.duration} ms duration${activity.steps ? `, ${activity.steps} steps` : ''}${activity.distance ? `, ${activity.distance} distance` : ''}`,
        timestamp: `${date}T${activity.startTime}`,
        metadata: {
          provider: 'fitbit',
          type: 'activity_log',
          activityId: activity.activityId,
          name: activity.name,
          calories: activity.calories,
          duration: activity.duration,
          steps: activity.steps,
          distance: activity.distance,
        },
      });
    }

    return items;
  }

  private async fetchSleep(accessToken: string, date: string): Promise<ImportedItem[]> {
    const url = `${API_BASE}/1.2/user/-/sleep/date/${date}.json`;

    const response = await globalThis.fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as FitbitSleepResponse;

    return data.sleep.map((sleep) => {
      const hoursAsleep = (sleep.minutesAsleep / 60).toFixed(1);
      return {
        id: `ftb_sleep_${sleep.logId}`,
        sourceType: 'health' as const,
        title: `Fitbit Sleep: ${hoursAsleep}h, ${sleep.efficiency}% efficiency (${sleep.dateOfSleep})`,
        content: `Fitbit sleep on ${sleep.dateOfSleep}: ${hoursAsleep} hours asleep, ${sleep.efficiency}% efficiency, ${sleep.minutesAwake} min awake, ${sleep.timeInBed} min in bed${sleep.isMainSleep ? ' (main sleep)' : ' (nap)'}. Deep: ${sleep.levels?.summary.deep?.minutes ?? 'N/A'} min, Light: ${sleep.levels?.summary.light?.minutes ?? 'N/A'} min, REM: ${sleep.levels?.summary.rem?.minutes ?? 'N/A'} min`,
        timestamp: sleep.startTime,
        metadata: {
          provider: 'fitbit',
          type: 'sleep',
          logId: sleep.logId,
          dateOfSleep: sleep.dateOfSleep,
          minutesAsleep: sleep.minutesAsleep,
          minutesAwake: sleep.minutesAwake,
          efficiency: sleep.efficiency,
          timeInBed: sleep.timeInBed,
          isMainSleep: sleep.isMainSleep,
          sleepType: sleep.type,
          deepMinutes: sleep.levels?.summary.deep?.minutes,
          lightMinutes: sleep.levels?.summary.light?.minutes,
          remMinutes: sleep.levels?.summary.rem?.minutes,
          wakeMinutes: sleep.levels?.summary.wake?.minutes,
        },
      };
    });
  }

  private async fetchWeight(accessToken: string, date: string): Promise<ImportedItem[]> {
    const url = `${API_BASE}/1/user/-/body/log/weight/date/${date}/30d.json`;

    const response = await globalThis.fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as FitbitWeightLog;

    return data.weight.map((entry) => ({
      id: `ftb_weight_${entry.logId}`,
      sourceType: 'health' as const,
      title: `Fitbit Weight: ${entry.weight} kg, BMI ${entry.bmi.toFixed(1)} (${entry.date})`,
      content: `Fitbit weight log on ${entry.date}: ${entry.weight} kg, BMI ${entry.bmi.toFixed(1)}${entry.fat !== undefined ? `, body fat ${entry.fat}%` : ''}`,
      timestamp: `${entry.date}T${entry.time}`,
      metadata: {
        provider: 'fitbit',
        type: 'weight_log',
        logId: entry.logId,
        date: entry.date,
        weight: entry.weight,
        bmi: entry.bmi,
        fat: entry.fat,
        source: entry.source,
      },
    }));
  }
}
