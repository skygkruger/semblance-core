// DuckDuckGo Search Adapter — Zero-config web search fallback.
// Implements ServiceAdapter for web.search ActionType.
// No API key, no configuration — always available as the last-resort search provider.
// Scrapes DuckDuckGo's HTML search results (no official API for web results).

import type { ActionType, WebSearchPayload } from '@semblance/core';
import type { ServiceAdapter } from './types.js';

export interface DuckDuckGoAdapterConfig {
  /** Optional fetch implementation (for testing) */
  fetchFn?: typeof globalThis.fetch;
}

export class DuckDuckGoAdapter implements ServiceAdapter {
  private fetchFn: typeof globalThis.fetch;

  constructor(config?: DuckDuckGoAdapterConfig) {
    this.fetchFn = config?.fetchFn ?? globalThis.fetch;
  }

  async execute(action: ActionType, payload: unknown): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    if (action !== 'web.search') {
      return {
        success: false,
        error: { code: 'UNSUPPORTED_ACTION', message: `DuckDuckGo adapter does not support: ${action}` },
      };
    }

    try {
      return await this.handleSearch(payload as WebSearchPayload);
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'DUCKDUCKGO_ERROR',
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
    const count = payload.count ?? 5;
    const maxResults = Math.min(count, 10);

    const params = new URLSearchParams({
      q: payload.query,
    });

    const url = `https://html.duckduckgo.com/html/?${params.toString()}`;

    const response = await this.fetchFn(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Semblance/1.0 (Local AI Assistant)',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    if (response.status === 429 || response.status === 503) {
      return {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'DuckDuckGo rate limit — try again in a moment.',
        },
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: 'DUCKDUCKGO_HTTP_ERROR',
          message: `DuckDuckGo returned HTTP ${response.status}`,
        },
      };
    }

    const html = await response.text();
    const results = parseDuckDuckGoHTML(html, maxResults);

    return {
      success: true,
      data: {
        results,
        query: payload.query,
        provider: 'duckduckgo' as const,
      },
    };
  }
}

/**
 * Parse DuckDuckGo HTML search results.
 * DDG's HTML endpoint returns result blocks with class "result".
 * Each contains an <a class="result__a"> (title+url) and <a class="result__snippet"> (snippet).
 * We use simple regex parsing — no DOM parser dependency needed.
 */
function parseDuckDuckGoHTML(html: string, maxResults: number): Array<{
  title: string;
  url: string;
  snippet: string;
}> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];

  // Match each result block — DDG wraps results in <div class="result results_links results_links_deep web-result ">
  // The title link has class "result__a" and the snippet has class "result__snippet"
  const resultBlockRegex = /<div[^>]*class="[^"]*result[^"]*results_links[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  // Fallback: match individual result__a and result__snippet pairs
  const titleRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  // Strategy: find all title links, then find snippets in order
  const titles: Array<{ url: string; title: string }> = [];
  let titleMatch: RegExpExecArray | null;
  while ((titleMatch = titleRegex.exec(html)) !== null) {
    const rawUrl = titleMatch[1]!;
    const rawTitle = titleMatch[2]!;

    // DDG proxies URLs through //duckduckgo.com/l/?uddg=<encoded_url> — extract the real URL
    const realUrl = extractRealUrl(rawUrl);
    const cleanTitle = stripHtml(rawTitle).trim();

    if (realUrl && cleanTitle && !realUrl.includes('duckduckgo.com')) {
      titles.push({ url: realUrl, title: cleanTitle });
    }
  }

  const snippets: string[] = [];
  let snippetMatch: RegExpExecArray | null;
  while ((snippetMatch = snippetRegex.exec(html)) !== null) {
    snippets.push(stripHtml(snippetMatch[1]!).trim());
  }

  for (let i = 0; i < Math.min(titles.length, maxResults); i++) {
    results.push({
      title: titles[i]!.title,
      url: titles[i]!.url,
      snippet: snippets[i] ?? '',
    });
  }

  return results;
}

/** Extract real URL from DDG's redirect proxy URL */
function extractRealUrl(ddgUrl: string): string {
  // DDG wraps URLs as: //duckduckgo.com/l/?uddg=<encoded>&rut=<hash>
  if (ddgUrl.includes('uddg=')) {
    const match = ddgUrl.match(/uddg=([^&]+)/);
    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }
  // Direct URL (sometimes DDG doesn't proxy)
  if (ddgUrl.startsWith('http')) return ddgUrl;
  if (ddgUrl.startsWith('//')) return `https:${ddgUrl}`;
  return ddgUrl;
}

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}
