// Mobile Gateway — Lightweight in-process gateway for mobile.
//
// Handles web.search and web.fetch actions directly using React Native's
// global fetch() API. This is the mobile equivalent of the desktop Gateway
// process, but runs in-process rather than over a socket.
//
// Architecture: The orchestrator calls ipcClient.sendAction('web.search', payload)
// → CoreIPCClient sends through IPCTransport → MobileGatewayTransport handles it here.
//
// Security: URL validation and SSRF protection replicated from Gateway's web-fetch-adapter.
// Rate limiting: Simple per-minute counters.
//
// IMPORTANT: This file is in packages/mobile/, NOT packages/core/.
// React Native's global fetch() is the network layer — this is allowed.

import type { IPCTransport } from '@semblance/core/ipc/transport';
import type { ActionRequest, ActionResponse } from '@semblance/core/types/ipc';

// ─── Configuration ──────────────────────────────────────────────────────────

const SEARCH_RATE_LIMIT = 30; // max searches per minute
const FETCH_RATE_LIMIT = 20;  // max fetches per minute
const FETCH_TIMEOUT_MS = 15_000;
const MAX_CONTENT_LENGTH = 50_000;
const MAX_REDIRECTS = 5;

// ─── Rate Limiter ───────────────────────────────────────────────────────────

class SimpleRateLimiter {
  private timestamps: number[] = [];
  private maxPerMinute: number;

  constructor(maxPerMinute: number) {
    this.maxPerMinute = maxPerMinute;
  }

  check(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < 60_000);
    if (this.timestamps.length >= this.maxPerMinute) return false;
    this.timestamps.push(now);
    return true;
  }
}

// ─── URL Validation (SSRF Protection) ───────────────────────────────────────

const BLOCKED_SCHEMES = new Set(['file:', 'data:', 'javascript:', 'blob:']);

function validateUrl(urlStr: string): string | null {
  try {
    const url = new URL(urlStr);
    if (BLOCKED_SCHEMES.has(url.protocol)) {
      return `Blocked URL scheme: ${url.protocol}`;
    }
    // Block private IPs
    const hostname = url.hostname;
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') ||
      hostname.startsWith('172.19.') ||
      hostname.startsWith('172.2') ||
      hostname.startsWith('172.30.') ||
      hostname.startsWith('172.31.') ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local')
    ) {
      return `Blocked private/local IP: ${hostname}`;
    }
    return null;
  } catch {
    return `Invalid URL: ${urlStr}`;
  }
}

// ─── HTML → Text Extraction ─────────────────────────────────────────────────

function extractTextFromHtml(html: string): string {
  // Strip script and style tags entirely
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

// ─── DuckDuckGo HTML Search (Free, No API Key) ─────────────────────────────

const DDG_USER_AGENT = 'Semblance/1.0 (Local AI Assistant; +https://semblance.app)';

/**
 * Parse DuckDuckGo HTML search results.
 *
 * DDG's HTML endpoint returns results inside `<div class="result ...">` blocks.
 * Each block contains:
 *   - `<a class="result__a" href="...">Title</a>`
 *   - `<a class="result__snippet">Snippet text</a>`
 *
 * We use lightweight regex parsing — no DOM library needed.
 */
function parseDdgHtmlResults(html: string, count: number): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];

  // Match each result block
  const resultBlockRe = /<div[^>]+class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]+class="[^"]*result|$)/gi;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = resultBlockRe.exec(html)) !== null && results.length < count) {
    const block = blockMatch[1]!;

    // Extract title + URL from <a class="result__a" href="...">Title</a>
    const linkMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    let resultUrl = linkMatch[1]!;
    const rawTitle = linkMatch[2]!;

    // DDG sometimes wraps the real URL in a redirect — extract the uddg param
    if (resultUrl.includes('uddg=')) {
      try {
        const uddg = new URL(resultUrl, 'https://duckduckgo.com').searchParams.get('uddg');
        if (uddg) resultUrl = uddg;
      } catch {
        // Keep the original URL if parsing fails
      }
    }

    // Extract snippet from <a class="result__snippet">...</a>
    const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
    const rawSnippet = snippetMatch ? snippetMatch[1]! : '';

    // Strip HTML tags and decode entities from title and snippet
    const cleanText = (s: string): string => {
      let t = s.replace(/<[^>]+>/g, '');
      t = t.replace(/&amp;/g, '&');
      t = t.replace(/&lt;/g, '<');
      t = t.replace(/&gt;/g, '>');
      t = t.replace(/&quot;/g, '"');
      t = t.replace(/&#39;/g, "'");
      t = t.replace(/&nbsp;/g, ' ');
      t = t.replace(/\s+/g, ' ').trim();
      return t;
    };

    const title = cleanText(rawTitle);
    const snippet = cleanText(rawSnippet);

    // Skip empty/ad results
    if (!title || !resultUrl || resultUrl.startsWith('//duckduckgo.com')) continue;

    results.push({ title, url: resultUrl, snippet });
  }

  return results;
}

async function handleWebSearchDDG(
  payload: Record<string, unknown>,
): Promise<ActionResponse> {
  const query = payload.query as string;
  const count = (payload.count as number) ?? 5;

  const params = new URLSearchParams({ q: query });
  const url = `https://html.duckduckgo.com/html/?${params.toString()}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': DDG_USER_AGENT,
          'Accept': 'text/html',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 429) {
      return {
        requestId: '', timestamp: '', status: 'rate_limited',
        error: { code: 'RATE_LIMITED', message: 'DuckDuckGo rate limit exceeded. Try again in a moment.' },
        auditRef: '',
      };
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      return {
        requestId: '', timestamp: '', status: 'error',
        error: { code: 'DDG_ERROR', message: `DuckDuckGo error (${response.status}): ${errText}` },
        auditRef: '',
      };
    }

    const html = await response.text();
    const results = parseDdgHtmlResults(html, count);

    return {
      requestId: '', timestamp: '', status: 'success',
      data: { results, query, provider: 'duckduckgo', resultCount: results.length },
      auditRef: '',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      requestId: '', timestamp: '', status: 'error',
      error: { code: message.includes('abort') ? 'TIMEOUT' : 'NETWORK_ERROR', message },
      auditRef: '',
    };
  }
}

// ─── Web Search Handler ─────────────────────────────────────────────────────

async function handleWebSearch(
  payload: Record<string, unknown>,
  getApiKey: () => Promise<string | null>,
): Promise<ActionResponse> {
  const query = payload.query as string;
  if (!query) {
    return { requestId: '', timestamp: '', status: 'error', error: { code: 'MISSING_QUERY', message: 'Query is required' }, auditRef: '' };
  }

  // Get Brave API key from settings — if unavailable, fall back to free DuckDuckGo search
  const braveApiKey = await getApiKey();
  if (!braveApiKey) {
    return handleWebSearchDDG(payload);
  }

  const count = (payload.count as number) ?? 5;
  const params = new URLSearchParams({ q: query, count: String(count) });
  if (payload.freshness) {
    params.set('freshness', payload.freshness as string);
  }

  const url = `https://api.search.brave.com/res/v1/web/search?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': braveApiKey,
      },
    });

    if (response.status === 429) {
      return {
        requestId: '', timestamp: '', status: 'rate_limited',
        error: { code: 'RATE_LIMITED', message: 'Brave Search API rate limit exceeded' },
        auditRef: '',
      };
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      return {
        requestId: '', timestamp: '', status: 'error',
        error: { code: 'BRAVE_API_ERROR', message: `Brave API error (${response.status}): ${errText}` },
        auditRef: '',
      };
    }

    const data = await response.json() as { web?: { results?: Array<{ title: string; url: string; description: string; age?: string }> } };
    const results = (data.web?.results ?? []).slice(0, count).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
      age: r.age ?? '',
    }));

    return {
      requestId: '', timestamp: '', status: 'success',
      data: { results, query, provider: 'brave', resultCount: results.length },
      auditRef: '',
    };
  } catch (err) {
    return {
      requestId: '', timestamp: '', status: 'error',
      error: { code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : String(err) },
      auditRef: '',
    };
  }
}

// ─── Web Fetch Handler ──────────────────────────────────────────────────────

async function handleWebFetch(
  payload: Record<string, unknown>,
): Promise<ActionResponse> {
  const urlStr = payload.url as string;
  if (!urlStr) {
    return { requestId: '', timestamp: '', status: 'error', error: { code: 'MISSING_URL', message: 'URL is required' }, auditRef: '' };
  }

  const urlError = validateUrl(urlStr);
  if (urlError) {
    return { requestId: '', timestamp: '', status: 'error', error: { code: 'BLOCKED_URL', message: urlError }, auditRef: '' };
  }

  const maxLen = (payload.maxContentLength as number) ?? MAX_CONTENT_LENGTH;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let currentUrl = urlStr;
    let redirectCount = 0;
    let response: Response;

    try {
      // Follow redirects manually with SSRF validation at each hop
      while (true) {
        response = await fetch(currentUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Semblance/1.0 (Local AI Assistant)',
            'Accept': 'text/html, application/xhtml+xml, text/plain, */*',
          },
          redirect: 'manual',
          signal: controller.signal,
        });

        if (response.status >= 300 && response.status < 400) {
          redirectCount++;
          if (redirectCount > MAX_REDIRECTS) {
            return { requestId: '', timestamp: '', status: 'error', error: { code: 'TOO_MANY_REDIRECTS', message: `Exceeded ${MAX_REDIRECTS} redirects` }, auditRef: '' };
          }
          const location = response.headers.get('location');
          if (!location) {
            return { requestId: '', timestamp: '', status: 'error', error: { code: 'INVALID_REDIRECT', message: 'Missing Location header' }, auditRef: '' };
          }
          const resolvedUrl = new URL(location, currentUrl).toString();
          const redirectError = validateUrl(resolvedUrl);
          if (redirectError) {
            return { requestId: '', timestamp: '', status: 'error', error: { code: 'BLOCKED_REDIRECT', message: redirectError }, auditRef: '' };
          }
          currentUrl = resolvedUrl;
          continue;
        }
        break;
      }
    } finally {
      clearTimeout(timeout);
    }

    if (!response!.ok) {
      return {
        requestId: '', timestamp: '', status: 'error',
        error: { code: 'HTTP_ERROR', message: `HTTP ${response!.status}` },
        auditRef: '',
      };
    }

    const contentType = response!.headers.get('content-type') ?? '';
    const rawText = await response!.text();

    let content: string;
    let title = '';

    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      // Extract title from HTML
      const titleMatch = rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      title = titleMatch ? titleMatch[1]!.trim() : '';
      content = extractTextFromHtml(rawText);
    } else {
      content = rawText;
    }

    // Truncate
    if (content.length > maxLen) {
      content = content.slice(0, maxLen) + '\n\n[Content truncated]';
    }

    return {
      requestId: '', timestamp: '', status: 'success',
      data: { url: currentUrl, title, content, bytesFetched: rawText.length, contentType },
      auditRef: '',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      requestId: '', timestamp: '', status: 'error',
      error: { code: message.includes('abort') ? 'TIMEOUT' : 'NETWORK_ERROR', message },
      auditRef: '',
    };
  }
}

// ─── Mobile Gateway Transport ───────────────────────────────────────────────

export class MobileGatewayTransport implements IPCTransport {
  private ready = false;
  private searchLimiter = new SimpleRateLimiter(SEARCH_RATE_LIMIT);
  private fetchLimiter = new SimpleRateLimiter(FETCH_RATE_LIMIT);
  private getApiKey: () => Promise<string | null>;

  constructor(getApiKey: () => Promise<string | null>) {
    this.getApiKey = getApiKey;
  }

  async start(): Promise<void> {
    this.ready = true;
  }

  async stop(): Promise<void> {
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async send(request: ActionRequest): Promise<ActionResponse> {
    const action = request.action;
    const payload = request.payload as Record<string, unknown>;
    const now = new Date().toISOString();

    const baseResponse = {
      requestId: request.id,
      timestamp: now,
      auditRef: `mobile-${request.id}`,
    };

    switch (action) {
      case 'web.search': {
        if (!this.searchLimiter.check()) {
          return { ...baseResponse, status: 'rate_limited', error: { code: 'RATE_LIMITED', message: 'Too many searches. Try again in a moment.' } };
        }
        const result = await handleWebSearch(payload, this.getApiKey);
        return { ...result, ...baseResponse };
      }

      case 'web.fetch': {
        if (!this.fetchLimiter.check()) {
          return { ...baseResponse, status: 'rate_limited', error: { code: 'RATE_LIMITED', message: 'Too many fetch requests. Try again in a moment.' } };
        }
        const result = await handleWebFetch(payload);
        return { ...result, ...baseResponse };
      }

      default:
        // Other actions not available on mobile — return informative error
        return {
          ...baseResponse,
          status: 'error',
          error: {
            code: 'UNSUPPORTED_ACTION',
            message: `Action '${action}' is not available on mobile. Connect to desktop for full Gateway access.`,
          },
        };
    }
  }
}
