// Tests for Step 10 Commit 6 — Web Fetch Gateway Adapter
// Content extraction, SSRF protection, size limits, URL validation.

import { describe, it, expect, vi } from 'vitest';
import { WebFetchAdapter } from '@semblance/gateway/services/web-fetch-adapter.js';

const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<head><title>Test Article</title></head>
<body>
  <script>alert('evil');</script>
  <style>.hidden { display: none; }</style>
  <article>
    <h1>Test Article Title</h1>
    <p>This is the first paragraph of the article.</p>
    <p>This is the second paragraph with some &amp; entities.</p>
  </article>
</body>
</html>`;

function mockFetch(opts: {
  status?: number;
  ok?: boolean;
  body?: string;
  contentType?: string;
  contentLength?: string;
} = {}): typeof globalThis.fetch {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? true;
  const body = opts.body ?? SAMPLE_HTML;
  const contentType = opts.contentType ?? 'text/html';

  return vi.fn().mockResolvedValue({
    status,
    ok,
    headers: {
      get: (name: string) => {
        if (name === 'content-type') return contentType;
        if (name === 'content-length') return opts.contentLength ?? null;
        return null;
      },
    },
    text: () => Promise.resolve(body),
  });
}

describe('WebFetchAdapter: content extraction', () => {
  it('extracts content from HTML (tag stripping fallback)', async () => {
    const adapter = new WebFetchAdapter({ fetchFn: mockFetch() });
    const result = await adapter.execute('web.fetch', { url: 'https://example.com/article' });

    expect(result.success).toBe(true);
    const data = result.data as { title: string; content: string; bytesFetched: number; contentType: string; url: string };
    expect(data.title).toBe('Test Article');
    expect(data.content).toContain('first paragraph');
    expect(data.content).toContain('second paragraph');
    // Script content should be stripped
    expect(data.content).not.toContain('alert');
    // Style content should be stripped
    expect(data.content).not.toContain('.hidden');
    expect(data.url).toBe('https://example.com/article');
    expect(data.contentType).toBe('text/html');
    expect(data.bytesFetched).toBeGreaterThan(0);
  });

  it('decodes HTML entities', async () => {
    const adapter = new WebFetchAdapter({ fetchFn: mockFetch() });
    const result = await adapter.execute('web.fetch', { url: 'https://example.com/article' });

    const data = result.data as { content: string };
    expect(data.content).toContain('&');
    expect(data.content).not.toContain('&amp;');
  });

  it('extracts title from HTML', async () => {
    const adapter = new WebFetchAdapter({
      fetchFn: mockFetch({ body: '<html><head><title>My Page</title></head><body>Hello</body></html>' }),
    });
    const result = await adapter.execute('web.fetch', { url: 'https://example.com' });

    const data = result.data as { title: string };
    expect(data.title).toBe('My Page');
  });

  it('returns "Untitled" when no title tag', async () => {
    const adapter = new WebFetchAdapter({
      fetchFn: mockFetch({ body: '<html><body>No title here</body></html>' }),
    });
    const result = await adapter.execute('web.fetch', { url: 'https://example.com' });

    const data = result.data as { title: string };
    expect(data.title).toBe('Untitled');
  });

  it('respects maxContentLength parameter', async () => {
    const longContent = '<html><head><title>Long</title></head><body>' + 'a'.repeat(10000) + '</body></html>';
    const adapter = new WebFetchAdapter({
      fetchFn: mockFetch({ body: longContent }),
    });
    const result = await adapter.execute('web.fetch', {
      url: 'https://example.com',
      maxContentLength: 100,
    });

    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    // 100 chars + truncation message
    expect(data.content.length).toBeLessThanOrEqual(200);
    expect(data.content).toContain('[Content truncated]');
  });

  it('uses default maxContentLength of 50000', async () => {
    const adapter = new WebFetchAdapter({ fetchFn: mockFetch() });
    const result = await adapter.execute('web.fetch', { url: 'https://example.com' });
    expect(result.success).toBe(true);
    // Small test page shouldn't be truncated
    const data = result.data as { content: string };
    expect(data.content).not.toContain('[Content truncated]');
  });
});

describe('WebFetchAdapter: URL scheme validation', () => {
  it('rejects file:// URLs', async () => {
    const adapter = new WebFetchAdapter({ fetchFn: mockFetch() });
    const result = await adapter.execute('web.fetch', { url: 'file:///etc/passwd' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('BLOCKED_SCHEME');
  });

  it('rejects data: URLs', async () => {
    const adapter = new WebFetchAdapter({ fetchFn: mockFetch() });
    const result = await adapter.execute('web.fetch', { url: 'data:text/html,<h1>evil</h1>' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('BLOCKED_SCHEME');
  });

  it('rejects javascript: URLs', async () => {
    const adapter = new WebFetchAdapter({ fetchFn: mockFetch() });
    const result = await adapter.execute('web.fetch', { url: 'javascript:alert(1)' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('BLOCKED_SCHEME');
  });

  it('rejects ftp: URLs', async () => {
    const adapter = new WebFetchAdapter({ fetchFn: mockFetch() });
    const result = await adapter.execute('web.fetch', { url: 'ftp://evil.com/malware' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('BLOCKED_SCHEME');
  });

  it('rejects invalid URLs', async () => {
    const adapter = new WebFetchAdapter({ fetchFn: mockFetch() });
    const result = await adapter.execute('web.fetch', { url: 'not-a-url' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_URL');
  });

  it('accepts https:// URLs', async () => {
    const adapter = new WebFetchAdapter({ fetchFn: mockFetch() });
    const result = await adapter.execute('web.fetch', { url: 'https://example.com' });
    expect(result.success).toBe(true);
  });

  it('accepts http:// URLs', async () => {
    const adapter = new WebFetchAdapter({ fetchFn: mockFetch() });
    const result = await adapter.execute('web.fetch', { url: 'http://example.com' });
    expect(result.success).toBe(true);
  });
});

describe('WebFetchAdapter: SSRF protection (private IPs)', () => {
  it('rejects localhost', async () => {
    const adapter = new WebFetchAdapter({ fetchFn: mockFetch() });
    const result = await adapter.execute('web.fetch', { url: 'http://localhost:3000/secret' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SSRF_BLOCKED');
  });

  it('rejects 127.0.0.1', async () => {
    const adapter = new WebFetchAdapter({ fetchFn: mockFetch() });
    const result = await adapter.execute('web.fetch', { url: 'http://127.0.0.1:8080' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SSRF_BLOCKED');
  });

  it('rejects 10.x.x.x (private range)', async () => {
    const adapter = new WebFetchAdapter({ fetchFn: mockFetch() });
    const result = await adapter.execute('web.fetch', { url: 'http://10.0.0.1/internal' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SSRF_BLOCKED');
  });

  it('rejects 192.168.x.x (private range)', async () => {
    const adapter = new WebFetchAdapter({ fetchFn: mockFetch() });
    const result = await adapter.execute('web.fetch', { url: 'http://192.168.1.1/admin' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SSRF_BLOCKED');
  });

  it('rejects 172.16-31.x.x (private range)', async () => {
    const adapter = new WebFetchAdapter({ fetchFn: mockFetch() });
    const result = await adapter.execute('web.fetch', { url: 'http://172.16.0.1/internal' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SSRF_BLOCKED');
  });

  it('allows public IP addresses', async () => {
    const adapter = new WebFetchAdapter({ fetchFn: mockFetch() });
    const result = await adapter.execute('web.fetch', { url: 'http://93.184.216.34' });
    expect(result.success).toBe(true);
  });
});

describe('WebFetchAdapter: size and timeout', () => {
  it('rejects responses exceeding 5MB via content-length', async () => {
    const adapter = new WebFetchAdapter({
      fetchFn: mockFetch({ contentLength: '10000000' }),
    });
    const result = await adapter.execute('web.fetch', { url: 'https://example.com/huge' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('FETCH_TOO_LARGE');
  });

  it('handles HTTP errors', async () => {
    const adapter = new WebFetchAdapter({
      fetchFn: mockFetch({ status: 404, ok: false }),
    });
    const result = await adapter.execute('web.fetch', { url: 'https://example.com/missing' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('FETCH_HTTP_ERROR');
    expect(result.error?.message).toContain('404');
  });

  it('handles network errors', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const adapter = new WebFetchAdapter({ fetchFn });

    const result = await adapter.execute('web.fetch', { url: 'https://down.example.com' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('WEB_FETCH_ERROR');
  });
});

describe('WebFetchAdapter: unsupported actions', () => {
  it('rejects non-web.fetch actions', async () => {
    const adapter = new WebFetchAdapter({ fetchFn: mockFetch() });
    const result = await adapter.execute('email.fetch', {});

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNSUPPORTED_ACTION');
  });
});
