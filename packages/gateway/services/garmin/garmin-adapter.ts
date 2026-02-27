/**
 * GarminAdapter — Gateway service adapter for the Garmin Connect Wellness API.
 *
 * Uses OAuth 1.0a (NOT OAuth 2.0). Garmin is one of the few major fitness
 * platforms that still requires OAuth 1.0a, along with a push-based data model.
 *
 * Implements ServiceAdapter directly and uses OAuth1Signer for request signing.
 * Handles the full 3-legged OAuth 1.0a flow: request token, user authorize,
 * access token exchange.
 *
 * All HTTP calls use globalThis.fetch. No external HTTP libraries.
 */

import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from '../types.js';
import type { AdapterResult } from '../base-oauth-adapter.js';
import type { ImportedItem } from '@semblance/core/importers/types.js';
import type { OAuthTokenManager } from '../oauth-token-manager.js';
import { generateOAuth1Header, type OAuth1Credentials } from '../oauth1-signer.js';
import { OAuthCallbackServer } from '../oauth-callback-server.js';
import { oauthClients } from '../../config/oauth-clients.js';

/** Garmin OAuth 1.0a endpoints */
const REQUEST_TOKEN_URL = 'https://connectapi.garmin.com/oauth-service/oauth/request_token';
const AUTHORIZE_URL = 'https://connect.garmin.com/oauthConfirm';
const ACCESS_TOKEN_URL = 'https://connectapi.garmin.com/oauth-service/oauth/access_token';

/** Garmin Wellness API base URL */
const WELLNESS_API_BASE = 'https://apis.garmin.com/wellness-api/rest';

/** Provider key used in OAuthTokenManager */
const PROVIDER_KEY = 'garmin';

interface GarminDailySummary {
  summaryId: string;
  calendarDate: string;
  startTimeInSeconds: number;
  startTimeOffsetInSeconds: number;
  durationInSeconds: number;
  steps: number;
  distanceInMeters: number;
  activeTimeInSeconds: number;
  activeKilocalories: number;
  bmrKilocalories: number;
  floorsClimbed?: number;
  minHeartRateInBeatsPerMinute?: number;
  maxHeartRateInBeatsPerMinute?: number;
  averageHeartRateInBeatsPerMinute?: number;
  restingHeartRateInBeatsPerMinute?: number;
  moderateIntensityDurationInSeconds?: number;
  vigorousIntensityDurationInSeconds?: number;
  stressDurationInSeconds?: number;
  averageStressLevel?: number;
}

interface GarminActivity {
  activityId: number;
  activityName: string;
  activityType: string;
  startTimeInSeconds: number;
  startTimeOffsetInSeconds: number;
  durationInSeconds: number;
  distanceInMeters: number;
  activeKilocalories: number;
  averageHeartRateInBeatsPerMinute?: number;
  maxHeartRateInBeatsPerMinute?: number;
  averageSpeedInMetersPerSecond?: number;
  maxSpeedInMetersPerSecond?: number;
  steps?: number;
  elevationGainInMeters?: number;
}

interface GarminSleepSummary {
  summaryId: string;
  calendarDate: string;
  startTimeInSeconds: number;
  durationInSeconds: number;
  deepSleepDurationInSeconds: number;
  lightSleepDurationInSeconds: number;
  remSleepInSeconds: number;
  awakeDurationInSeconds: number;
  unmeasurableSleepInSeconds?: number;
  validation: string;
}

interface GarminBodyComp {
  summaryId: string;
  measurementTimeInSeconds: number;
  weightInGrams: number;
  bmi?: number;
  bodyFatPercentage?: number;
  muscleMassInGrams?: number;
  boneMassInGrams?: number;
  bodyWaterPercentage?: number;
}

export class GarminAdapter implements ServiceAdapter {
  private tokenManager: OAuthTokenManager;
  private consumerKey: string;
  private consumerSecret: string;

  constructor(tokenManager: OAuthTokenManager) {
    this.tokenManager = tokenManager;
    this.consumerKey = oauthClients.garmin.consumerKey;
    this.consumerSecret = oauthClients.garmin.consumerSecret ?? '';
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
            error: { code: 'UNKNOWN_ACTION', message: `GarminAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'GARMIN_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * OAuth 1.0a three-legged flow:
   * 1. Get request token (temporary credentials)
   * 2. Direct user to authorize URL
   * 3. Exchange request token + verifier for access token
   */
  private async performAuthFlow(): Promise<AdapterResult> {
    const callbackServer = new OAuthCallbackServer();
    const { callbackUrl } = await callbackServer.start();

    // Step 1: Get request token
    const requestTokenCredentials: OAuth1Credentials = {
      consumerKey: this.consumerKey,
      consumerSecret: this.consumerSecret,
    };

    const requestTokenHeader = generateOAuth1Header(requestTokenCredentials, {
      method: 'POST',
      url: REQUEST_TOKEN_URL,
      extraParams: { oauth_callback: callbackUrl },
    });

    const requestTokenResponse = await globalThis.fetch(REQUEST_TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: requestTokenHeader },
    });

    if (!requestTokenResponse.ok) {
      callbackServer.stop();
      return {
        success: false,
        error: {
          code: 'REQUEST_TOKEN_ERROR',
          message: `Failed to get request token: HTTP ${requestTokenResponse.status}`,
        },
      };
    }

    const requestTokenBody = await requestTokenResponse.text();
    const requestTokenParams = new URLSearchParams(requestTokenBody);
    const oauthToken = requestTokenParams.get('oauth_token');
    const oauthTokenSecret = requestTokenParams.get('oauth_token_secret');

    if (!oauthToken || !oauthTokenSecret) {
      callbackServer.stop();
      return {
        success: false,
        error: { code: 'REQUEST_TOKEN_ERROR', message: 'Missing oauth_token or oauth_token_secret in response' },
      };
    }

    // Step 2: Build authorize URL — user visits this in browser
    const _authorizeUrl = `${AUTHORIZE_URL}?oauth_token=${encodeURIComponent(oauthToken)}`;

    try {
      // Step 3: Wait for callback with oauth_verifier
      const { code: oauthVerifier } = await callbackServer.waitForCallback();

      // Step 4: Exchange for access token
      const accessTokenCredentials: OAuth1Credentials = {
        consumerKey: this.consumerKey,
        consumerSecret: this.consumerSecret,
        token: oauthToken,
        tokenSecret: oauthTokenSecret,
      };

      const accessTokenHeader = generateOAuth1Header(accessTokenCredentials, {
        method: 'POST',
        url: ACCESS_TOKEN_URL,
        extraParams: { oauth_verifier: oauthVerifier },
      });

      const accessTokenResponse = await globalThis.fetch(ACCESS_TOKEN_URL, {
        method: 'POST',
        headers: { Authorization: accessTokenHeader },
      });

      if (!accessTokenResponse.ok) {
        return {
          success: false,
          error: {
            code: 'ACCESS_TOKEN_ERROR',
            message: `Failed to get access token: HTTP ${accessTokenResponse.status}`,
          },
        };
      }

      const accessTokenBody = await accessTokenResponse.text();
      const accessTokenParams = new URLSearchParams(accessTokenBody);
      const accessToken = accessTokenParams.get('oauth_token');
      const accessTokenSecret = accessTokenParams.get('oauth_token_secret');

      if (!accessToken || !accessTokenSecret) {
        return {
          success: false,
          error: { code: 'ACCESS_TOKEN_ERROR', message: 'Missing tokens in access token response' },
        };
      }

      // Store the OAuth 1.0a tokens. We use accessToken as the "access token"
      // and accessTokenSecret as the "refresh token" field (reused for signing).
      // expires_at is set far in the future since OAuth 1.0a tokens don't expire.
      this.tokenManager.storeTokens({
        provider: PROVIDER_KEY,
        accessToken,
        refreshToken: accessTokenSecret,
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
        scopes: 'wellness',
      });

      return {
        success: true,
        data: {
          provider: PROVIDER_KEY,
          displayName: 'Garmin Connect',
        },
      };
    } catch (err) {
      callbackServer.stop();
      return {
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  private handleAuthStatus(): AdapterResult {
    const hasTokens = this.tokenManager.hasValidTokens(PROVIDER_KEY);
    const email = this.tokenManager.getUserEmail(PROVIDER_KEY);
    return {
      success: true,
      data: { authenticated: hasTokens, userEmail: email },
    };
  }

  private async performDisconnect(): Promise<AdapterResult> {
    this.tokenManager.revokeTokens(PROVIDER_KEY);
    return { success: true, data: { disconnected: true } };
  }

  /**
   * Sync dailies, activities, sleep, and body comp data from Garmin.
   * Returns ImportedItem[] for the knowledge graph pipeline.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const since = payload['since'] as string | undefined;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    // Calculate time range (default: last 7 days)
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = since
      ? Math.floor(new Date(since).getTime() / 1000)
      : endTime - 7 * 24 * 60 * 60;

    // 1. Daily summaries
    try {
      const dailyItems = await this.fetchDailies(startTime, endTime);
      items.push(...dailyItems);
    } catch (err) {
      errors.push({ message: `Dailies: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 2. Activities
    try {
      const activityItems = await this.fetchActivities(startTime, endTime);
      items.push(...activityItems);
    } catch (err) {
      errors.push({ message: `Activities: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 3. Sleep
    try {
      const sleepItems = await this.fetchSleeps(startTime, endTime);
      items.push(...sleepItems);
    } catch (err) {
      errors.push({ message: `Sleep: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 4. Body composition
    try {
      const bodyItems = await this.fetchBodyComps(startTime, endTime);
      items.push(...bodyItems);
    } catch (err) {
      errors.push({ message: `Body comp: ${err instanceof Error ? err.message : String(err)}` });
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

  private async handleListItems(payload: Record<string, unknown>): Promise<AdapterResult> {
    const pageToken = payload['pageToken'] as string | undefined;

    const endTime = pageToken ? parseInt(pageToken, 10) : Math.floor(Date.now() / 1000);
    const startTime = endTime - 7 * 24 * 60 * 60;

    const items = await this.fetchDailies(startTime, endTime);
    const nextPageToken = String(startTime);

    return {
      success: true,
      data: {
        items,
        nextPageToken,
      },
    };
  }

  /**
   * Make an authenticated API call to the Garmin Wellness API.
   * Signs the request using OAuth 1.0a HMAC-SHA1.
   */
  private async garminApiCall<T>(url: string): Promise<T> {
    const accessToken = this.tokenManager.getAccessToken(PROVIDER_KEY);
    const tokenSecret = this.tokenManager.getRefreshToken(PROVIDER_KEY);

    if (!accessToken || !tokenSecret) {
      throw new Error('Not authenticated with Garmin Connect');
    }

    const credentials: OAuth1Credentials = {
      consumerKey: this.consumerKey,
      consumerSecret: this.consumerSecret,
      token: accessToken,
      tokenSecret,
    };

    const authHeader = generateOAuth1Header(credentials, {
      method: 'GET',
      url,
    });

    const response = await globalThis.fetch(url, {
      method: 'GET',
      headers: { Authorization: authHeader },
    });

    if (!response.ok) {
      throw new Error(`Garmin API error: HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private async fetchDailies(startTime: number, endTime: number): Promise<ImportedItem[]> {
    const url = `${WELLNESS_API_BASE}/dailies?uploadStartTimeInSeconds=${startTime}&uploadEndTimeInSeconds=${endTime}`;
    const data = await this.garminApiCall<GarminDailySummary[]>(url);

    return data.map((daily) => ({
      id: `gmn_daily_${daily.summaryId}`,
      sourceType: 'health' as const,
      title: `Garmin Daily: ${daily.steps} steps (${daily.calendarDate})`,
      content: `Garmin daily summary on ${daily.calendarDate}: ${daily.steps} steps, ${(daily.distanceInMeters / 1000).toFixed(1)} km, ${daily.activeKilocalories} active kcal${daily.averageHeartRateInBeatsPerMinute ? `, avg HR ${daily.averageHeartRateInBeatsPerMinute} bpm` : ''}${daily.restingHeartRateInBeatsPerMinute ? `, resting HR ${daily.restingHeartRateInBeatsPerMinute} bpm` : ''}${daily.floorsClimbed ? `, ${daily.floorsClimbed} floors` : ''}${daily.averageStressLevel !== undefined ? `, avg stress ${daily.averageStressLevel}` : ''}`,
      timestamp: new Date(daily.startTimeInSeconds * 1000).toISOString(),
      metadata: {
        provider: 'garmin',
        type: 'daily_summary',
        summaryId: daily.summaryId,
        calendarDate: daily.calendarDate,
        steps: daily.steps,
        distanceInMeters: daily.distanceInMeters,
        activeKilocalories: daily.activeKilocalories,
        bmrKilocalories: daily.bmrKilocalories,
        floorsClimbed: daily.floorsClimbed,
        averageHeartRate: daily.averageHeartRateInBeatsPerMinute,
        maxHeartRate: daily.maxHeartRateInBeatsPerMinute,
        restingHeartRate: daily.restingHeartRateInBeatsPerMinute,
        moderateIntensitySeconds: daily.moderateIntensityDurationInSeconds,
        vigorousIntensitySeconds: daily.vigorousIntensityDurationInSeconds,
        averageStressLevel: daily.averageStressLevel,
        activeTimeSeconds: daily.activeTimeInSeconds,
      },
    }));
  }

  private async fetchActivities(startTime: number, endTime: number): Promise<ImportedItem[]> {
    const url = `${WELLNESS_API_BASE}/activities?uploadStartTimeInSeconds=${startTime}&uploadEndTimeInSeconds=${endTime}`;
    const data = await this.garminApiCall<GarminActivity[]>(url);

    return data.map((activity) => {
      const durationMin = Math.round(activity.durationInSeconds / 60);
      const distanceKm = (activity.distanceInMeters / 1000).toFixed(2);
      const startDate = new Date(activity.startTimeInSeconds * 1000).toISOString();
      const day = startDate.split('T')[0]!;

      return {
        id: `gmn_activity_${activity.activityId}`,
        sourceType: 'health' as const,
        title: `Garmin ${activity.activityType}: ${activity.activityName} (${day})`,
        content: `${activity.activityType} "${activity.activityName}" on ${day}: ${distanceKm} km in ${durationMin} min, ${activity.activeKilocalories} kcal${activity.averageHeartRateInBeatsPerMinute ? `, avg HR ${activity.averageHeartRateInBeatsPerMinute} bpm` : ''}${activity.elevationGainInMeters ? `, ${activity.elevationGainInMeters} m elevation gain` : ''}`,
        timestamp: startDate,
        metadata: {
          provider: 'garmin',
          type: 'activity',
          activityId: activity.activityId,
          activityType: activity.activityType,
          activityName: activity.activityName,
          durationSeconds: activity.durationInSeconds,
          distanceMeters: activity.distanceInMeters,
          activeKilocalories: activity.activeKilocalories,
          averageHeartRate: activity.averageHeartRateInBeatsPerMinute,
          maxHeartRate: activity.maxHeartRateInBeatsPerMinute,
          averageSpeed: activity.averageSpeedInMetersPerSecond,
          maxSpeed: activity.maxSpeedInMetersPerSecond,
          steps: activity.steps,
          elevationGain: activity.elevationGainInMeters,
        },
      };
    });
  }

  private async fetchSleeps(startTime: number, endTime: number): Promise<ImportedItem[]> {
    const url = `${WELLNESS_API_BASE}/sleeps?uploadStartTimeInSeconds=${startTime}&uploadEndTimeInSeconds=${endTime}`;
    const data = await this.garminApiCall<GarminSleepSummary[]>(url);

    return data.map((sleep) => {
      const totalHours = (sleep.durationInSeconds / 3600).toFixed(1);
      const deepHours = (sleep.deepSleepDurationInSeconds / 3600).toFixed(1);
      const lightHours = (sleep.lightSleepDurationInSeconds / 3600).toFixed(1);
      const remHours = (sleep.remSleepInSeconds / 3600).toFixed(1);

      return {
        id: `gmn_sleep_${sleep.summaryId}`,
        sourceType: 'health' as const,
        title: `Garmin Sleep: ${totalHours}h (${sleep.calendarDate})`,
        content: `Garmin sleep on ${sleep.calendarDate}: ${totalHours} hours total, deep ${deepHours}h, light ${lightHours}h, REM ${remHours}h, awake ${(sleep.awakeDurationInSeconds / 60).toFixed(0)} min`,
        timestamp: new Date(sleep.startTimeInSeconds * 1000).toISOString(),
        metadata: {
          provider: 'garmin',
          type: 'sleep',
          summaryId: sleep.summaryId,
          calendarDate: sleep.calendarDate,
          durationSeconds: sleep.durationInSeconds,
          deepSleepSeconds: sleep.deepSleepDurationInSeconds,
          lightSleepSeconds: sleep.lightSleepDurationInSeconds,
          remSleepSeconds: sleep.remSleepInSeconds,
          awakeSeconds: sleep.awakeDurationInSeconds,
          validation: sleep.validation,
        },
      };
    });
  }

  private async fetchBodyComps(startTime: number, endTime: number): Promise<ImportedItem[]> {
    const url = `${WELLNESS_API_BASE}/bodyComps?uploadStartTimeInSeconds=${startTime}&uploadEndTimeInSeconds=${endTime}`;
    const data = await this.garminApiCall<GarminBodyComp[]>(url);

    return data.map((comp) => {
      const weightKg = (comp.weightInGrams / 1000).toFixed(1);
      const date = new Date(comp.measurementTimeInSeconds * 1000).toISOString();
      const day = date.split('T')[0]!;

      return {
        id: `gmn_bodycomp_${comp.summaryId}`,
        sourceType: 'health' as const,
        title: `Garmin Body: ${weightKg} kg${comp.bmi ? `, BMI ${comp.bmi.toFixed(1)}` : ''} (${day})`,
        content: `Garmin body composition on ${day}: ${weightKg} kg${comp.bmi ? `, BMI ${comp.bmi.toFixed(1)}` : ''}${comp.bodyFatPercentage !== undefined ? `, body fat ${comp.bodyFatPercentage.toFixed(1)}%` : ''}${comp.muscleMassInGrams !== undefined ? `, muscle ${(comp.muscleMassInGrams / 1000).toFixed(1)} kg` : ''}`,
        timestamp: date,
        metadata: {
          provider: 'garmin',
          type: 'body_composition',
          summaryId: comp.summaryId,
          weightGrams: comp.weightInGrams,
          bmi: comp.bmi,
          bodyFatPercentage: comp.bodyFatPercentage,
          muscleMassGrams: comp.muscleMassInGrams,
          boneMassGrams: comp.boneMassInGrams,
          bodyWaterPercentage: comp.bodyWaterPercentage,
        },
      };
    });
  }
}
