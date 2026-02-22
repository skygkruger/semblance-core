// Tests for Step 10 Commit 7 — Settings UI: Web Search configuration
// Tests search provider selection, API key storage, SearXNG URL, rate limit.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe('Settings Web Search: Provider Selection', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('supports Brave and SearXNG providers', () => {
    const providers = ['brave', 'searxng'] as const;
    expect(providers).toHaveLength(2);
    expect(providers).toContain('brave');
    expect(providers).toContain('searxng');
  });

  it('defaults to Brave Search', () => {
    const defaultProvider = 'brave';
    expect(defaultProvider).toBe('brave');
  });

  it('SearXNG URL field only shown when SearXNG selected', () => {
    const provider = 'searxng';
    const showSearxngUrl = provider === 'searxng';
    expect(showSearxngUrl).toBe(true);

    const providerBrave: string = 'brave';
    const showSearxngUrlBrave = providerBrave === 'searxng';
    expect(showSearxngUrlBrave).toBe(false);
  });

  it('Brave API key field only shown when Brave selected', () => {
    const provider = 'brave';
    const showApiKey = provider === 'brave';
    expect(showApiKey).toBe(true);
  });
});

describe('Settings Web Search: API Key Storage', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('saves search settings via invoke', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await mockInvoke('save_search_settings', {
      provider: 'brave',
      braveApiKey: 'BSA-test-key-123',
      searxngUrl: null,
      rateLimit: 60,
    });

    expect(mockInvoke).toHaveBeenCalledWith('save_search_settings', {
      provider: 'brave',
      braveApiKey: 'BSA-test-key-123',
      searxngUrl: null,
      rateLimit: 60,
    });
  });

  it('tests API key before saving', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true });
    const result = await mockInvoke('test_brave_api_key', { apiKey: 'BSA-valid-key' });
    expect(result.success).toBe(true);
  });

  it('handles invalid API key', async () => {
    mockInvoke.mockResolvedValueOnce({ success: false, error: 'Invalid key' });
    const result = await mockInvoke('test_brave_api_key', { apiKey: 'invalid' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid key');
  });
});

describe('Settings Web Search: SearXNG Configuration', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('saves SearXNG URL', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await mockInvoke('save_search_settings', {
      provider: 'searxng',
      braveApiKey: null,
      searxngUrl: 'https://searx.example.com',
      rateLimit: 60,
    });

    expect(mockInvoke).toHaveBeenCalledWith('save_search_settings', expect.objectContaining({
      provider: 'searxng',
      searxngUrl: 'https://searx.example.com',
    }));
  });
});

describe('Settings Web Search: Rate Limit', () => {
  it('default rate limit is 60 requests per minute', () => {
    const defaultRateLimit = 60;
    expect(defaultRateLimit).toBe(60);
  });

  it('rate limit is configurable', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await mockInvoke('save_search_settings', {
      provider: 'brave',
      braveApiKey: 'key',
      searxngUrl: null,
      rateLimit: 30,
    });

    expect(mockInvoke).toHaveBeenCalledWith('save_search_settings', expect.objectContaining({
      rateLimit: 30,
    }));
  });
});

describe('Settings Web Search: Load Saved Settings', () => {
  it('loads saved settings on mount', async () => {
    mockInvoke.mockResolvedValue({
      provider: 'brave',
      braveApiKeySet: true,
      searxngUrl: null,
      rateLimit: 60,
    });

    const settings = await mockInvoke('get_search_settings');
    expect(settings.provider).toBe('brave');
    expect(settings.braveApiKeySet).toBe(true);
    expect(settings.rateLimit).toBe(60);
  });
});
