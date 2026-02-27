/**
 * StravaAdapter — Gateway service adapter for the Strava API v3.
 *
 * Extends BaseOAuthAdapter (standard OAuth 2.0, not PKCE).
 * Handles OAuth authentication flow, token management, and data sync
 * for activity summaries. Does NOT import raw GPS data (privacy).
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

const STRAVA_SCOPES = 'activity:read_all';

/** Strava API base URL */
const API_BASE = 'https://www.strava.com/api/v3';

/** Build the OAuthConfig for Strava. */
export function getStravaOAuthConfig(): OAuthConfig {
  return {
    providerKey: 'strava',
    authUrl: 'https://www.strava.com/oauth/authorize',
    tokenUrl: 'https://www.strava.com/oauth/token',
    scopes: STRAVA_SCOPES,
    usePKCE: false,
    clientId: oauthClients.strava.clientId,
    clientSecret: oauthClients.strava.clientSecret,
    revokeUrl: 'https://www.strava.com/oauth/deauthorize',
  };
}

interface StravaAthlete {
  id: number;
  username?: string;
  firstname?: string;
  lastname?: string;
  city?: string;
  state?: string;
  country?: string;
  profile?: string;
  weight?: number;
}

interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  total_elevation_gain: number;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  kilojoules?: number;
  suffer_score?: number;
  achievement_count: number;
  kudos_count: number;
  comment_count: number;
  trainer: boolean;
  commute: boolean;
  manual: boolean;
  average_cadence?: number;
  calories?: number;
}

export class StravaAdapter extends BaseOAuthAdapter {
  constructor(tokenManager: OAuthTokenManager) {
    super(tokenManager, getStravaOAuthConfig());
  }

  protected async getUserInfo(accessToken: string): Promise<{ email?: string; displayName?: string }> {
    const response = await globalThis.fetch(`${API_BASE}/athlete`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Strava user info failed: HTTP ${response.status}`);
    }

    const athlete = await response.json() as StravaAthlete;
    const displayName = [athlete.firstname, athlete.lastname].filter(Boolean).join(' ') || athlete.username;
    return {
      displayName,
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
            error: { code: 'UNKNOWN_ACTION', message: `StravaAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'STRAVA_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Sync activity summaries from Strava.
   * Returns ImportedItem[] for the knowledge graph pipeline.
   * NOTE: Only imports activity summaries, not raw GPS data.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const since = payload['since'] as string | undefined;
    const limit = (payload['limit'] as number) ?? 100;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    try {
      const activities = await this.fetchActivities(accessToken, since, limit);
      items.push(...activities);
    } catch (err) {
      errors.push({ message: `Activities: ${err instanceof Error ? err.message : String(err)}` });
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
    const pageSize = (payload['pageSize'] as number) ?? 30;
    const pageToken = payload['pageToken'] as string | undefined;

    // Strava uses page-based pagination (1-indexed)
    const page = pageToken ? parseInt(pageToken, 10) : 1;

    const url = new URL(`${API_BASE}/athlete/activities`);
    url.searchParams.set('per_page', String(Math.min(pageSize, 100)));
    url.searchParams.set('page', String(page));

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'STRAVA_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const activities = await response.json() as StravaActivity[];
    const items = activities.map((activity) => this.activityToImportedItem(activity));

    // If we got a full page, there might be more
    const nextPageToken = activities.length >= Math.min(pageSize, 100) ? String(page + 1) : null;

    return {
      success: true,
      data: {
        items,
        nextPageToken,
      },
    };
  }

  private async fetchActivities(accessToken: string, since: string | undefined, limit: number): Promise<ImportedItem[]> {
    const allItems: ImportedItem[] = [];
    let page = 1;
    const perPage = Math.min(limit, 100);

    while (allItems.length < limit) {
      const url = new URL(`${API_BASE}/athlete/activities`);
      url.searchParams.set('per_page', String(perPage));
      url.searchParams.set('page', String(page));

      if (since) {
        const afterEpoch = Math.floor(new Date(since).getTime() / 1000);
        url.searchParams.set('after', String(afterEpoch));
      }

      const response = await globalThis.fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const activities = await response.json() as StravaActivity[];
      if (activities.length === 0) break;

      for (const activity of activities) {
        if (allItems.length >= limit) break;
        allItems.push(this.activityToImportedItem(activity));
      }

      if (activities.length < perPage) break;
      page++;
    }

    return allItems;
  }

  private activityToImportedItem(activity: StravaActivity): ImportedItem {
    const distanceKm = (activity.distance / 1000).toFixed(2);
    const durationMin = Math.round(activity.moving_time / 60);
    const day = activity.start_date_local.split('T')[0]!;

    return {
      id: `stv_activity_${activity.id}`,
      sourceType: 'health' as const,
      title: `Strava ${activity.type}: ${activity.name} (${day})`,
      content: `${activity.type} "${activity.name}" on ${day}: ${distanceKm} km in ${durationMin} min, elevation gain ${activity.total_elevation_gain} m, avg speed ${activity.average_speed.toFixed(1)} m/s${activity.average_heartrate ? `, avg HR ${activity.average_heartrate} bpm` : ''}${activity.calories ? `, ${activity.calories} cal` : ''}${activity.commute ? ' (commute)' : ''}`,
      timestamp: activity.start_date,
      metadata: {
        provider: 'strava',
        type: 'activity',
        activityId: activity.id,
        activityType: activity.type,
        sportType: activity.sport_type,
        name: activity.name,
        distanceMeters: activity.distance,
        movingTimeSeconds: activity.moving_time,
        elapsedTimeSeconds: activity.elapsed_time,
        totalElevationGain: activity.total_elevation_gain,
        averageSpeed: activity.average_speed,
        maxSpeed: activity.max_speed,
        averageHeartrate: activity.average_heartrate,
        maxHeartrate: activity.max_heartrate,
        averageWatts: activity.average_watts,
        kilojoules: activity.kilojoules,
        sufferScore: activity.suffer_score,
        calories: activity.calories,
        averageCadence: activity.average_cadence,
        achievementCount: activity.achievement_count,
        kudosCount: activity.kudos_count,
        isTrainer: activity.trainer,
        isCommute: activity.commute,
        isManual: activity.manual,
      },
    };
  }
}
