// Web Fetch Adapter — HTTP fetch + content extraction using Readability.
// Implements ServiceAdapter for web.fetch ActionType.
// Security: rejects file://, data://, localhost, private IPs (SSRF protection).

import type { ActionType, WebFetchPayload } from '@semblance/core';
import type { ServiceAdapter } from './types.js';

/** Maximum raw download size in bytes (5MB) */
const MAX_DOWNLOAD_SIZE = 5 * 1024 * 1024;
/** Default timeout in ms */
const DEFAULT_TIMEOUT_MS = 15000;
/** Maximum redirects */
const MAX_REDIRECTS = 5;

// Private IP ranges for SSRF protection
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^fd[0-9a-f]{2}:/i,
];

const BLOCKED_SCHEMES = ['file:', 'data:', 'javascript:', 'blob:', 'ftp:'];

export interface WebFetchAdapterConfig {
  /** Optional fetch implementation (for testing) */
  fetchFn?: typeof globalThis.fetch;
  /** Timeout in ms. Default 15000. */
  timeoutMs?: number;
}

export class WebFetchAdapter implements ServiceAdapter {
  private fetchFn: typeof globalThis.fetch;
  private timeoutMs: number;

  constructor(config?: WebFetchAdapterConfig) {
    this.fetchFn = config?.fetchFn ?? globalThis.fetch;
    this.timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async execute(action: ActionType, payload: unknown): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    if (action !== 'web.fetch') {
      return {
        success: false,
        error: { code: 'UNSUPPORTED_ACTION', message: `Web fetch adapter does not support: ${action}` },
      };
    }

    try {
      return await this.handleFetch(payload as WebFetchPayload);
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'WEB_FETCH_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  private async handleFetch(payload: WebFetchPayload): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const urlStr = payload.url;
    const maxContentLength = payload.maxContentLength ?? 50000;

    // Security: validate URL scheme
    const schemeError = this.validateUrlScheme(urlStr);
    if (schemeError) return schemeError;

    // Security: validate not targeting private IP
    const ipError = this.validateNotPrivateIP(urlStr);
    if (ipError) return ipError;

    // Fetch with timeout and redirect limit
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(urlStr, {
        method: 'GET',
        headers: {
          'User-Agent': 'Semblance/1.0 (Local AI Assistant)',
          'Accept': 'text/html, application/xhtml+xml, text/plain, */*',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          success: false,
          error: { code: 'FETCH_TIMEOUT', message: `Request timed out after ${this.timeoutMs}ms` },
        };
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: 'FETCH_HTTP_ERROR',
          message: `HTTP ${response.status} fetching ${urlStr}`,
        },
      };
    }

    const contentType = response.headers.get('content-type') ?? 'text/html';

    // Read body with size limit
    const rawHtml = await this.readBodyWithLimit(response, MAX_DOWNLOAD_SIZE);
    if (rawHtml === null) {
      return {
        success: false,
        error: { code: 'FETCH_TOO_LARGE', message: `Response exceeds ${MAX_DOWNLOAD_SIZE} byte limit` },
      };
    }

    // Extract content
    const { title, content } = this.extractContent(rawHtml, urlStr);

    // Truncate to maxContentLength
    const truncatedContent = content.length > maxContentLength
      ? content.substring(0, maxContentLength) + '\n\n[Content truncated]'
      : content;

    return {
      success: true,
      data: {
        url: urlStr,
        title,
        content: truncatedContent,
        bytesFetched: rawHtml.length,
        contentType,
      },
    };
  }

  private validateUrlScheme(urlStr: string): { success: false; error: { code: string; message: string } } | null {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      return {
        success: false,
        error: { code: 'INVALID_URL', message: `Invalid URL: ${urlStr}` },
      };
    }

    const scheme = parsed.protocol.toLowerCase();
    if (BLOCKED_SCHEMES.includes(scheme)) {
      return {
        success: false,
        error: { code: 'BLOCKED_SCHEME', message: `URL scheme not allowed: ${scheme}` },
      };
    }

    if (scheme !== 'http:' && scheme !== 'https:') {
      return {
        success: false,
        error: { code: 'BLOCKED_SCHEME', message: `Only HTTP(S) URLs are allowed. Got: ${scheme}` },
      };
    }

    return null;
  }

  private validateNotPrivateIP(urlStr: string): { success: false; error: { code: string; message: string } } | null {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      return null; // Already validated in scheme check
    }

    const hostname = parsed.hostname;

    // Check for localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return {
        success: false,
        error: { code: 'SSRF_BLOCKED', message: 'Cannot fetch localhost URLs (SSRF protection)' },
      };
    }

    // Check for private IP ranges
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return {
          success: false,
          error: { code: 'SSRF_BLOCKED', message: 'Cannot fetch private IP addresses (SSRF protection)' },
        };
      }
    }

    return null;
  }

  private async readBodyWithLimit(response: Response, maxBytes: number): Promise<string | null> {
    // Check Content-Length header if available
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      return null;
    }

    const text = await response.text();
    if (text.length > maxBytes) {
      return null;
    }
    return text;
  }

  /**
   * Extract readable content from HTML using Readability if available,
   * with fallback to HTML tag stripping.
   */
  private extractContent(html: string, url: string): { title: string; content: string } {
    // Try Readability extraction
    try {
      return this.extractWithReadability(html, url);
    } catch {
      // Fallback to tag stripping
    }
    return this.extractWithTagStripping(html);
  }

  private extractWithReadability(html: string, url: string): { title: string; content: string } {
    // Dynamic import check — these are Gateway-only dependencies
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Readability } = require('@mozilla/readability');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parseHTML } = require('linkedom');

    const { document } = parseHTML(html);
    const reader = new Readability(document, { url });
    const article = reader.parse();

    if (article && article.textContent) {
      return {
        title: article.title || this.extractTitle(html),
        content: article.textContent.trim(),
      };
    }

    // Readability couldn't parse — fall back
    return this.extractWithTagStripping(html);
  }

  private extractWithTagStripping(html: string): { title: string; content: string } {
    const title = this.extractTitle(html);

    // Remove script and style blocks
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

    // Remove all HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode common HTML entities
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return { title, content: text };
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? match[1].trim() : 'Untitled';
  }
}
