// Web Search Adapter — Brave Search API client.
// Implements ServiceAdapter for web.search ActionType.
// API key from credential store (encrypted). Domain: api.search.brave.com.

import type { ActionType, WebSearchPayload } from '@semblance/core';
import type { ServiceAdapter } from './types.js';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  age?: string;
}

export interface WebSearchAdapterConfig {
  /** Function to retrieve the Brave API key. Returns null if not configured. */
  getApiKey: () => string | null;
  /** Optional fetch implementation (for testing) */
  fetchFn?: typeof globalThis.fetch;
}

export class WebSearchAdapter implements ServiceAdapter {
  private getApiKey: () => string | null;
  private fetchFn: typeof globalThis.fetch;

  constructor(config: WebSearchAdapterConfig) {
    this.getApiKey = config.getApiKey;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
  }

  async execute(action: ActionType, payload: unknown): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    if (action !== 'web.search') {
      return {
        success: false,
        error: { code: 'UNSUPPORTED_ACTION', message: `Web search adapter does not support: ${action}` },
      };
    }

    try {
      return await this.handleSearch(payload as WebSearchPayload);
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'WEB_SEARCH_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  private async handleSearch(payload: WebSearchPayload): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: {
          code: 'NO_API_KEY',
          message: 'Brave Search API key not configured. Add your key in Settings \u2192 Web Search.',
        },
      };
    }

    const count = payload.count ?? 5;
    const params = new URLSearchParams({
      q: payload.query,
      count: String(count),
    });
    if (payload.freshness) {
      params.set('freshness', payload.freshness);
    }

    const url = `https://api.search.brave.com/res/v1/web/search?${params.toString()}`;

    const response = await this.fetchFn(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    });

    if (response.status === 429) {
      return {
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Brave Search API rate limit exceeded' },
      };
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        success: false,
        error: {
          code: 'BRAVE_API_ERROR',
          message: `Brave Search API error (${response.status}): ${errorText}`,
        },
      };
    }

    const data = await response.json() as BraveSearchResponse;
    const results: WebSearchResult[] = (data.web?.results ?? []).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.description ?? '',
      age: r.age,
    }));

    return {
      success: true,
      data: {
        results,
        query: payload.query,
        provider: 'brave' as const,
      },
    };
  }
}

// Brave Search API response shape (subset we use)
interface BraveSearchResponse {
  web?: {
    results: Array<{
      title: string;
      url: string;
      description?: string;
      age?: string;
    }>;
  };
}
