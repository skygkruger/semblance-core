/**
 * WhoopAdapter — Gateway service adapter for the WHOOP Developer API v1.
 *
 * Extends BasePKCEAdapter because WHOOP uses PKCE (S256) for OAuth.
 * Handles OAuth authentication flow, token management, and data sync
 * for cycles, recovery, sleep, and workout data.
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

const WHOOP_SCOPES = 'read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement';

/** WHOOP API base URL */
const API_BASE = 'https://api.prod.whoop.com/developer/v1';

/** Build the OAuthConfig for WHOOP. */
export function getWhoopOAuthConfig(): OAuthConfig {
  return {
    providerKey: 'whoop',
    authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    scopes: WHOOP_SCOPES,
    usePKCE: true,
    clientId: oauthClients.whoop.clientId,
  };
}

interface WhoopUserProfile {
  user_id: number;
  email?: string;
  first_name?: string;
  last_name?: string;
}

interface WhoopCycle {
  id: number;
  user_id: number;
  start: string;
  end: string | null;
  score?: {
    strain: number;
    kilojoule: number;
    average_heart_rate: number;
    max_heart_rate: number;
  };
}

interface WhoopRecovery {
  cycle_id: number;
  user_id: number;
  score?: {
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
    spo2_percentage?: number;
    skin_temp_celsius?: number;
  };
  created_at: string;
  updated_at: string;
}

interface WhoopSleep {
  id: number;
  user_id: number;
  start: string;
  end: string;
  score?: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_light_sleep_time_milli: number;
      total_slow_wave_sleep_time_milli: number;
      total_rem_sleep_time_milli: number;
      sleep_cycle_count: number;
      disturbance_count: number;
    };
    sleep_needed?: { baseline_milli: number; need_from_sleep_debt_milli: number };
    respiratory_rate?: number;
    sleep_performance_percentage?: number;
    sleep_consistency_percentage?: number;
    sleep_efficiency_percentage?: number;
  };
  nap: boolean;
}

interface WhoopPaginatedResponse<T> {
  records: T[];
  next_token: string | null;
}

export class WhoopAdapter extends BasePKCEAdapter {
  constructor(tokenManager: OAuthTokenManager) {
    super(tokenManager, getWhoopOAuthConfig());
  }

  protected async getUserInfo(accessToken: string): Promise<{ email?: string; displayName?: string }> {
    const response = await globalThis.fetch(`${API_BASE}/user/profile/basic`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`WHOOP user info failed: HTTP ${response.status}`);
    }

    const profile = await response.json() as WhoopUserProfile;
    const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || undefined;
    return {
      email: profile.email,
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
            error: { code: 'UNKNOWN_ACTION', message: `WhoopAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'WHOOP_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Sync cycles, recovery, and sleep data from WHOOP.
   * Returns ImportedItem[] for the knowledge graph pipeline.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const limit = (payload['limit'] as number) ?? 25;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    // 1. Cycles (strain data)
    try {
      const cycleItems = await this.fetchCycles(accessToken, limit);
      items.push(...cycleItems);
    } catch (err) {
      errors.push({ message: `Cycles: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 2. Recovery
    try {
      const recoveryItems = await this.fetchRecovery(accessToken, limit);
      items.push(...recoveryItems);
    } catch (err) {
      errors.push({ message: `Recovery: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 3. Sleep
    try {
      const sleepItems = await this.fetchSleep(accessToken, limit);
      items.push(...sleepItems);
    } catch (err) {
      errors.push({ message: `Sleep: ${err instanceof Error ? err.message : String(err)}` });
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
    const pageSize = (payload['pageSize'] as number) ?? 25;
    const pageToken = payload['pageToken'] as string | undefined;

    const url = new URL(`${API_BASE}/cycle`);
    url.searchParams.set('limit', String(Math.min(pageSize, 25)));
    if (pageToken) {
      url.searchParams.set('nextToken', pageToken);
    }

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'WHOOP_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as WhoopPaginatedResponse<WhoopCycle>;
    const items = data.records.map((cycle) => this.cycleToImportedItem(cycle));

    return {
      success: true,
      data: {
        items,
        nextPageToken: data.next_token,
      },
    };
  }

  private async fetchCycles(accessToken: string, limit: number): Promise<ImportedItem[]> {
    const url = new URL(`${API_BASE}/cycle`);
    url.searchParams.set('limit', String(Math.min(limit, 25)));

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as WhoopPaginatedResponse<WhoopCycle>;
    return data.records.map((cycle) => this.cycleToImportedItem(cycle));
  }

  private cycleToImportedItem(cycle: WhoopCycle): ImportedItem {
    const strain = cycle.score?.strain ?? 0;
    const day = cycle.start.split('T')[0]!;
    return {
      id: `whp_cycle_${cycle.id}`,
      sourceType: 'health' as const,
      title: `WHOOP Cycle: Strain ${strain.toFixed(1)} (${day})`,
      content: `WHOOP cycle on ${day}: strain ${strain.toFixed(1)}, ${cycle.score?.kilojoule?.toFixed(0) ?? 0} kJ, avg HR ${cycle.score?.average_heart_rate ?? 'N/A'} bpm, max HR ${cycle.score?.max_heart_rate ?? 'N/A'} bpm`,
      timestamp: cycle.start,
      metadata: {
        provider: 'whoop',
        type: 'cycle',
        cycleId: cycle.id,
        strain: cycle.score?.strain,
        kilojoule: cycle.score?.kilojoule,
        averageHeartRate: cycle.score?.average_heart_rate,
        maxHeartRate: cycle.score?.max_heart_rate,
      },
    };
  }

  private async fetchRecovery(accessToken: string, limit: number): Promise<ImportedItem[]> {
    const url = new URL(`${API_BASE}/recovery`);
    url.searchParams.set('limit', String(Math.min(limit, 25)));

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as WhoopPaginatedResponse<WhoopRecovery>;
    return data.records.map((rec) => {
      const day = rec.created_at.split('T')[0]!;
      const score = rec.score?.recovery_score ?? 0;
      return {
        id: `whp_recovery_${rec.cycle_id}`,
        sourceType: 'health' as const,
        title: `WHOOP Recovery: ${score}% (${day})`,
        content: `WHOOP recovery on ${day}: ${score}% recovery, resting HR ${rec.score?.resting_heart_rate ?? 'N/A'} bpm, HRV ${rec.score?.hrv_rmssd_milli ?? 'N/A'} ms, SpO2 ${rec.score?.spo2_percentage ?? 'N/A'}%`,
        timestamp: rec.created_at,
        metadata: {
          provider: 'whoop',
          type: 'recovery',
          cycleId: rec.cycle_id,
          recoveryScore: rec.score?.recovery_score,
          restingHeartRate: rec.score?.resting_heart_rate,
          hrvRmssd: rec.score?.hrv_rmssd_milli,
          spo2: rec.score?.spo2_percentage,
          skinTemp: rec.score?.skin_temp_celsius,
        },
      };
    });
  }

  private async fetchSleep(accessToken: string, limit: number): Promise<ImportedItem[]> {
    const url = new URL(`${API_BASE}/sleep`);
    url.searchParams.set('limit', String(Math.min(limit, 25)));

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as WhoopPaginatedResponse<WhoopSleep>;
    return data.records.map((sleep) => {
      const day = sleep.start.split('T')[0]!;
      const totalSleepMs = sleep.score?.stage_summary.total_in_bed_time_milli ?? 0;
      const totalSleepHrs = (totalSleepMs / 3_600_000).toFixed(1);
      const performance = sleep.score?.sleep_performance_percentage ?? 0;

      return {
        id: `whp_sleep_${sleep.id}`,
        sourceType: 'health' as const,
        title: `WHOOP Sleep: ${totalSleepHrs}h, ${performance}% performance (${day})`,
        content: `WHOOP sleep on ${day}: ${totalSleepHrs} hours in bed, ${performance}% performance, ${sleep.score?.sleep_efficiency_percentage ?? 'N/A'}% efficiency. REM: ${((sleep.score?.stage_summary.total_rem_sleep_time_milli ?? 0) / 3_600_000).toFixed(1)}h, Deep: ${((sleep.score?.stage_summary.total_slow_wave_sleep_time_milli ?? 0) / 3_600_000).toFixed(1)}h${sleep.nap ? ' (nap)' : ''}`,
        timestamp: sleep.start,
        metadata: {
          provider: 'whoop',
          type: 'sleep',
          sleepId: sleep.id,
          isNap: sleep.nap,
          totalInBedMs: sleep.score?.stage_summary.total_in_bed_time_milli,
          totalRemMs: sleep.score?.stage_summary.total_rem_sleep_time_milli,
          totalDeepMs: sleep.score?.stage_summary.total_slow_wave_sleep_time_milli,
          totalLightMs: sleep.score?.stage_summary.total_light_sleep_time_milli,
          sleepPerformance: sleep.score?.sleep_performance_percentage,
          sleepEfficiency: sleep.score?.sleep_efficiency_percentage,
          sleepConsistency: sleep.score?.sleep_consistency_percentage,
          respiratoryRate: sleep.score?.respiratory_rate,
          disturbanceCount: sleep.score?.stage_summary.disturbance_count,
        },
      };
    });
  }
}
