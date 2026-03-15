import { describe, it, expect, vi } from 'vitest';
import { DuckDuckGoAdapter } from '@semblance/gateway/services/duckduckgo-adapter.js';

// Sample DuckDuckGo HTML response (simplified version of actual DDG output)
const DDG_HTML_RESPONSE = `
<html>
<body>
<div class="result results_links results_links_deep web-result">
  <h2 class="result__title">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage1&amp;rut=abc">Example Page One</a>
  </h2>
  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage1">This is the first result snippet with useful content.</a>
</div>
</div>
<div class="result results_links results_links_deep web-result">
  <h2 class="result__title">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fpage2&amp;rut=def">Second Result Title</a>
  </h2>
  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fpage2">Another snippet with &amp; entities and <b>bold</b> text.</a>
</div>
</div>
<div class="result results_links results_links_deep web-result">
  <h2 class="result__title">
    <a class="result__a" href="https://direct-url.com/page3">Direct URL Result</a>
  </h2>
  <a class="result__snippet" href="https://direct-url.com/page3">A result with a direct URL, not proxied.</a>
</div>
</div>
</body>
</html>`;

const DDG_EMPTY_RESPONSE = `<html><body><div class="no-results">No results found</div></body></html>`;

function mockFetch(opts: { status: number; ok: boolean; body: string }): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: opts.ok,
    status: opts.status,
    text: async () => opts.body,
    json: async () => JSON.parse(opts.body),
  }) as unknown as typeof globalThis.fetch;
}

describe('DuckDuckGoAdapter', () => {
  it('returns search results from DDG HTML', async () => {
    const fetchFn = mockFetch({ status: 200, ok: true, body: DDG_HTML_RESPONSE });
    const adapter = new DuckDuckGoAdapter({ fetchFn });

    const result = await adapter.execute('web.search', { query: 'test query' });

    expect(result.success).toBe(true);
    const data = result.data as { results: Array<{ title: string; url: string; snippet: string }>; query: string; provider: string };
    expect(data.provider).toBe('duckduckgo');
    expect(data.query).toBe('test query');
    expect(data.results.length).toBeGreaterThanOrEqual(2);
    expect(data.results[0]!.title).toBe('Example Page One');
    expect(data.results[0]!.url).toBe('https://example.com/page1');
    expect(data.results[0]!.snippet).toContain('first result snippet');
  });

  it('extracts real URLs from DDG proxy URLs', async () => {
    const fetchFn = mockFetch({ status: 200, ok: true, body: DDG_HTML_RESPONSE });
    const adapter = new DuckDuckGoAdapter({ fetchFn });

    const result = await adapter.execute('web.search', { query: 'url test' });
    const data = result.data as { results: Array<{ url: string }> };

    // First result: proxied URL should be decoded
    expect(data.results[0]!.url).toBe('https://example.com/page1');
    // Third result: direct URL should pass through
    expect(data.results[2]!.url).toBe('https://direct-url.com/page3');
  });

  it('strips HTML tags from titles and snippets', async () => {
    const fetchFn = mockFetch({ status: 200, ok: true, body: DDG_HTML_RESPONSE });
    const adapter = new DuckDuckGoAdapter({ fetchFn });

    const result = await adapter.execute('web.search', { query: 'html test' });
    const data = result.data as { results: Array<{ snippet: string }> };

    // Second result has <b>bold</b> and &amp; entity
    expect(data.results[1]!.snippet).toContain('& entities');
    expect(data.results[1]!.snippet).not.toContain('<b>');
  });

  it('respects count parameter', async () => {
    const fetchFn = mockFetch({ status: 200, ok: true, body: DDG_HTML_RESPONSE });
    const adapter = new DuckDuckGoAdapter({ fetchFn });

    const result = await adapter.execute('web.search', { query: 'count test', count: 1 });
    const data = result.data as { results: Array<unknown> };

    expect(data.results.length).toBe(1);
  });

  it('handles empty results gracefully', async () => {
    const fetchFn = mockFetch({ status: 200, ok: true, body: DDG_EMPTY_RESPONSE });
    const adapter = new DuckDuckGoAdapter({ fetchFn });

    const result = await adapter.execute('web.search', { query: 'nothing found' });

    expect(result.success).toBe(true);
    const data = result.data as { results: Array<unknown> };
    expect(data.results).toEqual([]);
  });

  it('returns rate limit error on 429', async () => {
    const fetchFn = mockFetch({ status: 429, ok: false, body: 'Rate limited' });
    const adapter = new DuckDuckGoAdapter({ fetchFn });

    const result = await adapter.execute('web.search', { query: 'rate limited' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('RATE_LIMITED');
  });

  it('returns rate limit error on 503', async () => {
    const fetchFn = mockFetch({ status: 503, ok: false, body: 'Service unavailable' });
    const adapter = new DuckDuckGoAdapter({ fetchFn });

    const result = await adapter.execute('web.search', { query: 'unavailable' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('RATE_LIMITED');
  });

  it('returns HTTP error on other failures', async () => {
    const fetchFn = mockFetch({ status: 500, ok: false, body: 'Internal error' });
    const adapter = new DuckDuckGoAdapter({ fetchFn });

    const result = await adapter.execute('web.search', { query: 'server error' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('DUCKDUCKGO_HTTP_ERROR');
  });

  it('rejects unsupported actions', async () => {
    const adapter = new DuckDuckGoAdapter();

    const result = await adapter.execute('email.fetch' as never, {});

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNSUPPORTED_ACTION');
  });

  it('handles fetch exceptions gracefully', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Network failure')) as unknown as typeof globalThis.fetch;
    const adapter = new DuckDuckGoAdapter({ fetchFn });

    const result = await adapter.execute('web.search', { query: 'network fail' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('DUCKDUCKGO_ERROR');
    expect(result.error?.message).toContain('Network failure');
  });

  it('sends proper headers to DDG', async () => {
    const fetchFn = mockFetch({ status: 200, ok: true, body: DDG_EMPTY_RESPONSE });
    const adapter = new DuckDuckGoAdapter({ fetchFn });

    await adapter.execute('web.search', { query: 'header check' });

    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('html.duckduckgo.com/html/'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('Semblance'),
        }),
      }),
    );
  });

  it('requires no configuration — zero-config adapter', () => {
    // DuckDuckGoAdapter can be constructed with no arguments
    const adapter = new DuckDuckGoAdapter();
    expect(adapter).toBeDefined();
  });
});
