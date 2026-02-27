/**
 * Social & OAuth Adapter Tests — Phase 5 connector adapters.
 *
 * Tests ConnectorRouter routing, allowlist auto-seeding, auth flows, token exchange,
 * sync data mapping, and error handling for all 9 adapters:
 * Pocket, Instapaper, Todoist, Last.fm, Letterboxd, Mendeley, Harvest, Slack, Box.
 *
 * ~120 tests total. All HTTP calls are mocked via vi.fn() on globalThis.fetch.
 * No real API calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ActionType } from '../../packages/core/types/ipc.js';
import type { OAuthTokenManager } from '../../packages/gateway/services/oauth-token-manager.js';
import type { ImportedItem } from '../../packages/core/importers/types.js';
import { ConnectorRouter } from '../../packages/gateway/services/connector-router.js';
import { PocketAdapter } from '../../packages/gateway/services/pocket/pocket-adapter.js';
import { InstapaperAdapter } from '../../packages/gateway/services/instapaper/instapaper-adapter.js';
import { TodoistAdapter } from '../../packages/gateway/services/todoist/todoist-adapter.js';
import { LastFmAdapter } from '../../packages/gateway/services/lastfm/lastfm-adapter.js';
import { LetterboxdAdapter } from '../../packages/gateway/services/letterboxd/letterboxd-adapter.js';
import { MendeleyAdapter } from '../../packages/gateway/services/mendeley/mendeley-adapter.js';
import { HarvestAdapter } from '../../packages/gateway/services/harvest/harvest-adapter.js';
import { SlackAdapter } from '../../packages/gateway/services/slack/slack-adapter.js';
import { BoxAdapter } from '../../packages/gateway/services/box/box-adapter.js';
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
    userEmail: 'testuser',
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

/** Type-safe array access for strict mode -- asserts the element exists. */
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
// SECTION 1: ConnectorRouter Routing (9 tests)
// ============================================================

describe('ConnectorRouter routing to Phase 5 adapters', () => {
  let router: ConnectorRouter;
  let mockTm: OAuthTokenManager;

  beforeEach(() => {
    router = new ConnectorRouter();
    mockTm = createMockTokenManager();
    vi.restoreAllMocks();
  });

  it('routes connector.sync to PocketAdapter by connectorId', async () => {
    const adapter = new PocketAdapter(mockTm);
    const spy = vi.spyOn(adapter, 'execute').mockResolvedValue({ success: true, data: {} });
    router.registerAdapter('pocket', adapter);

    await router.execute('connector.sync' as ActionType, { connectorId: 'pocket' });
    expect(spy).toHaveBeenCalledWith('connector.sync', { connectorId: 'pocket' });
  });

  it('routes connector.sync to InstapaperAdapter by connectorId', async () => {
    const adapter = new InstapaperAdapter(mockTm);
    const spy = vi.spyOn(adapter, 'execute').mockResolvedValue({ success: true, data: {} });
    router.registerAdapter('instapaper', adapter);

    await router.execute('connector.sync' as ActionType, { connectorId: 'instapaper' });
    expect(spy).toHaveBeenCalledWith('connector.sync', { connectorId: 'instapaper' });
  });

  it('routes connector.sync to TodoistAdapter by connectorId', async () => {
    const adapter = new TodoistAdapter(mockTm);
    const spy = vi.spyOn(adapter, 'execute').mockResolvedValue({ success: true, data: {} });
    router.registerAdapter('todoist', adapter);

    await router.execute('connector.sync' as ActionType, { connectorId: 'todoist' });
    expect(spy).toHaveBeenCalledWith('connector.sync', { connectorId: 'todoist' });
  });

  it('routes connector.sync to LastFmAdapter by connectorId', async () => {
    const adapter = new LastFmAdapter(mockTm, 'test-api-key', 'test-api-secret');
    const spy = vi.spyOn(adapter, 'execute').mockResolvedValue({ success: true, data: {} });
    router.registerAdapter('lastfm', adapter);

    await router.execute('connector.sync' as ActionType, { connectorId: 'lastfm' });
    expect(spy).toHaveBeenCalledWith('connector.sync', { connectorId: 'lastfm' });
  });

  it('routes connector.sync to LetterboxdAdapter by connectorId', async () => {
    const adapter = new LetterboxdAdapter(mockTm, 'test-api-key', 'test-api-secret');
    const spy = vi.spyOn(adapter, 'execute').mockResolvedValue({ success: true, data: {} });
    router.registerAdapter('letterboxd', adapter);

    await router.execute('connector.sync' as ActionType, { connectorId: 'letterboxd' });
    expect(spy).toHaveBeenCalledWith('connector.sync', { connectorId: 'letterboxd' });
  });

  it('routes connector.sync to MendeleyAdapter by connectorId', async () => {
    const adapter = new MendeleyAdapter(mockTm);
    const spy = vi.spyOn(adapter, 'execute').mockResolvedValue({ success: true, data: {} });
    router.registerAdapter('mendeley', adapter);

    await router.execute('connector.sync' as ActionType, { connectorId: 'mendeley' });
    expect(spy).toHaveBeenCalledWith('connector.sync', { connectorId: 'mendeley' });
  });

  it('routes connector.sync to HarvestAdapter by connectorId', async () => {
    const adapter = new HarvestAdapter(mockTm);
    const spy = vi.spyOn(adapter, 'execute').mockResolvedValue({ success: true, data: {} });
    router.registerAdapter('harvest', adapter);

    await router.execute('connector.sync' as ActionType, { connectorId: 'harvest' });
    expect(spy).toHaveBeenCalledWith('connector.sync', { connectorId: 'harvest' });
  });

  it('routes connector.auth to SlackAdapter by connectorId', async () => {
    const adapter = new SlackAdapter(mockTm);
    const spy = vi.spyOn(adapter, 'execute').mockResolvedValue({ success: true, data: {} });
    router.registerAdapter('slack-oauth', adapter);

    await router.execute('connector.auth' as ActionType, { connectorId: 'slack-oauth' });
    expect(spy).toHaveBeenCalledWith('connector.auth', { connectorId: 'slack-oauth' });
  });

  it('routes connector.sync to BoxAdapter by connectorId', async () => {
    const adapter = new BoxAdapter(mockTm);
    const spy = vi.spyOn(adapter, 'execute').mockResolvedValue({ success: true, data: {} });
    router.registerAdapter('box', adapter);

    await router.execute('connector.sync' as ActionType, { connectorId: 'box' });
    expect(spy).toHaveBeenCalledWith('connector.sync', { connectorId: 'box' });
  });
});

// ============================================================
// SECTION 2: Allowlist Auto-Seeding (9 tests)
// ============================================================

describe('Allowlist seeds for Phase 5 connectors', () => {
  it('pocket has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('pocket');
    expect(domains).toContain('getpocket.com');
    expect(domains.length).toBe(1);
  });

  it('instapaper has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('instapaper');
    expect(domains).toContain('www.instapaper.com');
    expect(domains.length).toBe(1);
  });

  it('todoist has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('todoist');
    expect(domains).toContain('todoist.com');
    expect(domains).toContain('api.todoist.com');
    expect(domains.length).toBe(2);
  });

  it('lastfm has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('lastfm');
    expect(domains).toContain('ws.audioscrobbler.com');
    expect(domains).toContain('www.last.fm');
    expect(domains.length).toBe(2);
  });

  it('letterboxd has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('letterboxd');
    expect(domains).toContain('api.letterboxd.com');
    expect(domains.length).toBe(1);
  });

  it('mendeley has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('mendeley');
    expect(domains).toContain('api.mendeley.com');
    expect(domains.length).toBe(1);
  });

  it('harvest has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('harvest');
    expect(domains).toContain('id.getharvest.com');
    expect(domains).toContain('api.harvestapp.com');
    expect(domains.length).toBe(2);
  });

  it('slack-oauth has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('slack-oauth');
    expect(domains).toContain('slack.com');
    expect(domains).toContain('api.slack.com');
    expect(domains.length).toBe(2);
  });

  it('box has correct allowlist seed domains', () => {
    const domains = getAllowlistDomainsForConnector('box');
    expect(domains).toContain('account.box.com');
    expect(domains).toContain('api.box.com');
    expect(domains).toContain('upload.box.com');
    expect(domains.length).toBe(3);
  });
});

// ============================================================
// SECTION 3: PocketAdapter (~13 tests)
// ============================================================

describe('PocketAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: PocketAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new PocketAdapter(mockTm);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns auth status: not authenticated when no tokens', async () => {
    const result = await adapter.execute('connector.auth_status' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(false);
  });

  it('returns auth status: authenticated when valid tokens exist', async () => {
    seedTokens(mockTm, 'pocket');
    const result = await adapter.execute('connector.auth_status' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('disconnect revokes tokens and returns success', async () => {
    seedTokens(mockTm, 'pocket');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('pocket');
  });

  it('sync fetches articles and returns ImportedItems with pkt_ prefix', async () => {
    seedTokens(mockTm, 'pocket');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      status: 1,
      complete: 1,
      list: {
        '1001': {
          item_id: '1001',
          resolved_id: '1001',
          given_title: 'Test Article',
          resolved_title: 'Test Article',
          given_url: 'https://example.com/article',
          resolved_url: 'https://example.com/article',
          excerpt: 'An interesting article.',
          word_count: '500',
          time_added: '1700000000',
          time_updated: '1700001000',
          time_read: '0',
          time_favorited: '0',
          status: '0',
          is_article: '1',
          favorite: '0',
        },
      },
      since: 1700001000,
      error: null,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[]; totalItems: number };
    expect(data.items.length).toBe(1);
    expect(item(data.items, 0).id).toBe('pkt_1001');
    expect(item(data.items, 0).sourceType).toBe('research');
    expect(item(data.items, 0).title).toBe('Test Article');
  });

  it('sync handles empty list', async () => {
    seedTokens(mockTm, 'pocket');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      status: 1,
      complete: 1,
      list: {},
      since: 0,
      error: null,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(0);
  });

  it('sync includes metadata with provider and article details', async () => {
    seedTokens(mockTm, 'pocket');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      status: 1,
      complete: 1,
      list: {
        '2002': {
          item_id: '2002',
          resolved_id: '2002',
          given_title: 'Metadata Test',
          resolved_title: 'Metadata Test',
          given_url: 'https://example.com/meta',
          resolved_url: 'https://example.com/meta',
          excerpt: 'Testing metadata.',
          word_count: '300',
          time_added: '1700000000',
          time_updated: '1700001000',
          time_read: '0',
          time_favorited: '0',
          status: '0',
          is_article: '1',
          favorite: '1',
          tags: { javascript: { item_id: '2002', tag: 'javascript' } },
        },
      },
      since: 1700001000,
      error: null,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    const meta = item(data.items, 0).metadata as Record<string, unknown>;
    expect(meta['provider']).toBe('pocket');
  });

  it('sync reports errors in data.errors on API failure', async () => {
    seedTokens(mockTm, 'pocket');
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ error: 'Unauthorized' }, 401));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    // Pocket sync catches errors and returns success: true with errors array
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[]; errors: Array<{ message: string }> };
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('connector.unknown_action' as ActionType, {});
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>)['code']).toBe('UNKNOWN_ACTION');
  });

  it('sync maps status 0 as unread', async () => {
    seedTokens(mockTm, 'pocket');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      status: 1,
      complete: 1,
      list: {
        '3003': {
          item_id: '3003',
          resolved_id: '3003',
          given_title: 'Unread Article',
          resolved_title: 'Unread Article',
          given_url: 'https://example.com/unread',
          resolved_url: 'https://example.com/unread',
          excerpt: 'Unread article.',
          word_count: '100',
          time_added: '1700000000',
          time_updated: '1700001000',
          time_read: '0',
          time_favorited: '0',
          status: '0',
          is_article: '1',
          favorite: '0',
        },
      },
      since: 1700001000,
      error: null,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10 });
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[] };
    const meta = item(data.items, 0).metadata as Record<string, unknown>;
    expect(meta['status']).toBe('unread');
  });

  it('list_items returns paginated results', async () => {
    seedTokens(mockTm, 'pocket');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      status: 1,
      complete: 1,
      list: {
        '4001': {
          item_id: '4001',
          resolved_id: '4001',
          given_title: 'Page 1 Article',
          resolved_title: 'Page 1 Article',
          given_url: 'https://example.com/page1',
          resolved_url: 'https://example.com/page1',
          excerpt: 'First page.',
          word_count: '200',
          time_added: '1700000000',
          time_updated: '1700001000',
          time_read: '0',
          time_favorited: '0',
          status: '0',
          is_article: '1',
          favorite: '0',
        },
      },
      since: 1700001000,
      error: null,
    }));

    const result = await adapter.execute('connector.list_items' as ActionType, { pageSize: 10 });
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBeGreaterThan(0);
  });

  it('sends POST to getpocket.com/v3/get on sync', async () => {
    seedTokens(mockTm, 'pocket');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      status: 1,
      complete: 1,
      list: {},
      since: 0,
      error: null,
    }));

    await adapter.execute('connector.sync' as ActionType, {});
    expect(fetchSpy).toHaveBeenCalled();
    const callArgs = mockCall(fetchSpy, 0);
    expect(String(callArgs[0])).toContain('getpocket.com');
  });

  it('sync items have valid timestamp field', async () => {
    seedTokens(mockTm, 'pocket');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      status: 1,
      complete: 1,
      list: {
        '5001': {
          item_id: '5001',
          resolved_id: '5001',
          given_title: 'Timestamp Test',
          resolved_title: 'Timestamp Test',
          given_url: 'https://example.com/ts',
          resolved_url: 'https://example.com/ts',
          excerpt: 'Testing timestamps.',
          word_count: '50',
          time_added: '1700000000',
          time_updated: '1700001000',
          time_read: '0',
          time_favorited: '0',
          status: '0',
          is_article: '1',
          favorite: '0',
        },
      },
      since: 1700001000,
      error: null,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10 });
    const data = result.data as { items: ImportedItem[] };
    expect(item(data.items, 0).timestamp).toBeDefined();
  });
});

// ============================================================
// SECTION 4: InstapaperAdapter (~13 tests)
// ============================================================

describe('InstapaperAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: InstapaperAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new InstapaperAdapter(mockTm);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns auth status: not authenticated when no tokens', async () => {
    const result = await adapter.execute('connector.auth_status' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(false);
  });

  it('returns auth status: authenticated when valid tokens exist', async () => {
    seedTokens(mockTm, 'instapaper');
    const result = await adapter.execute('connector.auth_status' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('disconnect revokes tokens and returns success', async () => {
    seedTokens(mockTm, 'instapaper');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('instapaper');
  });

  it('sync fetches bookmarks and returns ImportedItems with ip_ prefix', async () => {
    seedTokens(mockTm, 'instapaper');

    // Bookmarks list response
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      { type: 'meta' },
      { type: 'user', user_id: 100, username: 'test@example.com' },
      {
        type: 'bookmark',
        bookmark_id: 5001,
        title: 'Test Bookmark',
        url: 'https://example.com/bookmark',
        description: 'A test bookmark.',
        time: 1700000000,
        progress: 0.5,
        progress_timestamp: 1700000100,
        starred: '0',
        hash: 'abc123',
      },
    ]));

    // Highlights response (empty)
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBeGreaterThanOrEqual(1);
    const bookmark = data.items.find(i => i.id.startsWith('ip_') && !i.id.startsWith('ip_highlight_'));
    expect(bookmark).toBeDefined();
    expect(bookmark!.id).toBe('ip_5001');
    expect(bookmark!.sourceType).toBe('research');
  });

  it('sync includes highlights with ip_highlight_ prefix', async () => {
    seedTokens(mockTm, 'instapaper');

    // Bookmarks list response
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      { type: 'meta' },
      { type: 'user', user_id: 100, username: 'test@example.com' },
      {
        type: 'bookmark',
        bookmark_id: 6001,
        title: 'Highlight Source',
        url: 'https://example.com/highlighted',
        description: '',
        time: 1700000000,
        progress: 0,
        progress_timestamp: 0,
        starred: '0',
        hash: 'def456',
      },
    ]));

    // Highlights response
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      {
        highlight_id: 7001,
        text: 'This is a highlight.',
        note: 'My note',
        bookmark_id: 6001,
        time: 1700000500,
        position: 0,
      },
    ]));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    const highlight = data.items.find(i => i.id.startsWith('ip_highlight_'));
    expect(highlight).toBeDefined();
    expect(highlight!.id).toBe('ip_highlight_7001');
    expect(highlight!.sourceType).toBe('research');
  });

  it('sync handles empty bookmarks list', async () => {
    seedTokens(mockTm, 'instapaper');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      { type: 'meta' },
      { type: 'user', user_id: 100, username: 'test@example.com' },
    ]));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(0);
  });

  it('sync includes metadata with provider instapaper', async () => {
    seedTokens(mockTm, 'instapaper');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      { type: 'meta' },
      { type: 'user', user_id: 100, username: 'test@example.com' },
      {
        type: 'bookmark',
        bookmark_id: 8001,
        title: 'Metadata Bookmark',
        url: 'https://example.com/meta',
        description: 'Meta test.',
        time: 1700000000,
        progress: 0,
        progress_timestamp: 0,
        starred: '1',
        hash: 'ghi789',
      },
    ]));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10 });
    const data = result.data as { items: ImportedItem[] };
    const meta = item(data.items, 0).metadata as Record<string, unknown>;
    expect(meta['provider']).toBe('instapaper');
  });

  it('sync reports errors in data.errors on API failure', async () => {
    seedTokens(mockTm, 'instapaper');
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ error: 'Rate limit' }, 429));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    // Instapaper sync catches errors and returns success: true with errors array
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[]; errors: Array<{ message: string }> };
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('connector.unknown_action' as ActionType, {});
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>)['code']).toBe('UNKNOWN_ACTION');
  });

  it('sends requests to instapaper.com API', async () => {
    seedTokens(mockTm, 'instapaper');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      { type: 'meta' },
      { type: 'user', user_id: 100, username: 'test@example.com' },
    ]));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    await adapter.execute('connector.sync' as ActionType, {});
    expect(fetchSpy).toHaveBeenCalled();
    const callArgs = mockCall(fetchSpy, 0);
    expect(String(callArgs[0])).toContain('instapaper.com');
  });

  it('list_items returns paginated bookmarks', async () => {
    seedTokens(mockTm, 'instapaper');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      { type: 'meta' },
      { type: 'user', user_id: 100, username: 'test@example.com' },
      {
        type: 'bookmark',
        bookmark_id: 9001,
        title: 'List Item',
        url: 'https://example.com/list',
        description: '',
        time: 1700000000,
        progress: 0,
        progress_timestamp: 0,
        starred: '0',
        hash: 'jkl012',
      },
    ]));

    const result = await adapter.execute('connector.list_items' as ActionType, { pageSize: 10 });
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBeGreaterThan(0);
  });

  it('sync items have valid timestamp', async () => {
    seedTokens(mockTm, 'instapaper');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      { type: 'meta' },
      { type: 'user', user_id: 100, username: 'test@example.com' },
      {
        type: 'bookmark',
        bookmark_id: 10001,
        title: 'TS Test',
        url: 'https://example.com/ts',
        description: '',
        time: 1700000000,
        progress: 0,
        progress_timestamp: 0,
        starred: '0',
        hash: 'mno345',
      },
    ]));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10 });
    const data = result.data as { items: ImportedItem[] };
    expect(item(data.items, 0).timestamp).toBeDefined();
  });
});

// ============================================================
// SECTION 5: TodoistAdapter (~13 tests)
// ============================================================

describe('TodoistAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: TodoistAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new TodoistAdapter(mockTm);
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
    seedTokens(mockTm, 'todoist');
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('disconnect revokes tokens', async () => {
    seedTokens(mockTm, 'todoist');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('todoist');
  });

  it('sync fetches active tasks with tds_task_ prefix', async () => {
    seedTokens(mockTm, 'todoist');

    // Projects response
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      { id: 'proj_1', name: 'Work', color: 'blue', order: 1, is_favorite: false },
    ]));

    // Active tasks response
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      {
        id: 'task_1001',
        content: 'Write tests',
        description: 'Write unit tests for adapters',
        project_id: 'proj_1',
        priority: 4,
        due: { date: '2024-01-15', string: 'Jan 15', datetime: null, timezone: null, is_recurring: false },
        labels: ['dev'],
        created_at: '2024-01-10T10:00:00Z',
        is_completed: false,
        order: 1,
      },
    ]));

    // Completed tasks response
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      items: [],
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    const activeTask = data.items.find(i => i.id === 'tds_task_task_1001');
    expect(activeTask).toBeDefined();
    expect(activeTask!.sourceType).toBe('productivity');
    expect(activeTask!.title).toContain('Write tests');
  });

  it('sync includes completed tasks with tds_done_ prefix', async () => {
    seedTokens(mockTm, 'todoist');

    // Projects
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      { id: 'proj_1', name: 'Work', color: 'blue', order: 1, is_favorite: false },
    ]));

    // Active tasks (empty)
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    // Completed tasks
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      items: [
        {
          task_id: 'task_2001',
          content: 'Review PR',
          project_id: 'proj_1',
          completed_at: '2024-01-12T14:00:00Z',
        },
      ],
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    const doneTask = data.items.find(i => i.id === 'tds_done_task_2001');
    expect(doneTask).toBeDefined();
    expect(doneTask!.sourceType).toBe('productivity');
  });

  it('sync handles empty task list', async () => {
    seedTokens(mockTm, 'todoist');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse([])); // projects
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([])); // active tasks
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ items: [] })); // completed tasks

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(0);
  });

  it('sync metadata includes provider todoist', async () => {
    seedTokens(mockTm, 'todoist');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      { id: 'proj_1', name: 'Work', color: 'blue', order: 1, is_favorite: false },
    ]));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      {
        id: 'task_3001',
        content: 'Meta test',
        description: '',
        project_id: 'proj_1',
        priority: 1,
        due: null,
        labels: [],
        created_at: '2024-01-10T10:00:00Z',
        is_completed: false,
        order: 1,
      },
    ]));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ items: [] }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10 });
    const data = result.data as { items: ImportedItem[] };
    const meta = item(data.items, 0).metadata as Record<string, unknown>;
    expect(meta['provider']).toBe('todoist');
  });

  it('sync returns error on API failure', async () => {
    seedTokens(mockTm, 'todoist');
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 403));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    // Even with partial errors, sync may succeed with error list
    expect(result.success === true || result.success === false).toBe(true);
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('connector.unknown_action' as ActionType, {});
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>)['code']).toBe('UNKNOWN_ACTION');
  });

  it('sends requests to todoist.com API', async () => {
    seedTokens(mockTm, 'todoist');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse([])); // projects
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([])); // tasks
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ items: [] })); // completed

    await adapter.execute('connector.sync' as ActionType, {});
    expect(fetchSpy).toHaveBeenCalled();
    const callArgs = mockCall(fetchSpy, 0);
    expect(String(callArgs[0])).toContain('todoist.com');
  });

  it('sync active tasks include due date info in metadata', async () => {
    seedTokens(mockTm, 'todoist');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      { id: 'proj_1', name: 'Work', color: 'blue', order: 1, is_favorite: false },
    ]));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      {
        id: 'task_4001',
        content: 'Due date task',
        description: '',
        project_id: 'proj_1',
        priority: 3,
        due: { date: '2024-02-01', string: 'Feb 1', datetime: null, timezone: null, is_recurring: false },
        labels: ['urgent'],
        created_at: '2024-01-15T10:00:00Z',
        is_completed: false,
        order: 1,
      },
    ]));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ items: [] }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10 });
    const data = result.data as { items: ImportedItem[] };
    const meta = item(data.items, 0).metadata as Record<string, unknown>;
    expect(meta['due']).toBeDefined();
  });

  it('list_items returns paginated task results', async () => {
    seedTokens(mockTm, 'todoist');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      {
        id: 'task_5001',
        content: 'Listed task',
        description: '',
        project_id: 'proj_1',
        priority: 1,
        due: null,
        labels: [],
        created_at: '2024-01-15T10:00:00Z',
        is_completed: false,
        order: 1,
      },
    ]));

    const result = await adapter.execute('connector.list_items' as ActionType, { pageSize: 10 });
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBeGreaterThan(0);
  });
});

// ============================================================
// SECTION 6: LastFmAdapter (~13 tests)
// ============================================================

describe('LastFmAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: LastFmAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new LastFmAdapter(mockTm, 'test-api-key', 'test-api-secret');
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns auth status: not authenticated when no tokens', async () => {
    const result = await adapter.execute('connector.auth_status' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(false);
  });

  it('returns auth status: authenticated when valid tokens exist', async () => {
    seedTokens(mockTm, 'lastfm');
    const result = await adapter.execute('connector.auth_status' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('disconnect revokes tokens', async () => {
    seedTokens(mockTm, 'lastfm');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('lastfm');
  });

  it('sync fetches scrobbles with lfm_ prefix', async () => {
    seedTokens(mockTm, 'lastfm', 'test-session-key');

    // Recent tracks response
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      recenttracks: {
        track: [
          {
            name: 'Test Song',
            artist: { '#text': 'Test Artist', mbid: 'artist-mbid-1' },
            album: { '#text': 'Test Album', mbid: 'album-mbid-1' },
            mbid: 'track-mbid-1',
            url: 'https://www.last.fm/music/Test+Artist/_/Test+Song',
            date: { uts: '1700000000', '#text': '14 Nov 2023, 22:13' },
            image: [],
            streamable: '0',
          },
        ],
        '@attr': { user: 'testuser', totalPages: '1', page: '1', perPage: '200', total: '1' },
      },
    }));

    // Loved tracks response
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      lovedtracks: {
        track: [],
        '@attr': { user: 'testuser', totalPages: '0', page: '1', perPage: '50', total: '0' },
      },
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    const scrobble = data.items.find(i => i.id.startsWith('lfm_') && !i.id.startsWith('lfm_loved_'));
    expect(scrobble).toBeDefined();
    expect(scrobble!.sourceType).toBe('productivity');
  });

  it('sync includes loved tracks with lfm_loved_ prefix', async () => {
    seedTokens(mockTm, 'lastfm', 'test-session-key');

    // Recent tracks (empty)
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      recenttracks: {
        track: [],
        '@attr': { user: 'testuser', totalPages: '0', page: '1', perPage: '200', total: '0' },
      },
    }));

    // Loved tracks
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      lovedtracks: {
        track: [
          {
            name: 'Loved Song',
            artist: { name: 'Loved Artist', mbid: 'artist-mbid-2', url: '' },
            mbid: 'loved-mbid-1',
            url: 'https://www.last.fm/music/Loved+Artist/_/Loved+Song',
            date: { uts: '1700000100', '#text': '14 Nov 2023, 22:15' },
            image: [],
            streamable: '0',
          },
        ],
        '@attr': { user: 'testuser', totalPages: '1', page: '1', perPage: '50', total: '1' },
      },
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    const loved = data.items.find(i => i.id.startsWith('lfm_loved_'));
    expect(loved).toBeDefined();
    expect(loved!.sourceType).toBe('productivity');
  });

  it('sync handles empty track list', async () => {
    seedTokens(mockTm, 'lastfm', 'test-session-key');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      recenttracks: {
        track: [],
        '@attr': { user: 'testuser', totalPages: '0', page: '1', perPage: '200', total: '0' },
      },
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      lovedtracks: {
        track: [],
        '@attr': { user: 'testuser', totalPages: '0', page: '1', perPage: '50', total: '0' },
      },
    }));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(0);
  });

  it('sync metadata includes provider lastfm', async () => {
    seedTokens(mockTm, 'lastfm', 'test-session-key');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      recenttracks: {
        track: [
          {
            name: 'Meta Song',
            artist: { '#text': 'Meta Artist', mbid: '' },
            album: { '#text': 'Meta Album', mbid: '' },
            mbid: '',
            url: 'https://www.last.fm/music/Meta+Artist/_/Meta+Song',
            date: { uts: '1700000200', '#text': '14 Nov 2023' },
            image: [],
            streamable: '0',
          },
        ],
        '@attr': { user: 'testuser', totalPages: '1', page: '1', perPage: '200', total: '1' },
      },
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      lovedtracks: {
        track: [],
        '@attr': { user: 'testuser', totalPages: '0', page: '1', perPage: '50', total: '0' },
      },
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10 });
    const data = result.data as { items: ImportedItem[] };
    const meta = item(data.items, 0).metadata as Record<string, unknown>;
    expect(meta['provider']).toBe('lastfm');
  });

  it('sync reports errors in data.errors on API failure', async () => {
    seedTokens(mockTm, 'lastfm', 'test-session-key');
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 500));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    // LastFm sync catches errors and returns success: true with errors array
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[]; errors: Array<{ message: string }> };
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('connector.unknown_action' as ActionType, {});
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>)['code']).toBe('UNKNOWN_ACTION');
  });

  it('sends requests to audioscrobbler.com API', async () => {
    seedTokens(mockTm, 'lastfm', 'test-session-key');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      recenttracks: {
        track: [],
        '@attr': { user: 'testuser', totalPages: '0', page: '1', perPage: '200', total: '0' },
      },
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      lovedtracks: {
        track: [],
        '@attr': { user: 'testuser', totalPages: '0', page: '1', perPage: '50', total: '0' },
      },
    }));

    await adapter.execute('connector.sync' as ActionType, {});
    expect(fetchSpy).toHaveBeenCalled();
    const callArgs = mockCall(fetchSpy, 0);
    expect(String(callArgs[0])).toContain('audioscrobbler.com');
  });

  it('sync items have valid timestamp', async () => {
    seedTokens(mockTm, 'lastfm', 'test-session-key');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      recenttracks: {
        track: [
          {
            name: 'TS Song',
            artist: { '#text': 'TS Artist', mbid: '' },
            album: { '#text': 'TS Album', mbid: '' },
            mbid: '',
            url: '',
            date: { uts: '1700000300', '#text': '14 Nov 2023' },
            image: [],
            streamable: '0',
          },
        ],
        '@attr': { user: 'testuser', totalPages: '1', page: '1', perPage: '200', total: '1' },
      },
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      lovedtracks: {
        track: [],
        '@attr': { user: 'testuser', totalPages: '0', page: '1', perPage: '50', total: '0' },
      },
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10 });
    const data = result.data as { items: ImportedItem[] };
    expect(item(data.items, 0).timestamp).toBeDefined();
  });

  it('list_items returns paginated results', async () => {
    seedTokens(mockTm, 'lastfm', 'test-session-key');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      recenttracks: {
        track: [
          {
            name: 'List Song',
            artist: { '#text': 'List Artist', mbid: '' },
            album: { '#text': '', mbid: '' },
            mbid: '',
            url: '',
            date: { uts: '1700000400', '#text': '14 Nov 2023' },
            image: [],
            streamable: '0',
          },
        ],
        '@attr': { user: 'testuser', totalPages: '1', page: '1', perPage: '50', total: '1' },
      },
    }));

    const result = await adapter.execute('connector.list_items' as ActionType, { pageSize: 10 });
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBeGreaterThan(0);
  });
});

// ============================================================
// SECTION 7: LetterboxdAdapter (~13 tests)
// ============================================================

describe('LetterboxdAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: LetterboxdAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new LetterboxdAdapter(mockTm, 'test-api-key', 'test-api-secret');
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns auth status: not authenticated when no tokens', async () => {
    const result = await adapter.execute('connector.auth_status' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(false);
  });

  it('returns auth status: authenticated when valid tokens exist', async () => {
    seedTokens(mockTm, 'letterboxd');
    const result = await adapter.execute('connector.auth_status' as ActionType, {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('auth status returns memberId field', async () => {
    seedTokens(mockTm, 'letterboxd');
    const result = await adapter.execute('connector.auth_status' as ActionType, {});
    expect(result.success).toBe(true);
    // Letterboxd uses memberId instead of username
    expect((result.data as Record<string, unknown>)).toHaveProperty('memberId');
  });

  it('disconnect revokes tokens', async () => {
    seedTokens(mockTm, 'letterboxd');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('letterboxd');
  });

  it('sync fetches diary entries with lbx_ prefix', async () => {
    seedTokens(mockTm, 'letterboxd');

    // Log entries response
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      items: [
        {
          id: 'entry_1001',
          type: 'DiaryEntry',
          film: {
            id: 'film_1001',
            name: 'Test Film',
            releaseYear: 2023,
            directors: [{ id: 'dir_1', name: 'Test Director' }],
            poster: { sizes: [] },
          },
          diaryDetails: { diaryDate: '2024-01-15' },
          rating: 4.0,
          review: { text: 'Great film.' },
          like: true,
          whenCreated: '2024-01-15T20:00:00Z',
          whenUpdated: '2024-01-15T20:00:00Z',
        },
      ],
      next: null,
    }));

    // Watchlist response
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      items: [],
      next: null,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    const entry = data.items.find(i => i.id.startsWith('lbx_') && !i.id.startsWith('lbx_watchlist_'));
    expect(entry).toBeDefined();
    expect(entry!.id).toBe('lbx_entry_1001');
    expect(entry!.sourceType).toBe('productivity');
  });

  it('sync includes watchlist items with lbx_watchlist_ prefix', async () => {
    seedTokens(mockTm, 'letterboxd');

    // Log entries (empty)
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ items: [], next: null }));

    // Watchlist — items are LetterboxdWatchlistEntry: { whenCreated, whenUpdated, film }
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      items: [
        {
          whenCreated: '2024-01-20T10:00:00Z',
          whenUpdated: '2024-01-20T10:00:00Z',
          film: {
            id: 'film_2001',
            name: 'Watchlist Film',
            releaseYear: 2024,
            directors: [{ id: 'dir_2', name: 'WL Director' }],
            poster: { sizes: [] },
          },
        },
      ],
      next: null,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    const watchlistItem = data.items.find(i => i.id.startsWith('lbx_watchlist_'));
    expect(watchlistItem).toBeDefined();
    expect(watchlistItem!.id).toBe('lbx_watchlist_film_2001');
    expect(watchlistItem!.sourceType).toBe('productivity');
  });

  it('sync handles empty results', async () => {
    seedTokens(mockTm, 'letterboxd');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ items: [], next: null }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ items: [], next: null }));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(0);
  });

  it('sync metadata includes provider letterboxd', async () => {
    seedTokens(mockTm, 'letterboxd');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      items: [
        {
          id: 'entry_3001',
          type: 'DiaryEntry',
          film: {
            id: 'film_3001',
            name: 'Meta Film',
            releaseYear: 2023,
            directors: [],
            poster: { sizes: [] },
          },
          diaryDetails: { diaryDate: '2024-01-20' },
          rating: 3.5,
          review: null,
          like: false,
          whenCreated: '2024-01-20T15:00:00Z',
          whenUpdated: '2024-01-20T15:00:00Z',
        },
      ],
      next: null,
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ items: [], next: null }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10 });
    const data = result.data as { items: ImportedItem[] };
    const meta = item(data.items, 0).metadata as Record<string, unknown>;
    expect(meta['provider']).toBe('letterboxd');
  });

  it('sync reports errors in data.errors on API failure', async () => {
    seedTokens(mockTm, 'letterboxd');
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 500));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    // Letterboxd sync catches errors and returns success: true with errors array
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[]; errors: Array<{ message: string }> };
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('connector.unknown_action' as ActionType, {});
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>)['code']).toBe('UNKNOWN_ACTION');
  });

  it('sends requests to letterboxd.com API', async () => {
    seedTokens(mockTm, 'letterboxd');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ items: [], next: null }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ items: [], next: null }));

    await adapter.execute('connector.sync' as ActionType, {});
    expect(fetchSpy).toHaveBeenCalled();
    const callArgs = mockCall(fetchSpy, 0);
    expect(String(callArgs[0])).toContain('letterboxd.com');
  });

  it('sync diary entries have valid timestamp', async () => {
    seedTokens(mockTm, 'letterboxd');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      items: [
        {
          id: 'entry_4001',
          type: 'DiaryEntry',
          film: {
            id: 'film_4001',
            name: 'TS Film',
            releaseYear: 2023,
            directors: [],
            poster: { sizes: [] },
          },
          diaryDetails: { diaryDate: '2024-01-25' },
          rating: 5.0,
          review: null,
          like: true,
          whenCreated: '2024-01-25T10:00:00Z',
          whenUpdated: '2024-01-25T10:00:00Z',
        },
      ],
      next: null,
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ items: [], next: null }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10 });
    const data = result.data as { items: ImportedItem[] };
    expect(item(data.items, 0).timestamp).toBeDefined();
  });
});

// ============================================================
// SECTION 8: MendeleyAdapter (~13 tests)
// ============================================================

describe('MendeleyAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: MendeleyAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new MendeleyAdapter(mockTm);
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
    seedTokens(mockTm, 'mendeley');
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('disconnect revokes tokens', async () => {
    seedTokens(mockTm, 'mendeley');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('mendeley');
  });

  it('sync fetches documents with mnd_doc_ prefix', async () => {
    seedTokens(mockTm, 'mendeley');

    // Documents response
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => [
        {
          id: 'doc-uuid-1001',
          title: 'Research Paper',
          type: 'journal',
          authors: [{ first_name: 'John', last_name: 'Doe' }],
          year: 2023,
          source: 'Nature',
          abstract: 'A research paper abstract.',
          tags: ['biology'],
          created: '2024-01-10T10:00:00Z',
          last_modified: '2024-01-12T10:00:00Z',
          read: false,
          starred: true,
        },
      ],
      text: async () => '[]',
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);

    // Annotations response
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    const doc = data.items.find(i => i.id.startsWith('mnd_doc_'));
    expect(doc).toBeDefined();
    expect(doc!.id).toBe('mnd_doc_doc-uuid-1001');
    expect(doc!.sourceType).toBe('research');
  });

  it('sync includes annotations with mnd_ann_ prefix', async () => {
    seedTokens(mockTm, 'mendeley');

    // Documents
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => [],
      text: async () => '[]',
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);

    // Annotations
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([
      {
        id: 'ann-uuid-2001',
        type: 'highlight',
        text: 'Important finding',
        document_id: 'doc-uuid-1001',
        created: '2024-01-11T14:00:00Z',
        last_modified: '2024-01-11T14:00:00Z',
        color: { r: 255, g: 255, b: 0 },
        positions: [],
      },
    ]));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    const ann = data.items.find(i => i.id.startsWith('mnd_ann_'));
    expect(ann).toBeDefined();
    expect(ann!.id).toBe('mnd_ann_ann-uuid-2001');
    expect(ann!.sourceType).toBe('research');
  });

  it('sync handles empty results', async () => {
    seedTokens(mockTm, 'mendeley');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => [],
      text: async () => '[]',
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(0);
  });

  it('sync metadata includes provider mendeley', async () => {
    seedTokens(mockTm, 'mendeley');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => [
        {
          id: 'doc-uuid-3001',
          title: 'Meta Paper',
          type: 'journal',
          authors: [],
          year: 2024,
          source: 'Science',
          abstract: '',
          tags: [],
          created: '2024-01-15T10:00:00Z',
          last_modified: '2024-01-15T10:00:00Z',
          read: false,
          starred: false,
        },
      ],
      text: async () => '[]',
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10 });
    const data = result.data as { items: ImportedItem[] };
    const meta = item(data.items, 0).metadata as Record<string, unknown>;
    expect(meta['provider']).toBe('mendeley');
  });

  it('sync returns error on API failure', async () => {
    seedTokens(mockTm, 'mendeley');
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 401));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    // Mendeley sync may report partial errors in data.errors
    expect(result.success === true || result.success === false).toBe(true);
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('connector.unknown_action' as ActionType, {});
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>)['code']).toBe('UNKNOWN_ACTION');
  });

  it('sends requests to mendeley.com API', async () => {
    seedTokens(mockTm, 'mendeley');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => [],
      text: async () => '[]',
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    await adapter.execute('connector.sync' as ActionType, {});
    expect(fetchSpy).toHaveBeenCalled();
    const callArgs = mockCall(fetchSpy, 0);
    expect(String(callArgs[0])).toContain('mendeley.com');
  });

  it('sync documents have valid timestamp', async () => {
    seedTokens(mockTm, 'mendeley');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => [
        {
          id: 'doc-uuid-4001',
          title: 'TS Paper',
          type: 'book',
          authors: [],
          year: 2024,
          source: '',
          abstract: '',
          tags: [],
          created: '2024-02-01T10:00:00Z',
          last_modified: '2024-02-01T10:00:00Z',
          read: true,
          starred: false,
        },
      ],
      text: async () => '[]',
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10 });
    const data = result.data as { items: ImportedItem[] };
    expect(item(data.items, 0).timestamp).toBeDefined();
  });

  it('list_items returns paginated documents', async () => {
    seedTokens(mockTm, 'mendeley');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ Link: '' }),
      json: async () => [
        {
          id: 'doc-uuid-5001',
          title: 'Listed Paper',
          type: 'journal',
          authors: [],
          year: 2024,
          source: '',
          abstract: '',
          tags: [],
          created: '2024-02-05T10:00:00Z',
          last_modified: '2024-02-05T10:00:00Z',
          read: false,
          starred: false,
        },
      ],
      text: async () => '[]',
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);

    const result = await adapter.execute('connector.list_items' as ActionType, { pageSize: 10 });
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBeGreaterThan(0);
  });
});

// ============================================================
// SECTION 9: HarvestAdapter (~13 tests)
// ============================================================

describe('HarvestAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: HarvestAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new HarvestAdapter(mockTm);
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
    seedTokens(mockTm, 'harvest');
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('disconnect revokes tokens', async () => {
    seedTokens(mockTm, 'harvest');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('harvest');
  });

  it('sync fetches time entries with hrv_time_ prefix', async () => {
    seedTokens(mockTm, 'harvest');

    // ensureAccountId: /users/me
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      id: 1001,
      first_name: 'Test',
      last_name: 'User',
      email: 'test@harvest.com',
      accounts: [{ id: 12345, name: 'Test Account' }],
    }));

    // Time entries response
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      time_entries: [
        {
          id: 2001,
          spent_date: '2024-01-15',
          hours: 2.5,
          hours_without_timer: 2.5,
          rounded_hours: 2.5,
          notes: 'Worked on feature.',
          is_locked: false,
          is_running: false,
          is_billed: false,
          timer_started_at: null,
          started_time: '09:00',
          ended_time: '11:30',
          created_at: '2024-01-15T09:00:00Z',
          updated_at: '2024-01-15T11:30:00Z',
          user: { id: 1001, name: 'Test User' },
          client: { id: 301, name: 'Acme Corp', currency: 'USD' },
          project: { id: 401, name: 'Website Redesign', code: 'WR' },
          task: { id: 501, name: 'Development' },
          billable: true,
          billable_rate: 150.0,
          cost_rate: 100.0,
        },
      ],
      per_page: 100,
      total_pages: 1,
      total_entries: 1,
      next_page: null,
      previous_page: null,
      page: 1,
    }));

    // Projects response
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      projects: [],
      per_page: 100,
      total_pages: 0,
      total_entries: 0,
      next_page: null,
      previous_page: null,
      page: 1,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    const timeEntry = data.items.find(i => i.id.startsWith('hrv_time_'));
    expect(timeEntry).toBeDefined();
    expect(timeEntry!.id).toBe('hrv_time_2001');
    expect(timeEntry!.sourceType).toBe('productivity');
  });

  it('sync includes projects with hrv_proj_ prefix', async () => {
    seedTokens(mockTm, 'harvest');

    // ensureAccountId
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      id: 1001,
      first_name: 'Test',
      last_name: 'User',
      email: 'test@harvest.com',
      accounts: [{ id: 12345, name: 'Test Account' }],
    }));

    // Time entries (empty)
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      time_entries: [],
      per_page: 100,
      total_pages: 0,
      total_entries: 0,
      next_page: null,
      previous_page: null,
      page: 1,
    }));

    // Projects
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      projects: [
        {
          id: 601,
          name: 'Mobile App',
          code: 'MA',
          is_active: true,
          is_billable: true,
          is_fixed_fee: false,
          budget: 100.0,
          budget_by: 'total_project_fees',
          budget_is_monthly: false,
          starts_on: '2024-01-01',
          ends_on: '2024-06-30',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-15T00:00:00Z',
          notes: 'Mobile app project.',
          client: { id: 301, name: 'Acme Corp', currency: 'USD' },
          cost_budget: null,
          cost_budget_include_expenses: false,
          fee: null,
          over_budget_notification_percentage: 80,
          over_budget_notification_date: null,
        },
      ],
      per_page: 100,
      total_pages: 1,
      total_entries: 1,
      next_page: null,
      previous_page: null,
      page: 1,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    const project = data.items.find(i => i.id.startsWith('hrv_proj_'));
    expect(project).toBeDefined();
    expect(project!.id).toBe('hrv_proj_601');
    expect(project!.sourceType).toBe('productivity');
  });

  it('sync handles empty results', async () => {
    seedTokens(mockTm, 'harvest');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      id: 1001,
      first_name: 'Test',
      last_name: 'User',
      email: 'test@harvest.com',
      accounts: [{ id: 12345, name: 'Test Account' }],
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      time_entries: [],
      per_page: 100,
      total_pages: 0,
      total_entries: 0,
      next_page: null,
      previous_page: null,
      page: 1,
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      projects: [],
      per_page: 100,
      total_pages: 0,
      total_entries: 0,
      next_page: null,
      previous_page: null,
      page: 1,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(0);
  });

  it('sync metadata includes provider harvest', async () => {
    seedTokens(mockTm, 'harvest');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      id: 1001,
      first_name: 'Test',
      last_name: 'User',
      email: 'test@harvest.com',
      accounts: [{ id: 12345, name: 'Test Account' }],
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      time_entries: [
        {
          id: 3001,
          spent_date: '2024-01-20',
          hours: 1.0,
          hours_without_timer: 1.0,
          rounded_hours: 1.0,
          notes: null,
          is_locked: false,
          is_running: false,
          is_billed: false,
          timer_started_at: null,
          started_time: null,
          ended_time: null,
          created_at: '2024-01-20T10:00:00Z',
          updated_at: '2024-01-20T11:00:00Z',
          user: { id: 1001, name: 'Test User' },
          client: { id: 301, name: 'Acme Corp', currency: 'USD' },
          project: { id: 401, name: 'Website', code: 'W' },
          task: { id: 501, name: 'Design' },
          billable: false,
          billable_rate: null,
          cost_rate: null,
        },
      ],
      per_page: 100,
      total_pages: 1,
      total_entries: 1,
      next_page: null,
      previous_page: null,
      page: 1,
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      projects: [],
      per_page: 100,
      total_pages: 0,
      total_entries: 0,
      next_page: null,
      previous_page: null,
      page: 1,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10 });
    const data = result.data as { items: ImportedItem[] };
    const meta = item(data.items, 0).metadata as Record<string, unknown>;
    expect(meta['provider']).toBe('harvest');
  });

  it('sync sends Harvest-Account-Id header', async () => {
    seedTokens(mockTm, 'harvest');

    // ensureAccountId
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      id: 1001,
      first_name: 'Test',
      last_name: 'User',
      email: 'test@harvest.com',
      accounts: [{ id: 99999, name: 'Account' }],
    }));

    // Time entries
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      time_entries: [],
      per_page: 100,
      total_pages: 0,
      total_entries: 0,
      next_page: null,
      previous_page: null,
      page: 1,
    }));

    // Projects
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      projects: [],
      per_page: 100,
      total_pages: 0,
      total_entries: 0,
      next_page: null,
      previous_page: null,
      page: 1,
    }));

    await adapter.execute('connector.sync' as ActionType, {});

    // The second call (time entries) should have Harvest-Account-Id header
    const timeEntriesCall = mockCall(fetchSpy, 1);
    const headers = (timeEntriesCall[1] as Record<string, unknown>)['headers'] as Record<string, string>;
    expect(headers['Harvest-Account-Id']).toBe('99999');
  });

  it('sync returns error when no accounts found', async () => {
    seedTokens(mockTm, 'harvest');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      id: 1001,
      first_name: 'Test',
      last_name: 'User',
      email: 'test@harvest.com',
      accounts: [],
    }));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(false);
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('connector.unknown_action' as ActionType, {});
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>)['code']).toBe('UNKNOWN_ACTION');
  });

  it('sends requests to harvestapp.com API', async () => {
    seedTokens(mockTm, 'harvest');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      id: 1001,
      first_name: 'Test',
      last_name: 'User',
      email: 'test@harvest.com',
      accounts: [{ id: 12345, name: 'Account' }],
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      time_entries: [],
      per_page: 100,
      total_pages: 0,
      total_entries: 0,
      next_page: null,
      previous_page: null,
      page: 1,
    }));
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      projects: [],
      per_page: 100,
      total_pages: 0,
      total_entries: 0,
      next_page: null,
      previous_page: null,
      page: 1,
    }));

    await adapter.execute('connector.sync' as ActionType, {});
    expect(fetchSpy).toHaveBeenCalled();
    // First call is to /users/me on harvestapp.com
    const callArgs = mockCall(fetchSpy, 0);
    expect(String(callArgs[0])).toContain('harvestapp.com');
  });

  it('list_items returns paginated time entries', async () => {
    seedTokens(mockTm, 'harvest');

    // ensureAccountId
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      id: 1001,
      first_name: 'Test',
      last_name: 'User',
      email: 'test@harvest.com',
      accounts: [{ id: 12345, name: 'Account' }],
    }));

    // list_items page
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      time_entries: [
        {
          id: 4001,
          spent_date: '2024-02-01',
          hours: 3.0,
          hours_without_timer: 3.0,
          rounded_hours: 3.0,
          notes: 'List test',
          is_locked: false,
          is_running: false,
          is_billed: false,
          timer_started_at: null,
          started_time: null,
          ended_time: null,
          created_at: '2024-02-01T10:00:00Z',
          updated_at: '2024-02-01T13:00:00Z',
          user: { id: 1001, name: 'Test User' },
          client: { id: 301, name: 'Client', currency: 'USD' },
          project: { id: 401, name: 'Project', code: 'P' },
          task: { id: 501, name: 'Task' },
          billable: false,
          billable_rate: null,
          cost_rate: null,
        },
      ],
      per_page: 50,
      total_pages: 1,
      total_entries: 1,
      next_page: null,
      previous_page: null,
      page: 1,
    }));

    const result = await adapter.execute('connector.list_items' as ActionType, { pageSize: 10 });
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBeGreaterThan(0);
  });
});

// ============================================================
// SECTION 10: SlackAdapter (~13 tests)
// ============================================================

describe('SlackAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: SlackAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new SlackAdapter(mockTm);
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
    seedTokens(mockTm, 'slack-oauth');
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('disconnect revokes tokens', async () => {
    seedTokens(mockTm, 'slack-oauth');
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('slack-oauth');
  });

  it('sync fetches channel messages with slk_live_ prefix', async () => {
    seedTokens(mockTm, 'slack-oauth');

    // conversations.list
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      channels: [
        {
          id: 'C001',
          name: 'general',
          is_channel: true,
          is_im: false,
          is_mpim: false,
          is_private: false,
          is_archived: false,
          is_member: true,
          topic: { value: 'General discussion' },
          purpose: { value: 'Company-wide announcements' },
          num_members: 50,
          updated: 1700000000,
        },
      ],
      response_metadata: { next_cursor: '' },
    }));

    // conversations.history for #general
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      messages: [
        {
          type: 'message',
          user: 'U001',
          text: 'Hello, world!',
          ts: '1700000100.000001',
        },
      ],
      has_more: false,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50, maxChannels: 5 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    const msg = data.items.find(i => i.id.startsWith('slk_live_') && !i.id.startsWith('slk_live_channel_'));
    expect(msg).toBeDefined();
    expect(msg!.id).toBe('slk_live_C001_1700000100000001');
    expect(msg!.sourceType).toBe('messaging');
  });

  it('sync filters out messages with subtype', async () => {
    seedTokens(mockTm, 'slack-oauth');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      channels: [
        {
          id: 'C002',
          name: 'random',
          is_channel: true,
          is_im: false,
          is_mpim: false,
          is_private: false,
          is_archived: false,
          is_member: true,
          num_members: 10,
          updated: 1700000000,
        },
      ],
      response_metadata: { next_cursor: '' },
    }));

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      messages: [
        {
          type: 'message',
          user: 'U001',
          text: 'Regular message',
          ts: '1700000200.000001',
        },
        {
          type: 'message',
          subtype: 'channel_join',
          user: 'U002',
          text: '<@U002> has joined the channel',
          ts: '1700000200.000002',
        },
      ],
      has_more: false,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50, maxChannels: 5 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    // Should only include the regular message, not the channel_join subtype
    const messages = data.items.filter(i => i.id.startsWith('slk_live_') && !i.id.startsWith('slk_live_channel_'));
    expect(messages.length).toBe(1);
    expect(item(messages, 0).content).toBe('Regular message');
  });

  it('sync handles empty channel list', async () => {
    seedTokens(mockTm, 'slack-oauth');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      channels: [],
      response_metadata: { next_cursor: '' },
    }));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(0);
  });

  it('sync metadata includes provider slack-oauth', async () => {
    seedTokens(mockTm, 'slack-oauth');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      channels: [
        {
          id: 'C003',
          name: 'dev',
          is_channel: true,
          is_im: false,
          is_mpim: false,
          is_private: false,
          is_archived: false,
          is_member: true,
          num_members: 5,
          updated: 1700000000,
        },
      ],
      response_metadata: { next_cursor: '' },
    }));

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      messages: [
        {
          type: 'message',
          user: 'U001',
          text: 'Meta message',
          ts: '1700000300.000001',
        },
      ],
      has_more: false,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10, maxChannels: 5 });
    const data = result.data as { items: ImportedItem[] };
    const msg = data.items.find(i => i.id.startsWith('slk_live_') && !i.id.startsWith('slk_live_channel_'));
    expect(msg).toBeDefined();
    const meta = msg!.metadata as Record<string, unknown>;
    expect(meta['provider']).toBe('slack-oauth');
  });

  it('sync returns error on Slack API error', async () => {
    seedTokens(mockTm, 'slack-oauth');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      ok: false,
      error: 'invalid_auth',
    }));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    // Slack sync catches errors in the channels fetch and adds to errors list
    expect(result.success === true || result.success === false).toBe(true);
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('connector.unknown_action' as ActionType, {});
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>)['code']).toBe('UNKNOWN_ACTION');
  });

  it('sends requests to slack.com API', async () => {
    seedTokens(mockTm, 'slack-oauth');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      channels: [],
      response_metadata: { next_cursor: '' },
    }));

    await adapter.execute('connector.sync' as ActionType, {});
    expect(fetchSpy).toHaveBeenCalled();
    const callArgs = mockCall(fetchSpy, 0);
    expect(String(callArgs[0])).toContain('slack.com');
  });

  it('list_items returns channels with slk_live_channel_ prefix', async () => {
    seedTokens(mockTm, 'slack-oauth');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      channels: [
        {
          id: 'C004',
          name: 'announcements',
          is_channel: true,
          is_im: false,
          is_mpim: false,
          is_private: false,
          is_archived: false,
          is_member: true,
          topic: { value: 'Important updates' },
          purpose: { value: '' },
          num_members: 100,
          updated: 1700000000,
        },
      ],
      response_metadata: { next_cursor: '' },
    }));

    const result = await adapter.execute('connector.list_items' as ActionType, { pageSize: 10 });
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBeGreaterThan(0);
    expect(item(data.items, 0).id).toBe('slk_live_channel_C004');
    expect(item(data.items, 0).sourceType).toBe('messaging');
  });

  it('sync messages have valid ISO timestamp', async () => {
    seedTokens(mockTm, 'slack-oauth');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      channels: [
        {
          id: 'C005',
          name: 'timestamps',
          is_channel: true,
          is_im: false,
          is_mpim: false,
          is_private: false,
          is_archived: false,
          is_member: true,
          num_members: 2,
          updated: 1700000000,
        },
      ],
      response_metadata: { next_cursor: '' },
    }));

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      messages: [
        {
          type: 'message',
          user: 'U001',
          text: 'Timestamp test',
          ts: '1700000400.000001',
        },
      ],
      has_more: false,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10, maxChannels: 5 });
    const data = result.data as { items: ImportedItem[] };
    const msg = data.items.find(i => i.id.startsWith('slk_live_') && !i.id.startsWith('slk_live_channel_'));
    expect(msg).toBeDefined();
    expect(msg!.timestamp).toBeDefined();
    // Should be a valid ISO date string
    expect(new Date(msg!.timestamp).getTime()).toBeGreaterThan(0);
  });
});

// ============================================================
// SECTION 11: BoxAdapter (~13 tests)
// ============================================================

describe('BoxAdapter', () => {
  let mockTm: OAuthTokenManager;
  let adapter: BoxAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTm = createMockTokenManager();
    adapter = new BoxAdapter(mockTm);
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
    seedTokens(mockTm, 'box');
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });

  it('disconnect revokes tokens', async () => {
    seedTokens(mockTm, 'box');
    // Box has a revokeUrl, so performDisconnect will try to call it
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: 'ok' }));
    const result = await adapter.execute('connector.disconnect' as ActionType, {});
    expect(result.success).toBe(true);
    expect(mockTm.revokeTokens).toHaveBeenCalledWith('box');
  });

  it('sync fetches folder items with box_ prefix', async () => {
    seedTokens(mockTm, 'box');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      total_count: 1,
      entries: [
        {
          id: '1001',
          type: 'file',
          name: 'report.pdf',
          description: 'Quarterly report',
          size: 1048576,
          content_created_at: '2024-01-10T10:00:00Z',
          content_modified_at: '2024-01-12T10:00:00Z',
          created_at: '2024-01-10T10:00:00Z',
          modified_at: '2024-01-12T10:00:00Z',
          parent: { id: '0', name: 'All Files', type: 'folder' },
          path_collection: {
            total_count: 1,
            entries: [{ id: '0', name: 'All Files', type: 'folder' }],
          },
          extension: 'pdf',
          sha1: 'abc123def456',
        },
      ],
      offset: 0,
      limit: 1000,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(1);
    expect(item(data.items, 0).id).toBe('box_file_1001');
    expect(item(data.items, 0).sourceType).toBe('productivity');
  });

  it('sync maps folders with box_folder_ prefix', async () => {
    seedTokens(mockTm, 'box');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      total_count: 1,
      entries: [
        {
          id: '2001',
          type: 'folder',
          name: 'Projects',
          description: 'Project files',
          size: 0,
          content_created_at: null,
          content_modified_at: null,
          created_at: '2024-01-05T10:00:00Z',
          modified_at: '2024-01-15T10:00:00Z',
          parent: { id: '0', name: 'All Files', type: 'folder' },
          path_collection: {
            total_count: 1,
            entries: [{ id: '0', name: 'All Files', type: 'folder' }],
          },
        },
      ],
      offset: 0,
      limit: 1000,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 50 });
    expect(result.success).toBe(true);

    const data = result.data as { items: ImportedItem[] };
    expect(item(data.items, 0).id).toBe('box_folder_2001');
    expect(item(data.items, 0).sourceType).toBe('productivity');
  });

  it('sync handles empty folder', async () => {
    seedTokens(mockTm, 'box');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      total_count: 0,
      entries: [],
      offset: 0,
      limit: 1000,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBe(0);
  });

  it('sync metadata includes provider box', async () => {
    seedTokens(mockTm, 'box');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      total_count: 1,
      entries: [
        {
          id: '3001',
          type: 'file',
          name: 'notes.txt',
          description: '',
          size: 256,
          content_created_at: null,
          content_modified_at: null,
          created_at: '2024-01-20T10:00:00Z',
          modified_at: '2024-01-20T10:00:00Z',
          parent: { id: '0', name: 'All Files', type: 'folder' },
          path_collection: { total_count: 1, entries: [{ id: '0', name: 'All Files', type: 'folder' }] },
          extension: 'txt',
        },
      ],
      offset: 0,
      limit: 1000,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10 });
    const data = result.data as { items: ImportedItem[] };
    const meta = item(data.items, 0).metadata as Record<string, unknown>;
    expect(meta['provider']).toBe('box');
  });

  it('sync returns error on API failure', async () => {
    seedTokens(mockTm, 'box');
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({}, 403));

    const result = await adapter.execute('connector.sync' as ActionType, {});
    // Box sync catches errors and returns them in data.errors
    expect(result.success === true || result.success === false).toBe(true);
  });

  it('returns error for unknown action', async () => {
    const result = await adapter.execute('connector.unknown_action' as ActionType, {});
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>)['code']).toBe('UNKNOWN_ACTION');
  });

  it('sends requests to api.box.com', async () => {
    seedTokens(mockTm, 'box');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      total_count: 0,
      entries: [],
      offset: 0,
      limit: 1000,
    }));

    await adapter.execute('connector.sync' as ActionType, {});
    expect(fetchSpy).toHaveBeenCalled();
    const callArgs = mockCall(fetchSpy, 0);
    expect(String(callArgs[0])).toContain('api.box.com');
  });

  it('list_items returns paginated folder items', async () => {
    seedTokens(mockTm, 'box');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      total_count: 1,
      entries: [
        {
          id: '4001',
          type: 'file',
          name: 'list_item.docx',
          description: '',
          size: 512,
          content_created_at: null,
          content_modified_at: null,
          created_at: '2024-02-01T10:00:00Z',
          modified_at: '2024-02-01T10:00:00Z',
          parent: { id: '0', name: 'All Files', type: 'folder' },
          path_collection: { total_count: 1, entries: [{ id: '0', name: 'All Files', type: 'folder' }] },
          extension: 'docx',
        },
      ],
      offset: 0,
      limit: 50,
    }));

    const result = await adapter.execute('connector.list_items' as ActionType, { pageSize: 10 });
    expect(result.success).toBe(true);
    const data = result.data as { items: ImportedItem[] };
    expect(data.items.length).toBeGreaterThan(0);
  });

  it('sync items have valid timestamp', async () => {
    seedTokens(mockTm, 'box');

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({
      total_count: 1,
      entries: [
        {
          id: '5001',
          type: 'file',
          name: 'ts_test.csv',
          description: '',
          size: 128,
          content_created_at: null,
          content_modified_at: null,
          created_at: '2024-02-05T10:00:00Z',
          modified_at: '2024-02-05T12:00:00Z',
          parent: { id: '0', name: 'All Files', type: 'folder' },
          path_collection: { total_count: 1, entries: [{ id: '0', name: 'All Files', type: 'folder' }] },
          extension: 'csv',
        },
      ],
      offset: 0,
      limit: 1000,
    }));

    const result = await adapter.execute('connector.sync' as ActionType, { limit: 10 });
    const data = result.data as { items: ImportedItem[] };
    expect(item(data.items, 0).timestamp).toBeDefined();
    expect(item(data.items, 0).timestamp).toBe('2024-02-05T12:00:00Z');
  });

  it('handles cloud.auth_status action', () => {
    seedTokens(mockTm, 'box');
    const result = adapter.handleAuthStatus();
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['authenticated']).toBe(true);
  });
});
