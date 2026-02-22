// SearXNG Search Adapter — Self-hosted search as an alternative to Brave.
// Implements ServiceAdapter for web.search ActionType.
// Base URL is user-configurable. No API key required.

import type { ActionType, WebSearchPayload } from '@semblance/core';
import type { ServiceAdapter } from './types.js';

export interface SearXNGAdapterConfig {
  /** Base URL of the SearXNG instance (e.g., "https://searx.example.com") */
  getBaseUrl: () => string | null;
  /** Optional fetch implementation (for testing) */
  fetchFn?: typeof globalThis.fetch;
}

export class SearXNGAdapter implements ServiceAdapter {
  private getBaseUrl: () => string | null;
  private fetchFn: typeof globalThis.fetch;

  constructor(config: SearXNGAdapterConfig) {
    this.getBaseUrl = config.getBaseUrl;
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
        error: { code: 'UNSUPPORTED_ACTION', message: `SearXNG adapter does not support: ${action}` },
      };
    }

    try {
      return await this.handleSearch(payload as WebSearchPayload);
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'SEARXNG_ERROR',
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
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      return {
        success: false,
        error: {
          code: 'NO_SEARXNG_URL',
          message: 'SearXNG base URL not configured. Add it in Settings \u2192 Web Search.',
        },
      };
    }

    const params = new URLSearchParams({
      q: payload.query,
      format: 'json',
      categories: 'general',
    });

    const url = `${baseUrl.replace(/\/$/, '')}/search?${params.toString()}`;

    const response = await this.fetchFn(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        success: false,
        error: {
          code: 'SEARXNG_API_ERROR',
          message: `SearXNG error (${response.status}): ${errorText}`,
        },
      };
    }

    const data = await response.json() as SearXNGResponse;
    const count = payload.count ?? 5;
    const results = (data.results ?? []).slice(0, count).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.content ?? '',
    }));

    return {
      success: true,
      data: {
        results,
        query: payload.query,
        provider: 'searxng' as const,
      },
    };
  }
}

// SearXNG JSON response shape (subset)
interface SearXNGResponse {
  results: Array<{
    title: string;
    url: string;
    content?: string;
  }>;
}
