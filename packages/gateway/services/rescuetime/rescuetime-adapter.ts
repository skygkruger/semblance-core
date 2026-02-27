/**
 * RescueTimeAdapter — Gateway service adapter for the RescueTime Anapi.
 *
 * Does NOT extend BaseOAuthAdapter — uses API key authentication.
 * Implements ServiceAdapter directly. Auth is API key passed as a
 * query parameter (?key=...) on every request.
 *
 * Handles productivity data sync for digital wellness tracking.
 *
 * All HTTP calls use globalThis.fetch. No external HTTP libraries.
 */

import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from '../types.js';
import type { AdapterResult } from '../base-oauth-adapter.js';
import type { ImportedItem } from '@semblance/core/importers/types.js';
import type { OAuthTokenManager } from '../oauth-token-manager.js';

/** RescueTime API base URL */
const API_BASE = 'https://www.rescuetime.com/anapi';

/** Provider key used in OAuthTokenManager for API key storage */
const PROVIDER_KEY = 'rescuetime';

/** RescueTime productivity levels */
const PRODUCTIVITY_LABELS: Record<number, string> = {
  '-2': 'Very Distracting',
  '-1': 'Distracting',
  '0': 'Neutral',
  '1': 'Productive',
  '2': 'Very Productive',
};

interface RescueTimeDataRow {
  /** Row array: [rank, time_spent_seconds, number_of_people, activity, category, productivity] */
  0: number; // rank
  1: number; // time_spent_seconds
  2: number; // number_of_people (always 1 for personal)
  3: string; // activity
  4: string; // category
  5: number; // productivity (-2 to 2)
}

interface RescueTimeResponse {
  notes: string;
  row_headers: string[];
  rows: RescueTimeDataRow[];
}

interface RescueTimeDailySummary {
  id: string;
  date: string;
  productivity_pulse: number;
  very_productive_percentage: number;
  productive_percentage: number;
  neutral_percentage: number;
  distracting_percentage: number;
  very_distracting_percentage: number;
  all_productive_percentage: number;
  all_distracting_percentage: number;
  uncategorized_percentage: number;
  total_hours: number;
  very_productive_hours: number;
  productive_hours: number;
  neutral_hours: number;
  distracting_hours: number;
  very_distracting_hours: number;
  total_duration_formatted: string;
}

export class RescueTimeAdapter implements ServiceAdapter {
  private tokenManager: OAuthTokenManager;

  constructor(tokenManager: OAuthTokenManager) {
    this.tokenManager = tokenManager;
  }

  async execute(action: ActionType, payload: unknown): Promise<AdapterResult> {
    const p = payload as Record<string, unknown>;

    try {
      switch (action) {
        case 'connector.auth':
          return await this.handleAuth(p);

        case 'connector.auth_status':
          return this.handleAuthStatus();

        case 'connector.disconnect':
          return this.handleDisconnect();

        case 'connector.sync':
          return await this.handleSync(p);

        case 'connector.list_items':
          return await this.handleListItems(p);

        default:
          return {
            success: false,
            error: { code: 'UNKNOWN_ACTION', message: `RescueTimeAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'RESCUETIME_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Authenticate with an API key. Validates the key by making a test request.
   * The API key is passed in payload.apiKey.
   */
  private async handleAuth(payload: Record<string, unknown>): Promise<AdapterResult> {
    const apiKey = payload['apiKey'] as string | undefined;

    if (!apiKey) {
      return {
        success: false,
        error: { code: 'MISSING_API_KEY', message: 'payload.apiKey is required for RescueTime authentication' },
      };
    }

    // Validate the key by making a small data request
    const url = new URL(`${API_BASE}/data`);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('perspective', 'rank');
    url.searchParams.set('restrict_kind', 'productivity');
    url.searchParams.set('interval', 'day');
    url.searchParams.set('format', 'json');
    // Limit to today to minimize data transfer
    const today = new Date().toISOString().split('T')[0]!;
    url.searchParams.set('restrict_begin', today);
    url.searchParams.set('restrict_end', today);

    const response = await globalThis.fetch(url.toString());

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: 'AUTH_FAILED',
          message: response.status === 403
            ? 'Invalid RescueTime API key'
            : `RescueTime auth validation failed: HTTP ${response.status}`,
        },
      };
    }

    // Verify we get valid JSON back (not an error page)
    try {
      await response.json();
    } catch {
      return {
        success: false,
        error: { code: 'AUTH_FAILED', message: 'Invalid response from RescueTime — API key may be incorrect' },
      };
    }

    // Store the API key. No refresh token for key-based auth.
    this.tokenManager.storeTokens({
      provider: PROVIDER_KEY,
      accessToken: apiKey,
      refreshToken: '',
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
      scopes: 'api_key',
    });

    return {
      success: true,
      data: {
        provider: PROVIDER_KEY,
        displayName: 'RescueTime',
      },
    };
  }

  private handleAuthStatus(): AdapterResult {
    const hasTokens = this.tokenManager.hasValidTokens(PROVIDER_KEY);
    const email = this.tokenManager.getUserEmail(PROVIDER_KEY);
    return {
      success: true,
      data: { authenticated: hasTokens, userEmail: email },
    };
  }

  private handleDisconnect(): AdapterResult {
    this.tokenManager.revokeTokens(PROVIDER_KEY);
    return { success: true, data: { disconnected: true } };
  }

  /**
   * Sync productivity data from RescueTime.
   * Returns ImportedItem[] for the knowledge graph pipeline.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const apiKey = this.getApiKey();
    const since = payload['since'] as string | undefined;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    const endDate = new Date().toISOString().split('T')[0]!;
    const startDate = since
      ? since.split('T')[0]!
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;

    // 1. Productivity summary (ranked by productivity level)
    try {
      const productivityItems = await this.fetchProductivityData(apiKey, startDate, endDate);
      items.push(...productivityItems);
    } catch (err) {
      errors.push({ message: `Productivity data: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 2. Daily summary data
    try {
      const dailyItems = await this.fetchDailySummary(apiKey, startDate, endDate);
      items.push(...dailyItems);
    } catch (err) {
      errors.push({ message: `Daily summary: ${err instanceof Error ? err.message : String(err)}` });
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
    const apiKey = this.getApiKey();
    const pageToken = payload['pageToken'] as string | undefined;

    // Date-based pagination. pageToken is a date string.
    const endDate = pageToken ?? new Date().toISOString().split('T')[0]!;
    const startDateObj = new Date(endDate);
    startDateObj.setDate(startDateObj.getDate() - 7);
    const startDate = startDateObj.toISOString().split('T')[0]!;

    const items = await this.fetchDailySummary(apiKey, startDate, endDate);
    const nextPageToken = startDate;

    return {
      success: true,
      data: {
        items,
        nextPageToken,
      },
    };
  }

  private async fetchProductivityData(apiKey: string, startDate: string, endDate: string): Promise<ImportedItem[]> {
    const url = new URL(`${API_BASE}/data`);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('perspective', 'rank');
    url.searchParams.set('restrict_kind', 'productivity');
    url.searchParams.set('interval', 'day');
    url.searchParams.set('format', 'json');
    url.searchParams.set('restrict_begin', startDate);
    url.searchParams.set('restrict_end', endDate);

    const response = await globalThis.fetch(url.toString());

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as RescueTimeResponse;

    // Group by date for daily productivity summaries
    const byDate = new Map<string, { totalSeconds: number; productiveSeconds: number; distractingSeconds: number; activities: Array<{ name: string; category: string; seconds: number; productivity: number }> }>();

    for (const row of data.rows) {
      const rank = row[0];
      const timeSeconds = row[1];
      const activity = row[3];
      const category = row[4];
      const productivity = row[5];

      // The rank API doesn't include date directly; we use the full range as one entry per activity
      const key = `${startDate}_${endDate}`;
      const existing = byDate.get(key) ?? { totalSeconds: 0, productiveSeconds: 0, distractingSeconds: 0, activities: [] };

      existing.totalSeconds += timeSeconds;
      if (productivity > 0) existing.productiveSeconds += timeSeconds;
      if (productivity < 0) existing.distractingSeconds += timeSeconds;
      existing.activities.push({
        name: activity,
        category,
        seconds: timeSeconds,
        productivity,
      });
      byDate.set(key, existing);

      // Avoid unused variable warning — rank is part of the data structure
      void rank;
    }

    const items: ImportedItem[] = [];
    for (const [key, summary] of byDate) {
      const totalHours = (summary.totalSeconds / 3600).toFixed(1);
      const productiveHours = (summary.productiveSeconds / 3600).toFixed(1);
      const distractingHours = (summary.distractingSeconds / 3600).toFixed(1);
      const productivePercent = summary.totalSeconds > 0
        ? Math.round((summary.productiveSeconds / summary.totalSeconds) * 100)
        : 0;

      // Top 5 activities by time
      const topActivities = summary.activities
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, 5)
        .map(a => `${a.name} (${(a.seconds / 3600).toFixed(1)}h, ${PRODUCTIVITY_LABELS[a.productivity] ?? 'Unknown'})`)
        .join('; ');

      items.push({
        id: `rt_productivity_${key}`,
        sourceType: 'productivity' as const,
        title: `RescueTime: ${productivePercent}% productive, ${totalHours}h tracked (${startDate} to ${endDate})`,
        content: `RescueTime productivity ${startDate} to ${endDate}: ${totalHours} total hours, ${productiveHours}h productive, ${distractingHours}h distracting (${productivePercent}% productive). Top activities: ${topActivities}`,
        timestamp: `${startDate}T00:00:00.000Z`,
        metadata: {
          provider: 'rescuetime',
          type: 'productivity_summary',
          startDate,
          endDate,
          totalSeconds: summary.totalSeconds,
          productiveSeconds: summary.productiveSeconds,
          distractingSeconds: summary.distractingSeconds,
          productivePercentage: productivePercent,
          topActivities: summary.activities
            .sort((a, b) => b.seconds - a.seconds)
            .slice(0, 10),
        },
      });
    }

    return items;
  }

  private async fetchDailySummary(apiKey: string, startDate: string, endDate: string): Promise<ImportedItem[]> {
    const url = new URL(`${API_BASE}/daily_summary_feed`);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('restrict_begin', startDate);
    url.searchParams.set('restrict_end', endDate);
    url.searchParams.set('format', 'json');

    const response = await globalThis.fetch(url.toString());

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as RescueTimeDailySummary[];

    return data.map((day) => ({
      id: `rt_daily_${day.date}`,
      sourceType: 'productivity' as const,
      title: `RescueTime Daily: Pulse ${day.productivity_pulse}, ${day.total_duration_formatted} (${day.date})`,
      content: `RescueTime on ${day.date}: productivity pulse ${day.productivity_pulse}/100, ${day.total_hours.toFixed(1)}h total. Very productive: ${day.very_productive_hours.toFixed(1)}h (${day.very_productive_percentage}%), Productive: ${day.productive_hours.toFixed(1)}h (${day.productive_percentage}%), Neutral: ${day.neutral_hours.toFixed(1)}h (${day.neutral_percentage}%), Distracting: ${day.distracting_hours.toFixed(1)}h (${day.distracting_percentage}%), Very distracting: ${day.very_distracting_hours.toFixed(1)}h (${day.very_distracting_percentage}%)`,
      timestamp: `${day.date}T00:00:00.000Z`,
      metadata: {
        provider: 'rescuetime',
        type: 'daily_summary',
        date: day.date,
        productivityPulse: day.productivity_pulse,
        totalHours: day.total_hours,
        veryProductiveHours: day.very_productive_hours,
        productiveHours: day.productive_hours,
        neutralHours: day.neutral_hours,
        distractingHours: day.distracting_hours,
        veryDistractingHours: day.very_distracting_hours,
        allProductivePercentage: day.all_productive_percentage,
        allDistractingPercentage: day.all_distracting_percentage,
      },
    }));
  }

  /** Get the stored API key from the token manager. */
  private getApiKey(): string {
    const apiKey = this.tokenManager.getAccessToken(PROVIDER_KEY);
    if (!apiKey) {
      throw new Error('Not authenticated with RescueTime. Provide an API key via connector.auth.');
    }
    return apiKey;
  }
}
