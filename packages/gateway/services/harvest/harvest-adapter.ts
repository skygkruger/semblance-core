/**
 * HarvestAdapter — Gateway service adapter for the Harvest API v2.
 *
 * Extends BaseOAuthAdapter (standard OAuth 2.0).
 * Syncs time entries and projects from the user's Harvest account.
 *
 * IMPORTANT: All Harvest API calls require the Harvest-Account-Id header.
 * The account ID is fetched from the /v2/users/me endpoint and stored.
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

const API_BASE = 'https://api.harvestapp.com/v2';

/** Build the OAuthConfig for Harvest. */
export function getHarvestOAuthConfig(): OAuthConfig {
  return {
    providerKey: 'harvest',
    authUrl: 'https://id.getharvest.com/oauth2/authorize',
    tokenUrl: 'https://id.getharvest.com/api/v2/oauth2/token',
    scopes: 'harvest:timers',
    usePKCE: false,
    clientId: oauthClients.harvest.clientId,
    clientSecret: oauthClients.harvest.clientSecret,
  };
}

interface HarvestUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

interface HarvestAccount {
  id: number;
  name: string;
}

interface HarvestMeResponse {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  accounts: HarvestAccount[];
}

interface HarvestTimeEntry {
  id: number;
  spent_date: string;
  hours: number;
  hours_without_timer: number;
  rounded_hours: number;
  notes: string | null;
  is_locked: boolean;
  is_running: boolean;
  is_billed: boolean;
  timer_started_at: string | null;
  started_time: string | null;
  ended_time: string | null;
  created_at: string;
  updated_at: string;
  user: { id: number; name: string };
  client: { id: number; name: string; currency: string };
  project: { id: number; name: string; code: string };
  task: { id: number; name: string };
  billable: boolean;
  billable_rate: number | null;
  cost_rate: number | null;
}

interface HarvestTimeEntriesResponse {
  time_entries: HarvestTimeEntry[];
  per_page: number;
  total_pages: number;
  total_entries: number;
  next_page: number | null;
  previous_page: number | null;
  page: number;
}

interface HarvestProject {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
  is_billable: boolean;
  is_fixed_fee: boolean;
  budget: number | null;
  budget_by: string;
  budget_is_monthly: boolean;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
  updated_at: string;
  notes: string;
  client: { id: number; name: string; currency: string };
  cost_budget: number | null;
  cost_budget_include_expenses: boolean;
  fee: number | null;
  over_budget_notification_percentage: number;
  over_budget_notification_date: string | null;
}

interface HarvestProjectsResponse {
  projects: HarvestProject[];
  per_page: number;
  total_pages: number;
  total_entries: number;
  next_page: number | null;
  previous_page: number | null;
  page: number;
}

export class HarvestAdapter extends BaseOAuthAdapter {
  /** Cached Harvest account ID, required for all API calls. */
  private accountId: string | null = null;

  constructor(tokenManager: OAuthTokenManager) {
    super(tokenManager, getHarvestOAuthConfig());
  }

  protected async getUserInfo(accessToken: string): Promise<{ email?: string; displayName?: string }> {
    const response = await globalThis.fetch(`${API_BASE}/users/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'Semblance (semblance@veridiantools.dev)',
      },
    });

    if (!response.ok) {
      throw new Error(`Harvest user info failed: HTTP ${response.status}`);
    }

    const data = await response.json() as HarvestMeResponse;

    // Cache the first account ID for subsequent API calls
    if (data.accounts.length > 0) {
      this.accountId = String(data.accounts[0]!.id);
    }

    return {
      email: data.email,
      displayName: `${data.first_name} ${data.last_name}`,
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
            error: { code: 'UNKNOWN_ACTION', message: `HarvestAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'HARVEST_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Sync time entries and projects from Harvest.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    await this.ensureAccountId(accessToken);
    const limit = (payload['limit'] as number) ?? 200;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    // 1. Fetch time entries (paginated)
    try {
      const timeItems = await this.fetchTimeEntries(accessToken, limit);
      items.push(...timeItems);
    } catch (err) {
      errors.push({ message: `Time entries: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 2. Fetch projects (paginated)
    try {
      const projectItems = await this.fetchProjects(accessToken, Math.min(limit, 100));
      items.push(...projectItems);
    } catch (err) {
      errors.push({ message: `Projects: ${err instanceof Error ? err.message : String(err)}` });
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
   * List time entries with page-based pagination.
   */
  private async handleListItems(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    await this.ensureAccountId(accessToken);
    const pageSize = (payload['pageSize'] as number) ?? 50;
    const page = payload['pageToken'] ? parseInt(payload['pageToken'] as string, 10) : 1;

    const url = new URL(`${API_BASE}/time_entries`);
    url.searchParams.set('per_page', String(Math.min(pageSize, 100)));
    url.searchParams.set('page', String(page));

    const response = await globalThis.fetch(url.toString(), {
      headers: this.getApiHeaders(accessToken),
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'HARVEST_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as HarvestTimeEntriesResponse;
    const items = data.time_entries.map((entry) => this.timeEntryToImportedItem(entry));
    const nextPageToken = data.next_page ? String(data.next_page) : null;

    return {
      success: true,
      data: {
        items,
        nextPageToken,
        total: data.total_entries,
      },
    };
  }

  private async fetchTimeEntries(accessToken: string, limit: number): Promise<ImportedItem[]> {
    const items: ImportedItem[] = [];
    let page = 1;

    while (items.length < limit) {
      const url = new URL(`${API_BASE}/time_entries`);
      url.searchParams.set('per_page', String(Math.min(100, limit - items.length)));
      url.searchParams.set('page', String(page));

      const response = await globalThis.fetch(url.toString(), {
        headers: this.getApiHeaders(accessToken),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as HarvestTimeEntriesResponse;

      for (const entry of data.time_entries) {
        if (items.length >= limit) break;
        items.push(this.timeEntryToImportedItem(entry));
      }

      if (!data.next_page) break;
      page = data.next_page;
    }

    return items;
  }

  private async fetchProjects(accessToken: string, limit: number): Promise<ImportedItem[]> {
    const items: ImportedItem[] = [];
    let page = 1;

    while (items.length < limit) {
      const url = new URL(`${API_BASE}/projects`);
      url.searchParams.set('per_page', String(Math.min(100, limit - items.length)));
      url.searchParams.set('page', String(page));

      const response = await globalThis.fetch(url.toString(), {
        headers: this.getApiHeaders(accessToken),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as HarvestProjectsResponse;

      for (const project of data.projects) {
        if (items.length >= limit) break;
        items.push(this.projectToImportedItem(project));
      }

      if (!data.next_page) break;
      page = data.next_page;
    }

    return items;
  }

  private timeEntryToImportedItem(entry: HarvestTimeEntry): ImportedItem {
    const timeStr = entry.started_time && entry.ended_time
      ? ` (${entry.started_time} - ${entry.ended_time})`
      : '';

    return {
      id: `hrv_time_${entry.id}`,
      sourceType: 'productivity' as const,
      title: `${entry.project.name}: ${entry.task.name} (${entry.hours}h)`,
      content: `Time entry: ${entry.hours}h on "${entry.project.name}" — ${entry.task.name}.${entry.notes ? ` Notes: ${entry.notes}` : ''} Client: ${entry.client.name}. Date: ${entry.spent_date}.${timeStr}${entry.billable ? ' Billable.' : ''}`,
      timestamp: entry.created_at,
      metadata: {
        provider: 'harvest',
        type: 'time_entry',
        entryId: entry.id,
        hours: entry.hours,
        roundedHours: entry.rounded_hours,
        spentDate: entry.spent_date,
        projectId: entry.project.id,
        projectName: entry.project.name,
        taskId: entry.task.id,
        taskName: entry.task.name,
        clientId: entry.client.id,
        clientName: entry.client.name,
        billable: entry.billable,
        isBilled: entry.is_billed,
        isRunning: entry.is_running,
        notes: entry.notes,
        startedTime: entry.started_time,
        endedTime: entry.ended_time,
      },
    };
  }

  private projectToImportedItem(project: HarvestProject): ImportedItem {
    return {
      id: `hrv_proj_${project.id}`,
      sourceType: 'productivity' as const,
      title: `Project: ${project.name}`,
      content: `Harvest project: "${project.name}"${project.code ? ` (${project.code})` : ''}. Client: ${project.client.name}. ${project.is_active ? 'Active' : 'Inactive'}. ${project.is_billable ? 'Billable' : 'Non-billable'}.${project.notes ? ` Notes: ${project.notes}` : ''}`,
      timestamp: project.updated_at,
      metadata: {
        provider: 'harvest',
        type: 'project',
        projectId: project.id,
        projectName: project.name,
        projectCode: project.code,
        clientId: project.client.id,
        clientName: project.client.name,
        isActive: project.is_active,
        isBillable: project.is_billable,
        budget: project.budget,
        budgetBy: project.budget_by,
        startsOn: project.starts_on,
        endsOn: project.ends_on,
        createdAt: project.created_at,
      },
    };
  }

  /**
   * Ensure we have a Harvest account ID. Fetches from /users/me if needed.
   */
  private async ensureAccountId(accessToken: string): Promise<void> {
    if (this.accountId) return;

    const response = await globalThis.fetch(`${API_BASE}/users/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'Semblance (semblance@veridiantools.dev)',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Harvest account info: HTTP ${response.status}`);
    }

    const data = await response.json() as HarvestMeResponse;
    if (data.accounts.length > 0) {
      this.accountId = String(data.accounts[0]!.id);
    } else {
      throw new Error('No Harvest accounts found for this user');
    }
  }

  /**
   * Get standard API headers including the required Harvest-Account-Id.
   */
  private getApiHeaders(accessToken: string): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'Semblance (semblance@veridiantools.dev)',
      Accept: 'application/json',
    };

    if (this.accountId) {
      headers['Harvest-Account-Id'] = this.accountId;
    }

    return headers;
  }
}
