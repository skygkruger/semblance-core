/**
 * GitHubAdapter — Gateway service adapter for the GitHub API v3 (REST).
 *
 * Extends BasePKCEAdapter because GitHub supports PKCE for OAuth apps.
 * Handles OAuth authentication, token management, and data sync
 * for repositories, starred repos, and recent events.
 *
 * IMPORTANT: GitHub's token endpoint requires Accept: application/json header
 * to return JSON instead of URL-encoded form data.
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

const GITHUB_SCOPES = 'read:user repo';

/** GitHub API base URL */
const API_BASE = 'https://api.github.com';

/** Build the OAuthConfig for GitHub. */
export function getGitHubOAuthConfig(): OAuthConfig {
  return {
    providerKey: 'github',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: GITHUB_SCOPES,
    usePKCE: true,
    clientId: oauthClients.github.clientId,
  };
}

interface GitHubUser {
  login: string;
  email: string | null;
  name: string | null;
  id: number;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  created_at: string;
  private: boolean;
  topics?: string[];
}

interface GitHubEvent {
  id: string;
  type: string;
  repo: { name: string };
  created_at: string;
  payload: Record<string, unknown>;
}

export class GitHubAdapter extends BasePKCEAdapter {
  /** Cached username from getUserInfo, used for events endpoint */
  private cachedLogin: string | null = null;

  constructor(tokenManager: OAuthTokenManager) {
    super(tokenManager, getGitHubOAuthConfig());
  }

  /**
   * Override the token exchange to add Accept: application/json header.
   * GitHub returns URL-encoded form data by default, not JSON.
   */
  async performAuthFlow(): Promise<AdapterResult> {
    // We need to intercept the fetch call for the token exchange.
    // The base class uses globalThis.fetch directly, so we wrap it temporarily.
    const originalFetch = globalThis.fetch;
    const tokenUrl = this.config.tokenUrl;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url === tokenUrl && init?.method === 'POST') {
        // Inject Accept: application/json for GitHub token endpoint
        const headers = new Headers(init.headers);
        headers.set('Accept', 'application/json');
        return originalFetch(input, { ...init, headers });
      }

      return originalFetch(input, init);
    };

    try {
      const result = await super.performAuthFlow();
      return result;
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  protected async getUserInfo(accessToken: string): Promise<{ email?: string; displayName?: string }> {
    const response = await globalThis.fetch(`${API_BASE}/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub user info failed: HTTP ${response.status}`);
    }

    const user = await response.json() as GitHubUser;
    this.cachedLogin = user.login;

    return {
      email: user.email ?? undefined,
      displayName: user.login,
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
            error: { code: 'UNKNOWN_ACTION', message: `GitHubAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'GITHUB_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Sync repos, starred repos, and recent events from GitHub.
   * Returns ImportedItem[] for the knowledge graph pipeline.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const limit = (payload['limit'] as number) ?? 50;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    // Ensure we have the login name
    if (!this.cachedLogin) {
      try {
        const userInfo = await this.getUserInfo(accessToken);
        this.cachedLogin = userInfo.displayName ?? null;
      } catch (err) {
        errors.push({ message: `User info: ${err instanceof Error ? err.message : String(err)}` });
      }
    }

    // 1. User repos
    try {
      const repoItems = await this.fetchRepos(accessToken, limit);
      items.push(...repoItems);
    } catch (err) {
      errors.push({ message: `Repos: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 2. Starred repos
    try {
      const starredItems = await this.fetchStarred(accessToken, Math.min(limit, 100));
      items.push(...starredItems);
    } catch (err) {
      errors.push({ message: `Starred: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 3. Recent events
    if (this.cachedLogin) {
      try {
        const eventItems = await this.fetchEvents(accessToken, this.cachedLogin, Math.min(limit, 100));
        items.push(...eventItems);
      } catch (err) {
        errors.push({ message: `Events: ${err instanceof Error ? err.message : String(err)}` });
      }
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
   * List repos with pagination (used by connector.list_items).
   */
  private async handleListItems(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const pageSize = (payload['pageSize'] as number) ?? 30;
    const page = payload['pageToken'] ? parseInt(payload['pageToken'] as string, 10) : 1;

    const url = new URL(`${API_BASE}/user/repos`);
    url.searchParams.set('per_page', String(Math.min(pageSize, 100)));
    url.searchParams.set('page', String(page));
    url.searchParams.set('sort', 'updated');

    const response = await globalThis.fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'GITHUB_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const repos = await response.json() as GitHubRepo[];

    // Check Link header for next page
    const linkHeader = response.headers.get('Link');
    const hasNext = linkHeader !== null && linkHeader.includes('rel="next"');

    const items = repos.map((repo) => this.repoToImportedItem(repo));

    return {
      success: true,
      data: {
        items,
        nextPageToken: hasNext ? String(page + 1) : null,
      },
    };
  }

  private async fetchRepos(accessToken: string, limit: number): Promise<ImportedItem[]> {
    const url = new URL(`${API_BASE}/user/repos`);
    url.searchParams.set('per_page', String(Math.min(limit, 100)));
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('direction', 'desc');

    const response = await globalThis.fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const repos = await response.json() as GitHubRepo[];
    return repos.map((repo) => this.repoToImportedItem(repo));
  }

  private async fetchStarred(accessToken: string, limit: number): Promise<ImportedItem[]> {
    const url = new URL(`${API_BASE}/user/starred`);
    url.searchParams.set('per_page', String(Math.min(limit, 100)));
    url.searchParams.set('sort', 'updated');

    const response = await globalThis.fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const repos = await response.json() as GitHubRepo[];

    return repos.map((repo) => ({
      id: `gh_starred_${repo.id}`,
      sourceType: 'research' as const,
      title: `Starred: ${repo.full_name}`,
      content: `Starred repository "${repo.full_name}"${repo.description ? `: ${repo.description}` : ''}. Language: ${repo.language ?? 'unknown'}. Stars: ${repo.stargazers_count}. Forks: ${repo.forks_count}.`,
      timestamp: repo.updated_at,
      metadata: {
        provider: 'github',
        type: 'starred_repo',
        repoId: repo.id,
        fullName: repo.full_name,
        description: repo.description,
        language: repo.language,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        url: repo.html_url,
        topics: repo.topics ?? [],
      },
    }));
  }

  private async fetchEvents(accessToken: string, login: string, limit: number): Promise<ImportedItem[]> {
    const url = new URL(`${API_BASE}/users/${login}/events`);
    url.searchParams.set('per_page', String(Math.min(limit, 100)));

    const response = await globalThis.fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const events = await response.json() as GitHubEvent[];

    return events.map((event) => ({
      id: `gh_event_${event.id}`,
      sourceType: 'productivity' as const,
      title: `${event.type} on ${event.repo.name}`,
      content: `GitHub event: ${event.type} on repository ${event.repo.name}`,
      timestamp: event.created_at,
      metadata: {
        provider: 'github',
        type: 'event',
        eventType: event.type,
        eventId: event.id,
        repoName: event.repo.name,
      },
    }));
  }

  private repoToImportedItem(repo: GitHubRepo): ImportedItem {
    return {
      id: `gh_repo_${repo.id}`,
      sourceType: 'productivity' as const,
      title: repo.full_name,
      content: `Repository "${repo.full_name}"${repo.description ? `: ${repo.description}` : ''}. Language: ${repo.language ?? 'unknown'}. Stars: ${repo.stargazers_count}. Forks: ${repo.forks_count}. ${repo.private ? 'Private' : 'Public'}.`,
      timestamp: repo.updated_at,
      metadata: {
        provider: 'github',
        type: 'repo',
        repoId: repo.id,
        fullName: repo.full_name,
        description: repo.description,
        language: repo.language,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        isPrivate: repo.private,
        url: repo.html_url,
        topics: repo.topics ?? [],
        createdAt: repo.created_at,
      },
    };
  }
}
