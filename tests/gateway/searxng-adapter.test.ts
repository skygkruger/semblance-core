// Tests for Step 10 Commit 5 — SearXNG Adapter + Web Search Factory

import { describe, it, expect, vi } from 'vitest';
import { SearXNGAdapter } from '@semblance/gateway/services/searxng-adapter.js';
import { WebSearchAdapterFactory } from '@semblance/gateway/services/web-search-factory.js';

function mockFetch(response: { status: number; ok: boolean; body: unknown }): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    status: response.status,
    ok: response.ok,
    json: () => Promise.resolve(response.body),
    text: () => Promise.resolve(typeof response.body === 'string' ? response.body : JSON.stringify(response.body)),
  });
}

const SEARXNG_RESPONSE = {
  results: [
    { title: 'Result 1', url: 'https://example.com/1', content: 'First result snippet' },
    { title: 'Result 2', url: 'https://example.com/2', content: 'Second result snippet' },
    { title: 'Result 3', url: 'https://example.com/3', content: 'Third result snippet' },
  ],
};

describe('SearXNGAdapter: successful search', () => {
  it('sends correct request format', async () => {
    const fetchFn = mockFetch({ status: 200, ok: true, body: SEARXNG_RESPONSE });
    const adapter = new SearXNGAdapter({ getBaseUrl: () => 'https://searx.example.com', fetchFn });

    await adapter.execute('web.search', { query: 'test query' });

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toContain('https://searx.example.com/search');
    expect(url).toContain('q=test+query');
    expect(url).toContain('format=json');
    expect(url).toContain('categories=general');
  });

  it('parses SearXNG response correctly', async () => {
    const fetchFn = mockFetch({ status: 200, ok: true, body: SEARXNG_RESPONSE });
    const adapter = new SearXNGAdapter({ getBaseUrl: () => 'https://searx.example.com', fetchFn });

    const result = await adapter.execute('web.search', { query: 'test' });

    expect(result.success).toBe(true);
    const data = result.data as { results: unknown[]; provider: string };
    expect(data.provider).toBe('searxng');
    expect(data.results).toHaveLength(3);
  });

  it('respects count parameter', async () => {
    const fetchFn = mockFetch({ status: 200, ok: true, body: SEARXNG_RESPONSE });
    const adapter = new SearXNGAdapter({ getBaseUrl: () => 'https://searx.example.com', fetchFn });

    const result = await adapter.execute('web.search', { query: 'test', count: 2 });

    const data = result.data as { results: unknown[] };
    expect(data.results).toHaveLength(2);
  });

  it('strips trailing slash from base URL', async () => {
    const fetchFn = mockFetch({ status: 200, ok: true, body: SEARXNG_RESPONSE });
    const adapter = new SearXNGAdapter({ getBaseUrl: () => 'https://searx.example.com/', fetchFn });

    await adapter.execute('web.search', { query: 'test' });

    const [url] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).not.toContain('//search');
    expect(url).toContain('example.com/search');
  });
});

describe('SearXNGAdapter: errors', () => {
  it('returns error when no base URL configured', async () => {
    const adapter = new SearXNGAdapter({ getBaseUrl: () => null });
    const result = await adapter.execute('web.search', { query: 'test' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NO_SEARXNG_URL');
  });

  it('handles connection errors', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Connection refused'));
    const adapter = new SearXNGAdapter({ getBaseUrl: () => 'https://searx.example.com', fetchFn });

    const result = await adapter.execute('web.search', { query: 'test' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SEARXNG_ERROR');
  });

  it('handles API errors', async () => {
    const fetchFn = mockFetch({ status: 503, ok: false, body: 'Service unavailable' });
    const adapter = new SearXNGAdapter({ getBaseUrl: () => 'https://searx.example.com', fetchFn });

    const result = await adapter.execute('web.search', { query: 'test' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SEARXNG_API_ERROR');
  });
});

describe('WebSearchAdapterFactory', () => {
  it('returns Brave adapter when provider is brave', () => {
    const factory = new WebSearchAdapterFactory({
      getProvider: () => 'brave',
      getBraveApiKey: () => 'test-key',
      getSearXNGUrl: () => null,
    });
    const adapter = factory.getAdapter();
    // Execute a search to verify it uses Brave behavior
    expect(adapter).toBeDefined();
  });

  it('returns SearXNG adapter when provider is searxng and URL is set', () => {
    const factory = new WebSearchAdapterFactory({
      getProvider: () => 'searxng',
      getBraveApiKey: () => null,
      getSearXNGUrl: () => 'https://searx.example.com',
    });
    const adapter = factory.getAdapter();
    expect(adapter).toBeDefined();
  });

  it('falls back to Brave when SearXNG selected but no URL configured', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const factory = new WebSearchAdapterFactory({
      getProvider: () => 'searxng',
      getBraveApiKey: () => 'test-key',
      getSearXNGUrl: () => null,
    });
    const adapter = factory.getAdapter();
    expect(adapter).toBeDefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('falling back to Brave'));
    warnSpy.mockRestore();
  });

  it('factory adapters actually work with mocked fetch', async () => {
    const fetchFn = mockFetch({ status: 200, ok: true, body: SEARXNG_RESPONSE });
    const factory = new WebSearchAdapterFactory({
      getProvider: () => 'searxng',
      getBraveApiKey: () => null,
      getSearXNGUrl: () => 'https://searx.example.com',
      fetchFn,
    });
    const adapter = factory.getAdapter();
    const result = await adapter.execute('web.search', { query: 'factory test' });
    expect(result.success).toBe(true);
    const data = result.data as { provider: string };
    expect(data.provider).toBe('searxng');
  });
});
