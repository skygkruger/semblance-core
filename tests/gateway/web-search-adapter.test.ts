// Tests for Step 10 Commit 4 — Web Search Gateway Adapter (Brave Search)
// Uses mocked HTTP. No real API calls.

import { describe, it, expect, vi } from 'vitest';
import { WebSearchAdapter } from '@semblance/gateway/services/web-search-adapter.js';
import type { WebSearchAdapterConfig } from '@semblance/gateway/services/web-search-adapter.js';

function mockFetch(response: { status: number; ok: boolean; body: unknown }): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    status: response.status,
    ok: response.ok,
    json: () => Promise.resolve(response.body),
    text: () => Promise.resolve(typeof response.body === 'string' ? response.body : JSON.stringify(response.body)),
  });
}

const BRAVE_RESPONSE = {
  web: {
    results: [
      { title: 'Weather in Portland', url: 'https://weather.com/portland', description: 'Current weather is 52°F', age: '2 hours ago' },
      { title: 'Portland Weather Forecast', url: 'https://accuweather.com/portland', description: '10-day forecast for Portland, OR' },
    ],
  },
};

function createAdapter(opts: Partial<WebSearchAdapterConfig> = {}): WebSearchAdapter {
  return new WebSearchAdapter({
    getApiKey: opts.getApiKey ?? (() => 'test-api-key'),
    fetchFn: opts.fetchFn ?? mockFetch({ status: 200, ok: true, body: BRAVE_RESPONSE }),
  });
}

describe('WebSearchAdapter: successful search', () => {
  it('sends correct request format to Brave API', async () => {
    const fetchFn = mockFetch({ status: 200, ok: true, body: BRAVE_RESPONSE });
    const adapter = createAdapter({ fetchFn });

    await adapter.execute('web.search', { query: 'weather in Portland', count: 5 });

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, opts] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('https://api.search.brave.com/res/v1/web/search');
    expect(url).toContain('q=weather+in+Portland');
    expect(url).toContain('count=5');
    expect(opts.headers['X-Subscription-Token']).toBe('test-api-key');
  });

  it('parses Brave response correctly', async () => {
    const adapter = createAdapter();
    const result = await adapter.execute('web.search', { query: 'weather in Portland' });

    expect(result.success).toBe(true);
    const data = result.data as { results: unknown[]; query: string; provider: string };
    expect(data.results).toHaveLength(2);
    expect(data.query).toBe('weather in Portland');
    expect(data.provider).toBe('brave');
  });

  it('maps Brave fields to WebSearchResult correctly', async () => {
    const adapter = createAdapter();
    const result = await adapter.execute('web.search', { query: 'test' });

    const data = result.data as { results: Array<{ title: string; url: string; snippet: string; age?: string }> };
    expect(data.results[0].title).toBe('Weather in Portland');
    expect(data.results[0].url).toBe('https://weather.com/portland');
    expect(data.results[0].snippet).toBe('Current weather is 52°F');
    expect(data.results[0].age).toBe('2 hours ago');
    expect(data.results[1].age).toBeUndefined();
  });

  it('uses default count of 5 when not specified', async () => {
    const fetchFn = mockFetch({ status: 200, ok: true, body: BRAVE_RESPONSE });
    const adapter = createAdapter({ fetchFn });

    await adapter.execute('web.search', { query: 'test' });

    const [url] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('count=5');
  });

  it('sends freshness parameter when specified', async () => {
    const fetchFn = mockFetch({ status: 200, ok: true, body: BRAVE_RESPONSE });
    const adapter = createAdapter({ fetchFn });

    await adapter.execute('web.search', { query: 'latest news', freshness: 'day' });

    const [url] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('freshness=day');
  });

  it('handles empty results from Brave', async () => {
    const fetchFn = mockFetch({ status: 200, ok: true, body: { web: { results: [] } } });
    const adapter = createAdapter({ fetchFn });

    const result = await adapter.execute('web.search', { query: 'obscure query' });

    expect(result.success).toBe(true);
    const data = result.data as { results: unknown[] };
    expect(data.results).toHaveLength(0);
  });

  it('handles response with no web property', async () => {
    const fetchFn = mockFetch({ status: 200, ok: true, body: {} });
    const adapter = createAdapter({ fetchFn });

    const result = await adapter.execute('web.search', { query: 'weird response' });

    expect(result.success).toBe(true);
    const data = result.data as { results: unknown[] };
    expect(data.results).toHaveLength(0);
  });
});

describe('WebSearchAdapter: missing API key', () => {
  it('returns clear error when no API key configured', async () => {
    const adapter = createAdapter({ getApiKey: () => null });
    const result = await adapter.execute('web.search', { query: 'test' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NO_API_KEY');
    expect(result.error?.message).toContain('Settings');
  });
});

describe('WebSearchAdapter: rate limiting', () => {
  it('handles 429 rate limit response', async () => {
    const fetchFn = mockFetch({ status: 429, ok: false, body: 'Rate limited' });
    const adapter = createAdapter({ fetchFn });

    const result = await adapter.execute('web.search', { query: 'test' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('RATE_LIMITED');
  });
});

describe('WebSearchAdapter: API errors', () => {
  it('handles 401 unauthorized', async () => {
    const fetchFn = mockFetch({ status: 401, ok: false, body: 'Invalid API key' });
    const adapter = createAdapter({ fetchFn });

    const result = await adapter.execute('web.search', { query: 'test' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('BRAVE_API_ERROR');
    expect(result.error?.message).toContain('401');
  });

  it('handles 500 server error', async () => {
    const fetchFn = mockFetch({ status: 500, ok: false, body: 'Internal Server Error' });
    const adapter = createAdapter({ fetchFn });

    const result = await adapter.execute('web.search', { query: 'test' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('BRAVE_API_ERROR');
  });

  it('handles fetch network error', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Network error'));
    const adapter = createAdapter({ fetchFn });

    const result = await adapter.execute('web.search', { query: 'test' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('WEB_SEARCH_ERROR');
    expect(result.error?.message).toContain('Network error');
  });
});

describe('WebSearchAdapter: unsupported actions', () => {
  it('rejects non-web.search actions', async () => {
    const adapter = createAdapter();
    const result = await adapter.execute('email.fetch', {});

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNSUPPORTED_ACTION');
  });
});
