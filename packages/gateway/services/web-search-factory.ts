// Web Search Adapter Factory — Returns the correct adapter based on user configuration.
// Default: Brave. If SearXNG is selected and URL is configured, uses SearXNG.
// Falls back to Brave if SearXNG is selected but no URL is configured.

import type { ServiceAdapter } from './types.js';
import { WebSearchAdapter } from './web-search-adapter.js';
import { SearXNGAdapter } from './searxng-adapter.js';

export type SearchProvider = 'brave' | 'searxng';

export interface WebSearchFactoryConfig {
  /** Which search provider is selected */
  getProvider: () => SearchProvider;
  /** Brave API key getter */
  getBraveApiKey: () => string | null;
  /** SearXNG base URL getter */
  getSearXNGUrl: () => string | null;
  /** Optional fetch implementation (for testing) */
  fetchFn?: typeof globalThis.fetch;
}

export class WebSearchAdapterFactory {
  private braveAdapter: WebSearchAdapter;
  private searxngAdapter: SearXNGAdapter;
  private config: WebSearchFactoryConfig;

  constructor(config: WebSearchFactoryConfig) {
    this.config = config;
    this.braveAdapter = new WebSearchAdapter({
      getApiKey: config.getBraveApiKey,
      fetchFn: config.fetchFn,
    });
    this.searxngAdapter = new SearXNGAdapter({
      getBaseUrl: config.getSearXNGUrl,
      fetchFn: config.fetchFn,
    });
  }

  /**
   * Get the appropriate search adapter based on current configuration.
   * Falls back to Brave if SearXNG is selected but not configured.
   */
  getAdapter(): ServiceAdapter {
    const provider = this.config.getProvider();

    if (provider === 'searxng') {
      const url = this.config.getSearXNGUrl();
      if (url) {
        return this.searxngAdapter;
      }
      // SearXNG selected but no URL configured — fall back to Brave
      console.warn('[WebSearch] SearXNG selected but no URL configured, falling back to Brave');
      return this.braveAdapter;
    }

    return this.braveAdapter;
  }
}
