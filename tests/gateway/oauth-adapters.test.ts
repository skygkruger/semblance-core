/**
 * OAuth Adapters Tests — Phase 3 Core OAuth adapter tests.
 *
 * Tests ConnectorRouter routing, auth flows, token exchange, sync data mapping,
 * PKCE where applicable, allowlist auto-seeding, and error handling for all 6 adapters:
 * Spotify, GitHub, Readwise, Notion, Dropbox, OneDrive.
 *
 * ~90 tests total. All HTTP calls are mocked via vi.fn() on globalThis.fetch.
 * No real API calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ActionType } from '../../packages/core/types/ipc.js';
import type { OAuthTokenManager } from '../../packages/gateway/services/oauth-token-manager.js';
import type { ImportedItem } from '../../packages/core/importers/types.js';
import { ConnectorRouter } from '../../packages/gateway/services/connector-router.js';
import { SpotifyAdapter } from '../../packages/gateway/services/spotify/spotify-adapter.js';
import { GitHubAdapter } from '../../packages/gateway/services/github/github-adapter.js';
import { ReadwiseAdapter } from '../../packages/gateway/services/readwise/readwise-adapter.js';
import { NotionAdapter } from '../../packages/gateway/services/notion/notion-adapter.js';
import { DropboxAdapter } from '../../packages/gateway/services/dropbox/dropbox-adapter.js';
import { OneDriveAdapter } from '../../packages/gateway/services/onedrive/onedrive-adapter.js';
import {
  getAllowlistDomainsForConnector,
} from '../../packages/gateway/services/connector-allowlist-seeds.js';

// --- Mock OAuthTokenManager ---

function createMockTokenManager(): OAuthTokenManager {
  const tokens = new Map<string, {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string;
    userEmail?: string;
  }>();

  return {
    storeTokens: vi.fn((t: {
      provider: string;
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
      scopes: string;
      userEmail?: string;
    }) => {
      tokens.set(t.provider, {
        accessToken: t.accessToken,
        refreshToken: t.refreshToken,
        expiresAt: t.expiresAt,
        scopes: t.scopes,
        userEmail: t.userEmail,
      });
    }),
    getAccessToken: vi.fn((provider: string) => tokens.get(provider)?.accessToken ?? null),
    getRefreshToken: vi.fn((provider: string) => tokens.get(provider)?.refreshToken ?? null),
    isTokenExpired: vi.fn((provider: string) => {
      const t = tokens.get(provider);
      if (!t) return true;
      return Date.now() >= t.expiresAt;
    }),
    hasValidTokens: vi.fn((provider: string) => {
      const t = tokens.get(provider);
      return !!t && Date.now() < t.expiresAt;
    }),
    getUserEmail: vi.fn((provider: string) => tokens.get(provider)?.userEmail ?? null),
    revokeTokens: vi.fn((provider: string) => { tokens.delete(provider); }),
    refreshAccessToken: vi.fn((provider: string, newAccessToken: string, newExpiresAt: number, newRefreshToken?: string) => {
      const existing = tokens.get(provider);
      if (existing) {
        existing.accessToken = newAccessToken;
        existing.expiresAt = newExpiresAt;
        if (newRefreshToken) existing.refreshToken = newRefreshToken;
      }
    }),
  } as unknown as OAuthTokenManager;
}

/** Helper: seed valid tokens for a provider */
function seedTokens(tm: OAuthTokenManager, provider: string, accessToken: string = 'test-access-token'): void {
  (tm.storeTokens as unknown as (t: Record<string, unknown>) => void)({
    provider,
    accessToken,
    refreshToken: 'test-refresh-token',
    expiresAt: Date.now() + 3600_000,
    scopes: 'test',
  });
}

/** Helper: create a mock Response */
function mockJsonResponse(data: unknown, status: number = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(),
    json: async () => data,
    text: async () => JSON.stringify(data),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as Response;
}

/** Type-safe array access for strict mode — asserts the element exists. */
function item<T>(arr: T[], idx: number): T {
  const v = arr[idx];
  if (v === undefined) throw new Error(`Test array index ${idx} out of bounds`);
  return v;
}

/** Type-safe mock call access. */
function mockCall(spy: ReturnType<typeof vi.fn>, callIdx: number): unknown[] {
  const call = spy.mock.calls[callIdx];
  if (!call) throw new Error(`Mock call index ${callIdx} out of bounds`);
  return call;
}

// ============================================================
// SECTION 1: ConnectorRouter Routing (6 tests)
// ============================================================

describe('ConnectorRouter routing to adapters', () => {
  let router: ConnectorRouter;
  let mockTm: OAuthTokenManager;

  beforeEach(() => {
    router = new ConnectorRouter();
    mockTm = createMockTokenManager();
    vi.restoreAllMocks();
  });

  it('routes connector.sync to SpotifyAdapter by connectorId', async () => {
    const adapter = new SpotifyAdapter(mockTm);
    const spy = vi.spyOn(adapter, 'execute').mockResolvedValue({ success: true, data: {} });
    router.registerAdapter('spotify', adapter);

    await router.execute('connector.sync' as ActionType, { connectorId: 'spotify' });
    expect(spy).toHaveBeenCalledWith('connector.sync', { connectorId: 'spotify' });
  });

  it('routes connector.auth to GitHubAdapter by connectorId', async () => {
    const adapter = new GitHubAdapter(mockTm);
    const spy = vi.spyOn(adapter, 'execute').mockResolvedValue({ success: true, data: {} });
    router.registerAdapter('github', adapter);

    await router.execute('connector.auth' as ActionType, { connectorId: 'github' });
    expect(spy).toHaveBeenCalledWith('connector.auth', { connectorId: 'github' });
  });

  it('routes connector.sync to ReadwiseAdapter by connectorId', async () => {
    const adapter = new ReadwiseAdapter(mockTm);
    const spy = vi.spyOn(adapter, 'execute').mockResolvedValue({ success: true, data: {} });
    router.registerAdapter('readwise', adapter);

    await router.execute('connector.sync' as ActionType, { connectorId: 'readwise' });
    expect(spy).toHaveBeenCalledWith('connector.sync', { connectorId: 'readwise' });
  });

  it('routes connector.sync to NotionAdapter by connectorId', async () => {
    const adapter = new NotionAdapter(mockTm);
    const spy = vi.spyOn(adapter, 'execute').mockResolvedValue({ success: true, data: {} });
    router.registerAdapter('notion', adapter);

    await router.execute('connector.sync' as ActionType, { connectorId: 'notion' });
    expect(spy).toHaveBeenCalledWith('connector.sync', { connectorId: 'notion' });
  });

  it('routes connector.sync to DropboxAdapter by connectorId', async () => {
    const adapter = new DropboxAdapter(mockTm);
    const spy = vi.spyOn(adapter, 'execute').mockResolvedValue({ success: true, data: {} });
    router.registerAdapter('dropbox', adapter);

    await router.execute('connector.sync' as ActionType, { connectorId: 'dropbox' });
    expect(spy).toHaveBeenCalledWith('connector.sync', { connectorId: 'dropbox' });
  });

  it('routes connector.sync to OneDriveAdapter by connectorId', async () => {
    const adapter = new OneDriveAdapter(mockTm);
    const spy = vi.spyOn(adapter, 'execute').mockResolvedValue({ success: true, data: {} });
    router.registerAdapter('onedrive', adapter);

    await router.execute('connector.sync' as ActionType, { connectorId: 'onedrive' });
    expect(spy).toHaveBeenCalledWith('connector.sync', { connectorId: 'onedrive' });
  });
});

// ============================================================
// SECTION 2: SpotifyAdapter (~14 tests)
// ============================================================

describe('SpotifyAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: SpotifyAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new SpotifyAdapter(mockTm);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns auth status: not authenticated when no tokens', () => {
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(false);
  });

  it('returns auth status: authenticated when valid tokens exist', () => {
    seedTokens(mockTm, 'spotify');
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('disconnect clears tokens', async () => {
    seedTokens(mockTm, 'spotify');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('spotify');
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('some.unknown.action' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_ACTION');
  });

  it('sync fetches recently played and maps to ImportedItem with spt_ prefix', async () => {
    seedTokens(mockTm, 'spotify');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      items: [{
        track: {
          id: 'track-1', name: 'Bohemian Rhapsody',
          artists: [{ name: 'Queen' }],
          album: { name: 'A Night at the Opera' },
          duration_ms: 354000,
          external_urls: { spotify: 'https://open.spotify.com/track/track-1' },
        },
        played_at: '2026-02-20T12:00:00Z',
      }],
      next: null,
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ items: [], next: null, total: 0 }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ items: [], next: null, total: 0 }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    const first = item(data.items, 0);
    expect(first.id).toMatch(/^spt_/);
    expect(first.title).toContain('Bohemian Rhapsody');
    expect(first.title).toContain('Queen');
    expect(first.metadata['provider']).toBe('spotify');
  });

  it('sync fetches top tracks', async () => {
    seedTokens(mockTm, 'spotify');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ items: [], next: null }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      items: [{
        id: 'top-1', name: 'Stairway to Heaven',
        artists: [{ name: 'Led Zeppelin' }],
        album: { name: 'Led Zeppelin IV' },
        duration_ms: 482000,
      }],
      next: null, total: 1,
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ items: [], next: null, total: 0 }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    const first = item(data.items, 0);
    expect(first.id).toBe('spt_top_top-1');
    expect(first.metadata['type']).toBe('top_track');
  });

  it('sync fetches saved tracks', async () => {
    seedTokens(mockTm, 'spotify');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ items: [], next: null }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ items: [], next: null, total: 0 }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      items: [{
        added_at: '2026-01-15T10:00:00Z',
        track: {
          id: 'saved-1', name: 'Hotel California',
          artists: [{ name: 'Eagles' }],
          album: { name: 'Hotel California' },
          duration_ms: 391000,
        },
      }],
      next: null, total: 1,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    const first = item(data.items, 0);
    expect(first.id).toBe('spt_saved_saved-1');
    expect(first.metadata['type']).toBe('saved_track');
  });

  it('sync handles API errors gracefully', async () => {
    seedTokens(mockTm, 'spotify');
    fetchSpy.mockResolvedValue(mockJsonResponse({ error: 'rate limited' }, 429));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[]; errors: Array<{ message: string }> };
    expect(data.items.length).toBe(0);
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it('sync throws when not authenticated', async () => {
    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SPOTIFY_ERROR');
  });

  it('list_items returns paginated saved tracks', async () => {
    seedTokens(mockTm, 'spotify');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      items: [{
        added_at: '2026-01-15T10:00:00Z',
        track: {
          id: 'list-1', name: 'Comfortably Numb',
          artists: [{ name: 'Pink Floyd' }],
          album: { name: 'The Wall' },
          duration_ms: 382000,
        },
      }],
      next: 'https://api.spotify.com/v1/me/tracks?offset=50',
      total: 100,
    }));

    const result = await adapter.execute('connector.list_items' as ActionType, { pageSize: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[]; nextPageToken: string | null; total: number };
    expect(data.items.length).toBe(1);
    expect(data.nextPageToken).not.toBeNull();
    expect(data.total).toBe(100);
  });

  it('uses PKCE: config has usePKCE=true', () => {
    const adapterConfig = (adapter as unknown as { config: { usePKCE: boolean } }).config;
    expect(adapterConfig.usePKCE).toBe(true);
  });

  it('getUserInfo calls Spotify /me endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      email: 'user@spotify.com', display_name: 'Spotify User', id: 'user-123',
    }));

    const adapterAny = adapter as unknown as { getUserInfo(token: string): Promise<{ email?: string; displayName?: string }> };
    const info = await adapterAny.getUserInfo('test-token');
    expect(info.email).toBe('user@spotify.com');
    expect(info.displayName).toBe('Spotify User');

    const call = mockCall(fetchSpy, 0);
    expect(call[0]).toBe('https://api.spotify.com/v1/me');
  });

  it('getUserInfo throws on API error', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 401));

    const adapterAny = adapter as unknown as { getUserInfo(token: string): Promise<unknown> };
    await expect(adapterAny.getUserInfo('bad-token')).rejects.toThrow('Spotify user info failed');
  });
});

// ============================================================
// SECTION 3: GitHubAdapter (~14 tests)
// ============================================================

describe('GitHubAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: GitHubAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new GitHubAdapter(mockTm);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns auth status: not authenticated', () => {
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(false);
  });

  it('returns auth status: authenticated when tokens exist', () => {
    seedTokens(mockTm, 'github');
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('disconnect clears tokens', async () => {
    seedTokens(mockTm, 'github');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('github');
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('some.unknown' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_ACTION');
  });

  it('uses PKCE: config has usePKCE=true', () => {
    const adapterConfig = (adapter as unknown as { config: { usePKCE: boolean } }).config;
    expect(adapterConfig.usePKCE).toBe(true);
  });

  it('sync fetches repos and maps to ImportedItem with gh_ prefix', async () => {
    seedTokens(mockTm, 'github');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      login: 'testuser', email: 'test@github.com', name: 'Test User', id: 1,
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([{
      id: 101, name: 'my-repo', full_name: 'testuser/my-repo',
      description: 'A test repo', html_url: 'https://github.com/testuser/my-repo',
      language: 'TypeScript', stargazers_count: 42, forks_count: 5,
      updated_at: '2026-02-20T12:00:00Z', created_at: '2025-01-01T00:00:00Z',
      private: false, topics: ['test'],
    }]));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    const first = item(data.items, 0);
    expect(first.id).toBe('gh_repo_101');
    expect(first.title).toBe('testuser/my-repo');
    expect(first.metadata['provider']).toBe('github');
  });

  it('sync fetches starred repos', async () => {
    seedTokens(mockTm, 'github');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      login: 'testuser', email: 'test@github.com', name: 'Test', id: 1,
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([{
      id: 202, name: 'awesome-lib', full_name: 'org/awesome-lib',
      description: 'An awesome library', html_url: 'https://github.com/org/awesome-lib',
      language: 'Rust', stargazers_count: 1000, forks_count: 200,
      updated_at: '2026-02-18T12:00:00Z', created_at: '2024-06-01T00:00:00Z',
      private: false,
    }]));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    const first = item(data.items, 0);
    expect(first.id).toBe('gh_starred_202');
    expect(first.metadata['type']).toBe('starred_repo');
  });

  it('sync fetches recent events', async () => {
    seedTokens(mockTm, 'github');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      login: 'testuser', email: 'test@github.com', name: 'Test', id: 1,
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([{
      id: 'evt-1', type: 'PushEvent',
      repo: { name: 'testuser/my-repo' },
      created_at: '2026-02-25T10:00:00Z', payload: {},
    }]));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    const first = item(data.items, 0);
    expect(first.id).toBe('gh_event_evt-1');
    expect(first.metadata['eventType']).toBe('PushEvent');
  });

  it('sync handles API errors gracefully', async () => {
    seedTokens(mockTm, 'github');
    fetchSpy.mockResolvedValue(mockJsonResponse({ message: 'rate limit' }, 403));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { errors: Array<{ message: string }> };
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it('getUserInfo calls GitHub /user endpoint with correct headers', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      login: 'testuser', email: 'test@github.com', name: 'Test', id: 1,
    }));

    const adapterAny = adapter as unknown as { getUserInfo(token: string): Promise<{ email?: string; displayName?: string }> };
    const info = await adapterAny.getUserInfo('test-token');
    expect(info.email).toBe('test@github.com');
    expect(info.displayName).toBe('testuser');

    const call = mockCall(fetchSpy, 0);
    expect(call[0]).toBe('https://api.github.com/user');
    const init = call[1] as Record<string, Record<string, string>>;
    expect(init.headers!['Accept']).toBe('application/vnd.github+json');
  });

  it('list_items returns paginated repos', async () => {
    seedTokens(mockTm, 'github');

    const mockHeaders = new Headers();
    mockHeaders.set('Link', '<https://api.github.com/user/repos?page=2>; rel="next"');

    fetchSpy.mockResolvedValueOnce({
      ok: true, status: 200, statusText: 'OK', headers: mockHeaders,
      json: async () => [{
        id: 101, name: 'repo-1', full_name: 'user/repo-1',
        description: 'desc', html_url: 'https://github.com/user/repo-1',
        language: 'TS', stargazers_count: 10, forks_count: 1,
        updated_at: '2026-02-20T12:00:00Z', created_at: '2025-01-01T00:00:00Z',
        private: false,
      }],
    } as Response);

    const result = await adapter.execute('connector.list_items' as ActionType, { pageSize: 30 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[]; nextPageToken: string | null };
    expect(data.items.length).toBe(1);
    expect(data.nextPageToken).toBe('2');
  });

  it('sync throws when not authenticated', async () => {
    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('GITHUB_ERROR');
  });
});

// ============================================================
// SECTION 4: ReadwiseAdapter (~13 tests)
// ============================================================

describe('ReadwiseAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: ReadwiseAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new ReadwiseAdapter(mockTm);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns auth status: not authenticated', async () => {
    const result = await adapter.execute('connector.auth_status' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(false);
  });

  it('auth with valid API key stores token', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse(null, 204));

    const result = await adapter.execute('connector.auth' as ActionType, { apiKey: 'rw_test_key_123' });
    expect(result.success).toBe(true);
    expect(mockTm.storeTokens).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'readwise', accessToken: 'rw_test_key_123' }),
    );
  });

  it('auth fails with invalid API key', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ detail: 'Invalid token' }, 401));

    const result = await adapter.execute('connector.auth' as ActionType, { apiKey: 'bad_key' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_API_KEY');
  });

  it('auth fails when no API key provided', async () => {
    const result = await adapter.execute('connector.auth' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MISSING_API_KEY');
  });

  it('disconnect clears tokens', async () => {
    seedTokens(mockTm, 'readwise', 'rw_key_123');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['disconnected']).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('readwise');
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('some.unknown' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_ACTION');
  });

  it('sync fetches highlights and maps to ImportedItem with rw_ prefix', async () => {
    seedTokens(mockTm, 'readwise', 'rw_key_123');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      count: 1, next: null,
      results: [{
        id: 1001,
        text: 'The only way to do great work is to love what you do.',
        note: 'Steve Jobs quote', location: 42, location_type: 'page',
        highlighted_at: '2026-02-10T10:00:00Z',
        url: 'https://readwise.io/highlight/1001',
        color: 'yellow', updated: '2026-02-10T12:00:00Z',
        book_id: 500, tags: [{ name: 'inspiration' }],
      }],
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ count: 0, next: null, results: [] }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 1000 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    const first = item(data.items, 0);
    expect(first.id).toBe('rw_highlight_1001');
    expect(first.content).toContain('great work');
    expect(first.metadata['provider']).toBe('readwise');
    expect(first.metadata['type']).toBe('highlight');
  });

  it('sync fetches books', async () => {
    seedTokens(mockTm, 'readwise', 'rw_key_123');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ count: 0, next: null, results: [] }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      count: 1, next: null, results: [{
        id: 500, title: 'Atomic Habits', author: 'James Clear',
        category: 'books', source: 'kindle', num_highlights: 47,
        cover_image_url: null,
        highlights_url: 'https://readwise.io/books/500/highlights',
        updated: '2026-02-15T10:00:00Z',
      }],
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 1000 });
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    const first = item(data.items, 0);
    expect(first.id).toBe('rw_book_500');
    expect(first.metadata['type']).toBe('book');
    expect(first.title).toBe('Atomic Habits');
  });

  it('sync paginates highlights', async () => {
    seedTokens(mockTm, 'readwise', 'rw_key_123');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      count: 2, next: 'https://readwise.io/api/v2/highlights/?page=2',
      results: [{
        id: 1001, text: 'First highlight', note: null,
        location: null, location_type: null,
        highlighted_at: '2026-02-10T10:00:00Z', url: null,
        color: null, updated: '2026-02-10T12:00:00Z',
        book_id: 500, tags: [],
      }],
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      count: 2, next: null,
      results: [{
        id: 1002, text: 'Second highlight', note: null,
        location: null, location_type: null,
        highlighted_at: '2026-02-11T10:00:00Z', url: null,
        color: null, updated: '2026-02-11T12:00:00Z',
        book_id: 501, tags: [],
      }],
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ count: 0, next: null, results: [] }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 1000 });
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(2);
  });

  it('sync handles API errors gracefully', async () => {
    seedTokens(mockTm, 'readwise', 'rw_key_123');
    fetchSpy.mockResolvedValue(mockJsonResponse({}, 500));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 100 });
    expect(result.success).toBe(true);

    const data = result.data as { errors: Array<{ message: string }> };
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it('sync throws when not authenticated', async () => {
    const result = await adapter.execute('connector.sync' as ActionType, { limit: 100 });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('READWISE_ERROR');
  });

  it('list_items returns paginated highlights', async () => {
    seedTokens(mockTm, 'readwise', 'rw_key_123');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      count: 100, next: 'https://readwise.io/api/v2/highlights/?page=2',
      results: [{
        id: 1001, text: 'A highlight', note: null,
        location: null, location_type: null,
        highlighted_at: '2026-02-10T10:00:00Z', url: null,
        color: null, updated: '2026-02-10T12:00:00Z',
        book_id: 500, tags: [],
      }],
    }));

    const result = await adapter.execute('connector.list_items' as ActionType, { pageSize: 100 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[]; nextPageToken: string | null; total: number };
    expect(data.items.length).toBe(1);
    expect(data.nextPageToken).toContain('page=2');
    expect(data.total).toBe(100);
  });
});

// ============================================================
// SECTION 5: NotionAdapter (~13 tests)
// ============================================================

describe('NotionAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: NotionAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new NotionAdapter(mockTm);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns auth status: not authenticated', () => {
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(false);
  });

  it('returns auth status: authenticated when tokens exist', () => {
    seedTokens(mockTm, 'notion');
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('disconnect clears tokens', async () => {
    seedTokens(mockTm, 'notion');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('notion');
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('some.unknown' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_ACTION');
  });

  it('does NOT use PKCE', () => {
    const adapterConfig = (adapter as unknown as { config: { usePKCE: boolean } }).config;
    expect(adapterConfig.usePKCE).toBe(false);
  });

  it('sync fetches pages via POST /v1/search and maps with ntn_ prefix', async () => {
    seedTokens(mockTm, 'notion');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      object: 'list',
      results: [{
        object: 'page', id: 'page-abc-123',
        created_time: '2026-01-01T00:00:00Z',
        last_edited_time: '2026-02-20T12:00:00Z',
        url: 'https://www.notion.so/My-Page-abc123',
        properties: { Name: { type: 'title', title: [{ plain_text: 'My Research Notes' }] } },
        parent: { type: 'workspace', workspace: true },
      }],
      next_cursor: null, has_more: false,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 100 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    const first = item(data.items, 0);
    expect(first.id).toMatch(/^ntn_page_/);
    expect(first.title).toBe('My Research Notes');
    expect(first.metadata['provider']).toBe('notion');
    expect(first.sourceType).toBe('notes');
  });

  it('sync fetches databases', async () => {
    seedTokens(mockTm, 'notion');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      object: 'list',
      results: [{
        object: 'database', id: 'db-xyz-456',
        created_time: '2025-12-01T00:00:00Z',
        last_edited_time: '2026-02-18T10:00:00Z',
        url: 'https://www.notion.so/My-DB-xyz456',
        title: [{ plain_text: 'Project Tracker' }],
        description: [{ plain_text: 'Tracks all active projects' }],
      }],
      next_cursor: null, has_more: false,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 100 });
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    const first = item(data.items, 0);
    expect(first.id).toMatch(/^ntn_db_/);
    expect(first.title).toBe('Project Tracker');
    expect(first.metadata['type']).toBe('database');
  });

  it('sync uses Notion-Version header', async () => {
    seedTokens(mockTm, 'notion');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      object: 'list', results: [], next_cursor: null, has_more: false,
    }));

    await adapter.execute('connector.sync' as ActionType, { limit: 100 });

    const call = mockCall(fetchSpy, 0);
    const init = call[1] as Record<string, Record<string, string>>;
    expect(init.headers!['Notion-Version']).toBe('2022-06-28');
  });

  it('sync paginates using start_cursor', async () => {
    seedTokens(mockTm, 'notion');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      object: 'list',
      results: [{
        object: 'page', id: 'page-1', created_time: '2026-01-01T00:00:00Z',
        last_edited_time: '2026-02-20T12:00:00Z', url: 'https://notion.so/page-1',
        properties: { Name: { type: 'title', title: [{ plain_text: 'Page 1' }] } },
        parent: { type: 'workspace' },
      }],
      next_cursor: 'cursor-abc', has_more: true,
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      object: 'list',
      results: [{
        object: 'page', id: 'page-2', created_time: '2026-01-02T00:00:00Z',
        last_edited_time: '2026-02-21T12:00:00Z', url: 'https://notion.so/page-2',
        properties: { Name: { type: 'title', title: [{ plain_text: 'Page 2' }] } },
        parent: { type: 'workspace' },
      }],
      next_cursor: null, has_more: false,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 100 });
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(2);

    const secondCall = mockCall(fetchSpy, 1);
    const secondInit = secondCall[1] as Record<string, string>;
    const body = JSON.parse(secondInit.body ?? '') as Record<string, unknown>;
    expect(body.start_cursor).toBe('cursor-abc');
  });

  it('sync handles errors gracefully', async () => {
    seedTokens(mockTm, 'notion');
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 500));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 100 });
    expect(result.success).toBe(true);

    const data = result.data as { errors: Array<{ message: string }> };
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it('sync throws when not authenticated', async () => {
    const result = await adapter.execute('connector.sync' as ActionType, { limit: 100 });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOTION_ERROR');
  });

  it('getUserInfo calls Notion /v1/users/me', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      object: 'user', id: 'user-1', name: 'Notion User',
      type: 'person', person: { email: 'user@notion.com' },
    }));

    const adapterAny = adapter as unknown as { getUserInfo(token: string): Promise<{ email?: string; displayName?: string }> };
    const info = await adapterAny.getUserInfo('test-token');
    expect(info.email).toBe('user@notion.com');
    expect(info.displayName).toBe('Notion User');
  });
});

// ============================================================
// SECTION 6: DropboxAdapter (~13 tests)
// ============================================================

describe('DropboxAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: DropboxAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new DropboxAdapter(mockTm);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns auth status: not authenticated', () => {
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(false);
  });

  it('returns auth status: authenticated when tokens exist', () => {
    seedTokens(mockTm, 'dropbox');
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('disconnect uses POST-based revocation then clears tokens', async () => {
    seedTokens(mockTm, 'dropbox');
    fetchSpy.mockResolvedValueOnce(mockJsonResponse(null, 200));

    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('dropbox');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.dropboxapi.com/2/auth/token/revoke',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('some.unknown' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_ACTION');
  });

  it('does NOT use PKCE', () => {
    const adapterConfig = (adapter as unknown as { config: { usePKCE: boolean } }).config;
    expect(adapterConfig.usePKCE).toBe(false);
  });

  it('getUserInfo calls POST /users/get_current_account', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      account_id: 'dbid:123',
      name: { display_name: 'Test User', given_name: 'Test', surname: 'User' },
      email: 'user@dropbox.com', email_verified: true,
    }));

    const adapterAny = adapter as unknown as { getUserInfo(token: string): Promise<{ email?: string; displayName?: string }> };
    const info = await adapterAny.getUserInfo('test-token');
    expect(info.email).toBe('user@dropbox.com');
    expect(info.displayName).toBe('Test User');

    const call = mockCall(fetchSpy, 0);
    expect((call[1] as Record<string, string>).method).toBe('POST');
  });

  it('sync fetches files from root and maps with dbx_ prefix', async () => {
    seedTokens(mockTm, 'dropbox');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      entries: [
        { '.tag': 'file', id: 'id:file-1', name: 'document.pdf',
          path_lower: '/document.pdf', path_display: '/Document.pdf',
          size: 1024, server_modified: '2026-02-20T12:00:00Z',
          client_modified: '2026-02-20T11:00:00Z', content_hash: 'abc123',
          is_downloadable: true },
        { '.tag': 'folder', id: 'id:folder-1', name: 'Projects',
          path_lower: '/projects', path_display: '/Projects' },
      ],
      cursor: 'cursor-abc', has_more: false,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 100 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(2);
    const first = item(data.items, 0);
    const second = item(data.items, 1);
    expect(first.id).toMatch(/^dbx_/);
    expect(first.metadata['provider']).toBe('dropbox');
    expect(second.metadata['type']).toBe('folder');
  });

  it('sync paginates using cursor and list_folder/continue', async () => {
    seedTokens(mockTm, 'dropbox');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      entries: [{ '.tag': 'file', id: 'id:file-1', name: 'file1.txt',
        path_lower: '/file1.txt', path_display: '/file1.txt',
        size: 100, server_modified: '2026-02-20T12:00:00Z',
        client_modified: '2026-02-20T11:00:00Z', is_downloadable: true }],
      cursor: 'cursor-abc', has_more: true,
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      entries: [{ '.tag': 'file', id: 'id:file-2', name: 'file2.txt',
        path_lower: '/file2.txt', path_display: '/file2.txt',
        size: 200, server_modified: '2026-02-21T12:00:00Z',
        client_modified: '2026-02-21T11:00:00Z', is_downloadable: true }],
      cursor: 'cursor-def', has_more: false,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 100 });
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(2);

    const secondCall = mockCall(fetchSpy, 1);
    expect(String(secondCall[0])).toContain('list_folder/continue');
  });

  it('cloud.list_files returns structured file list', async () => {
    seedTokens(mockTm, 'dropbox');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      entries: [
        { '.tag': 'file', id: 'id:file-1', name: 'report.xlsx',
          path_lower: '/report.xlsx', path_display: '/Report.xlsx',
          size: 2048, server_modified: '2026-02-20T12:00:00Z',
          client_modified: '2026-02-20T11:00:00Z', content_hash: 'hash1',
          is_downloadable: true },
      ],
      cursor: 'cursor-abc', has_more: false,
    }));

    const result = await adapter.execute('cloud.list_files' as ActionType, { folderId: '' });
    expect(result.success).toBe(true);

    const data = result.data as { files: Array<Record<string, unknown>> };
    expect(data.files.length).toBe(1);
    const first = item(data.files, 0);
    expect(first['name']).toBe('report.xlsx');
    expect(first['sizeBytes']).toBe(2048);
  });

  it('sync handles API errors gracefully', async () => {
    seedTokens(mockTm, 'dropbox');
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 500));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 100 });
    expect(result.success).toBe(true);

    const data = result.data as { errors: Array<{ message: string }> };
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it('sync throws when not authenticated', async () => {
    const result = await adapter.execute('connector.sync' as ActionType, { limit: 100 });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('DROPBOX_ERROR');
  });

  it('file_metadata returns entry details', async () => {
    seedTokens(mockTm, 'dropbox');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      '.tag': 'file', id: 'id:file-1', name: 'document.pdf',
      path_lower: '/document.pdf', path_display: '/Document.pdf',
      size: 4096, server_modified: '2026-02-20T12:00:00Z',
      client_modified: '2026-02-20T11:00:00Z', content_hash: 'hash1',
      is_downloadable: true,
    }));

    const result = await adapter.execute('cloud.file_metadata' as ActionType, { fileId: '/document.pdf' });
    expect(result.success).toBe(true);

    const data = result.data as Record<string, unknown>;
    expect(data['name']).toBe('document.pdf');
    expect(data['sizeBytes']).toBe(4096);
    expect(data['isFolder']).toBe(false);
  });
});

// ============================================================
// SECTION 7: OneDriveAdapter (~13 tests)
// ============================================================

describe('OneDriveAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: OneDriveAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new OneDriveAdapter(mockTm);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns auth status: not authenticated', () => {
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(false);
  });

  it('returns auth status: authenticated when tokens exist', () => {
    seedTokens(mockTm, 'onedrive');
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('disconnect clears tokens', async () => {
    seedTokens(mockTm, 'onedrive');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('onedrive');
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('some.unknown' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_ACTION');
  });

  it('does NOT use PKCE', () => {
    const adapterConfig = (adapter as unknown as { config: { usePKCE: boolean } }).config;
    expect(adapterConfig.usePKCE).toBe(false);
  });

  it('getUserInfo calls Graph /me endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      id: 'user-1', displayName: 'OneDrive User',
      mail: 'user@outlook.com', userPrincipalName: 'user@outlook.com',
    }));

    const adapterAny = adapter as unknown as { getUserInfo(token: string): Promise<{ email?: string; displayName?: string }> };
    const info = await adapterAny.getUserInfo('test-token');
    expect(info.email).toBe('user@outlook.com');
    expect(info.displayName).toBe('OneDrive User');

    const call = mockCall(fetchSpy, 0);
    expect(call[0]).toBe('https://graph.microsoft.com/v1.0/me');
  });

  it('sync fetches drive items and maps with od_ prefix', async () => {
    seedTokens(mockTm, 'onedrive');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      value: [
        {
          id: 'item-1', name: 'Presentation.pptx', size: 8192,
          createdDateTime: '2026-01-01T00:00:00Z',
          lastModifiedDateTime: '2026-02-20T12:00:00Z',
          webUrl: 'https://onedrive.live.com/item-1',
          file: { mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
        },
        {
          id: 'item-2', name: 'Documents', size: 0,
          createdDateTime: '2025-12-01T00:00:00Z',
          lastModifiedDateTime: '2026-02-19T10:00:00Z',
          webUrl: 'https://onedrive.live.com/item-2',
          folder: { childCount: 15 },
        },
      ],
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 100 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(2);
    const first = item(data.items, 0);
    const second = item(data.items, 1);
    expect(first.id).toBe('od_item-1');
    expect(first.metadata['provider']).toBe('onedrive');
    expect(first.metadata['type']).toBe('file');
    expect(second.metadata['type']).toBe('folder');
  });

  it('sync paginates using @odata.nextLink', async () => {
    seedTokens(mockTm, 'onedrive');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      value: [{
        id: 'item-1', name: 'file1.txt', size: 100,
        createdDateTime: '2026-01-01T00:00:00Z',
        lastModifiedDateTime: '2026-02-20T12:00:00Z',
        webUrl: 'https://onedrive.live.com/item-1',
        file: { mimeType: 'text/plain' },
      }],
      '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/drive/root/children?$skiptoken=abc',
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      value: [{
        id: 'item-2', name: 'file2.txt', size: 200,
        createdDateTime: '2026-01-02T00:00:00Z',
        lastModifiedDateTime: '2026-02-21T12:00:00Z',
        webUrl: 'https://onedrive.live.com/item-2',
        file: { mimeType: 'text/plain' },
      }],
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 100 });
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(2);

    const secondCall = mockCall(fetchSpy, 1);
    expect(String(secondCall[0])).toContain('$skiptoken=abc');
  });

  it('cloud.list_files returns structured files', async () => {
    seedTokens(mockTm, 'onedrive');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      value: [{
        id: 'item-1', name: 'Budget.xlsx', size: 4096,
        createdDateTime: '2026-01-01T00:00:00Z',
        lastModifiedDateTime: '2026-02-20T12:00:00Z',
        webUrl: 'https://onedrive.live.com/item-1',
        file: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      }],
    }));

    const result = await adapter.execute('cloud.list_files' as ActionType, { folderId: 'root' });
    expect(result.success).toBe(true);

    const data = result.data as { files: Array<Record<string, unknown>> };
    expect(data.files.length).toBe(1);
    const first = item(data.files, 0);
    expect(first['name']).toBe('Budget.xlsx');
    expect(first['isFolder']).toBe(false);
  });

  it('cloud.check_changed detects file modification', async () => {
    seedTokens(mockTm, 'onedrive');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      lastModifiedDateTime: '2026-02-25T12:00:00Z',
    }));

    const result = await adapter.execute('cloud.check_changed' as ActionType, {
      fileId: 'item-1', sinceTimestamp: '2026-02-20T00:00:00Z',
    });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['changed']).toBe(true);
  });

  it('sync handles API errors gracefully', async () => {
    seedTokens(mockTm, 'onedrive');
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 500));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 100 });
    expect(result.success).toBe(true);

    const data = result.data as { errors: Array<{ message: string }> };
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it('sync throws when not authenticated', async () => {
    const result = await adapter.execute('connector.sync' as ActionType, { limit: 100 });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('ONEDRIVE_ERROR');
  });

  it('file_metadata returns drive item details', async () => {
    seedTokens(mockTm, 'onedrive');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      id: 'item-1', name: 'report.docx', size: 16384,
      createdDateTime: '2026-01-01T00:00:00Z',
      lastModifiedDateTime: '2026-02-20T12:00:00Z',
      webUrl: 'https://onedrive.live.com/item-1',
      file: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        hashes: { sha1Hash: 'abc123' } },
    }));

    const result = await adapter.execute('cloud.file_metadata' as ActionType, { fileId: 'item-1' });
    expect(result.success).toBe(true);

    const data = result.data as Record<string, unknown>;
    expect(data['name']).toBe('report.docx');
    expect(data['sizeBytes']).toBe(16384);
    expect(data['sha1Hash']).toBe('abc123');
  });
});

// ============================================================
// SECTION 8: Allowlist Auto-Seeding (6 tests)
// ============================================================

describe('Connector Allowlist Auto-Seeding', () => {
  it('spotify has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('spotify');
    expect(domains).toContain('accounts.spotify.com');
    expect(domains).toContain('api.spotify.com');
    expect(domains.length).toBe(2);
  });

  it('github has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('github');
    expect(domains).toContain('github.com');
    expect(domains).toContain('api.github.com');
    expect(domains.length).toBe(2);
  });

  it('readwise has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('readwise');
    expect(domains).toContain('readwise.io');
    expect(domains.length).toBe(1);
  });

  it('notion has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('notion');
    expect(domains).toContain('api.notion.com');
    expect(domains.length).toBe(1);
  });

  it('dropbox has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('dropbox');
    expect(domains).toContain('www.dropbox.com');
    expect(domains).toContain('api.dropboxapi.com');
    expect(domains).toContain('content.dropboxapi.com');
    expect(domains.length).toBe(3);
  });

  it('onedrive has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('onedrive');
    expect(domains).toContain('login.microsoftonline.com');
    expect(domains).toContain('graph.microsoft.com');
    expect(domains.length).toBe(2);
  });
});
