// Web Search Adapter Factory — Returns the correct adapter based on user configuration.
// Priority chain: SearXNG (if configured) > Brave (if API key present) > DuckDuckGo (always available).
// DuckDuckGo is the zero-config fallback — web search always works on a fresh install.

import type { ServiceAdapter } from './types.js';
import { WebSearchAdapter } from './web-search-adapter.js';
import { SearXNGAdapter } from './searxng-adapter.js';
import { DuckDuckGoAdapter } from './duckduckgo-adapter.js';

export type SearchProvider = 'brave' | 'searxng' | 'duckduckgo';

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
  private duckduckgoAdapter: DuckDuckGoAdapter;
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
    this.duckduckgoAdapter = new DuckDuckGoAdapter({
      fetchFn: config.fetchFn,
    });
  }

  /**
   * Get the appropriate search adapter based on current configuration.
   * Fallback chain: selected provider > DuckDuckGo (always available).
   * DuckDuckGo never returns "not configured" — it always works.
   */
  getAdapter(): ServiceAdapter {
    const provider = this.config.getProvider();

    if (provider === 'searxng') {
      const url = this.config.getSearXNGUrl();
      if (url) {
        return this.searxngAdapter;
      }
      // SearXNG selected but no URL — fall through to DuckDuckGo
    }

    if (provider === 'brave' || provider === 'searxng') {
      const apiKey = this.config.getBraveApiKey();
      if (apiKey) {
        return this.braveAdapter;
      }
      // Brave selected but no API key — fall through to DuckDuckGo
    }

    if (provider === 'duckduckgo') {
      return this.duckduckgoAdapter;
    }

    // Default fallback: DuckDuckGo (zero-config, always works)
    return this.duckduckgoAdapter;
  }
}
