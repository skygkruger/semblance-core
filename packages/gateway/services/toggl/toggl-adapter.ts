/**
 * TogglAdapter — Gateway service adapter for the Toggl Track API v9.
 *
 * Does NOT extend BaseOAuthAdapter — uses API key authentication.
 * Implements ServiceAdapter directly. Auth is Basic auth with the
 * API token as username and "api_token" as password.
 *
 * Handles time entry sync and project listing for productivity tracking.
 *
 * All HTTP calls use globalThis.fetch. No external HTTP libraries.
 */

import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from '../types.js';
import type { AdapterResult } from '../base-oauth-adapter.js';
import type { ImportedItem } from '@semblance/core/importers/types.js';
import type { OAuthTokenManager } from '../oauth-token-manager.js';

/** Toggl API base URL */
const API_BASE = 'https://api.track.toggl.com/api/v9';

/** Provider key used in OAuthTokenManager for API key storage */
const PROVIDER_KEY = 'toggl';

interface TogglUser {
  id: number;
  email: string;
  fullname: string;
  timezone: string;
  default_workspace_id: number;
}

interface TogglTimeEntry {
  id: number;
  workspace_id: number;
  project_id: number | null;
  task_id: number | null;
  description: string;
  start: string;
  stop: string | null;
  duration: number;
  tags: string[];
  tag_ids: number[];
  billable: boolean;
}

interface TogglProject {
  id: number;
  workspace_id: number;
  name: string;
  color: string;
  active: boolean;
  billable: boolean;
  estimated_hours?: number;
  actual_hours?: number;
}

export class TogglAdapter implements ServiceAdapter {
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
            error: { code: 'UNKNOWN_ACTION', message: `TogglAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'TOGGL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Authenticate with an API key. Validates the key by calling /me.
   * The API key is passed in payload.apiKey.
   */
  private async handleAuth(payload: Record<string, unknown>): Promise<AdapterResult> {
    const apiKey = payload['apiKey'] as string | undefined;

    if (!apiKey) {
      return {
        success: false,
        error: { code: 'MISSING_API_KEY', message: 'payload.apiKey is required for Toggl authentication' },
      };
    }

    // Validate the key by fetching user info
    const authHeader = this.buildBasicAuthHeader(apiKey);
    const response = await globalThis.fetch(`${API_BASE}/me`, {
      headers: { Authorization: authHeader },
    });

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: 'AUTH_FAILED',
          message: response.status === 403 ? 'Invalid Toggl API token' : `Toggl auth failed: HTTP ${response.status}`,
        },
      };
    }

    const user = await response.json() as TogglUser;

    // Store the API key as the access token. No refresh token for API key auth.
    // Set far-future expiry since API keys don't expire.
    this.tokenManager.storeTokens({
      provider: PROVIDER_KEY,
      accessToken: apiKey,
      refreshToken: '',
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
      scopes: 'api_key',
      userEmail: user.email,
    });

    return {
      success: true,
      data: {
        provider: PROVIDER_KEY,
        userEmail: user.email,
        displayName: user.fullname,
        workspaceId: user.default_workspace_id,
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
   * Sync time entries and projects from Toggl.
   * Returns ImportedItem[] for the knowledge graph pipeline.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const apiKey = this.getApiKey();
    const since = payload['since'] as string | undefined;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    // Fetch projects first to map project IDs to names
    let projectMap = new Map<number, TogglProject>();
    try {
      const projects = await this.fetchProjects(apiKey);
      projectMap = new Map(projects.map(p => [p.id, p]));
    } catch (err) {
      errors.push({ message: `Projects: ${err instanceof Error ? err.message : String(err)}` });
    }

    // Fetch time entries
    try {
      const timeEntryItems = await this.fetchTimeEntries(apiKey, since, projectMap);
      items.push(...timeEntryItems);
    } catch (err) {
      errors.push({ message: `Time entries: ${err instanceof Error ? err.message : String(err)}` });
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

    // Toggl time entries use date-based fetching. pageToken is a date string.
    const before = pageToken ?? new Date().toISOString();
    const sinceDate = new Date(before);
    sinceDate.setDate(sinceDate.getDate() - 7);
    const since = sinceDate.toISOString();

    const projectMap = new Map<number, TogglProject>();
    try {
      const projects = await this.fetchProjects(apiKey);
      for (const p of projects) {
        projectMap.set(p.id, p);
      }
    } catch {
      // Continue without project names
    }

    const items = await this.fetchTimeEntries(apiKey, since, projectMap);
    const nextPageToken = since;

    return {
      success: true,
      data: {
        items,
        nextPageToken,
      },
    };
  }

  private async fetchTimeEntries(
    apiKey: string,
    since: string | undefined,
    projectMap: Map<number, TogglProject>,
  ): Promise<ImportedItem[]> {
    const url = new URL(`${API_BASE}/me/time_entries`);

    if (since) {
      url.searchParams.set('since', String(Math.floor(new Date(since).getTime() / 1000)));
    }

    const before = new Date();
    url.searchParams.set('before', before.toISOString());

    const authHeader = this.buildBasicAuthHeader(apiKey);
    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: authHeader },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const entries = await response.json() as TogglTimeEntry[];

    return entries
      .filter(entry => entry.duration >= 0) // Exclude running entries (negative duration)
      .map((entry) => {
        const projectName = entry.project_id
          ? projectMap.get(entry.project_id)?.name ?? `Project #${entry.project_id}`
          : 'No Project';
        const durationMin = Math.round(entry.duration / 60);
        const durationHrs = (entry.duration / 3600).toFixed(1);
        const day = entry.start.split('T')[0]!;
        const description = entry.description || 'Untitled entry';

        return {
          id: `tgl_entry_${entry.id}`,
          sourceType: 'productivity' as const,
          title: `Toggl: ${description} (${durationMin} min)`,
          content: `Time tracked on ${day}: "${description}" for ${projectName}, ${durationHrs} hours (${durationMin} min)${entry.tags.length > 0 ? `, tags: ${entry.tags.join(', ')}` : ''}${entry.billable ? ' [billable]' : ''}`,
          timestamp: entry.start,
          metadata: {
            provider: 'toggl',
            type: 'time_entry',
            entryId: entry.id,
            description: entry.description,
            projectId: entry.project_id,
            projectName,
            durationSeconds: entry.duration,
            tags: entry.tags,
            billable: entry.billable,
            startTime: entry.start,
            stopTime: entry.stop,
          },
        };
      });
  }

  private async fetchProjects(apiKey: string): Promise<TogglProject[]> {
    const authHeader = this.buildBasicAuthHeader(apiKey);
    const response = await globalThis.fetch(`${API_BASE}/me/projects`, {
      headers: { Authorization: authHeader },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json() as Promise<TogglProject[]>;
  }

  /** Get the stored API key from the token manager. */
  private getApiKey(): string {
    const apiKey = this.tokenManager.getAccessToken(PROVIDER_KEY);
    if (!apiKey) {
      throw new Error('Not authenticated with Toggl. Provide an API key via connector.auth.');
    }
    return apiKey;
  }

  /** Build the Basic auth header for Toggl API (api_token:api_token). */
  private buildBasicAuthHeader(apiKey: string): string {
    const encoded = Buffer.from(`${apiKey}:api_token`).toString('base64');
    return `Basic ${encoded}`;
  }
}
