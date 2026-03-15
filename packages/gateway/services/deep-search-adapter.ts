// Deep Search Adapter — Search + parallel page fetch in one operation.
// Combines web search (DDG/Brave/SearXNG) with page content extraction (Readability).
// Returns full page content alongside search results so the LLM can synthesize answers
// from actual article text instead of relying on short snippets.

import type { ActionType, WebDeepSearchPayload } from '@semblance/core';
import type { ServiceAdapter } from './types.js';

/** Maximum content per page (3,000 chars) — keeps total payload manageable */
const MAX_CONTENT_PER_PAGE = 3000;
/** Tighter timeout per individual fetch (8s vs WebFetchAdapter's 15s default) */
const FETCH_TIMEOUT_MS = 8000;

export interface DeepSearchAdapterConfig {
  /** The active search adapter (from WebSearchAdapterFactory) */
  searchAdapter: ServiceAdapter;
  /** The web fetch adapter (for page content extraction) */
  fetchAdapter: ServiceAdapter;
}

export class DeepSearchAdapter implements ServiceAdapter {
  private searchAdapter: ServiceAdapter;
  private fetchAdapter: ServiceAdapter;

  constructor(config: DeepSearchAdapterConfig) {
    this.searchAdapter = config.searchAdapter;
    this.fetchAdapter = config.fetchAdapter;
  }

  /** Update search adapter reference (called when provider changes) */
  setSearchAdapter(adapter: ServiceAdapter): void {
    this.searchAdapter = adapter;
  }

  async execute(action: ActionType, payload: unknown): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    if (action !== 'web.deep_search') {
      return {
        success: false,
        error: { code: 'UNSUPPORTED_ACTION', message: `Deep search adapter does not support: ${action}` },
      };
    }

    try {
      return await this.handleDeepSearch(payload as WebDeepSearchPayload);
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'DEEP_SEARCH_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  private async handleDeepSearch(payload: WebDeepSearchPayload): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const resultCount = payload.resultCount ?? 3;

    // Step 1: Execute web search to get result URLs
    const searchResult = await this.searchAdapter.execute('web.search', {
      query: payload.query,
      count: resultCount,
    });

    if (!searchResult.success || !searchResult.data) {
      return searchResult; // Pass through the search error
    }

    const searchData = searchResult.data as {
      results: Array<{ title: string; url: string; snippet: string }>;
      query: string;
      provider: string;
    };

    // Step 2: Fetch full page content for each result in parallel
    const fetchPromises = searchData.results.map(async (result) => {
      try {
        const fetchResult = await Promise.race([
          this.fetchAdapter.execute('web.fetch', {
            url: result.url,
            maxContentLength: MAX_CONTENT_PER_PAGE,
          }),
          // Timeout fallback — resolves to null after FETCH_TIMEOUT_MS
          new Promise<null>((resolve) => setTimeout(() => resolve(null), FETCH_TIMEOUT_MS)),
        ]);

        if (fetchResult && fetchResult.success && fetchResult.data) {
          const fetchData = fetchResult.data as { content: string; title: string };
          return {
            title: fetchData.title || result.title,
            url: result.url,
            snippet: result.snippet,
            fullContent: fetchData.content.substring(0, MAX_CONTENT_PER_PAGE),
          };
        }
      } catch {
        // Individual fetch failure — skip this result, don't abort the whole search
      }

      // Fallback: return result with snippet only (no full content)
      return {
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        fullContent: null,
      };
    });

    const results = await Promise.all(fetchPromises);

    return {
      success: true,
      data: {
        query: searchData.query,
        provider: searchData.provider,
        results,
      },
    };
  }
}
