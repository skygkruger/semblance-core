/**
 * Step 19 — PlaidAdapter tests.
 * Mock fetch for all 6 endpoints: link, exchange+encrypt, sync, balances, status, disconnect.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { OAuthTokenManager } from '@semblance/gateway/services/oauth-token-manager';
import { PlaidAdapter } from '@semblance/gateway/services/plaid-adapter';

let db: InstanceType<typeof Database>;
let tokenManager: OAuthTokenManager;
let adapter: PlaidAdapter;

function mockFetchResponse(data: unknown, ok = true, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    json: async () => data,
  } as Response);
}

beforeEach(() => {
  db = new Database(':memory:');
  tokenManager = new OAuthTokenManager(db);
  adapter = new PlaidAdapter({
    clientId: 'test-client-id',
    secret: 'test-secret',
    environment: 'sandbox',
    tokenManager,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  db.close();
});

describe('PlaidAdapter (Step 19)', () => {
  it('creates a link token via finance.plaid_link', async () => {
    mockFetchResponse({
      link_token: 'link-sandbox-abc123',
      expiration: '2026-01-15T12:00:00Z',
    });

    const result = await adapter.execute('finance.plaid_link', {
      clientUserId: 'user-1',
    });

    expect(result.success).toBe(true);
    expect((result.data as { linkToken: string }).linkToken).toBe('link-sandbox-abc123');
  });

  it('exchanges public token and stores encrypted access token via finance.plaid_exchange', async () => {
    mockFetchResponse({
      access_token: 'access-sandbox-xyz',
      item_id: 'item-123',
    });

    const result = await adapter.execute('finance.plaid_exchange', {
      publicToken: 'public-sandbox-abc',
    });

    expect(result.success).toBe(true);
    expect((result.data as { itemId: string }).itemId).toBe('item-123');

    // Verify token was stored
    const stored = await tokenManager.getAccessToken('plaid');
    expect(stored).toBe('access-sandbox-xyz');
  });

  it('syncs transactions with cursor via finance.plaid_sync', async () => {
    // Store token first
    await tokenManager.storeTokens({
      provider: 'plaid',
      accessToken: 'access-sandbox-xyz',
      refreshToken: 'item-123',
      expiresAt: Date.now() + 86400000,
      scopes: 'transactions',
    });

    mockFetchResponse({
      added: [
        { transaction_id: 'txn-1', date: '2026-01-15', name: 'NETFLIX', amount: 14.99, iso_currency_code: 'USD', category: ['Entertainment'], merchant_name: 'Netflix', account_id: 'acc-1' },
      ],
      modified: [],
      removed: [],
      next_cursor: 'cursor-abc',
      has_more: false,
    });

    const result = await adapter.execute('finance.plaid_sync', { cursor: '' });

    expect(result.success).toBe(true);
    const data = result.data as { added: unknown[]; nextCursor: string; hasMore: boolean };
    expect(data.added).toHaveLength(1);
    expect(data.nextCursor).toBe('cursor-abc');
    expect(data.hasMore).toBe(false);
  });

  it('fetches account balances via finance.plaid_balances', async () => {
    await tokenManager.storeTokens({
      provider: 'plaid',
      accessToken: 'access-sandbox-xyz',
      refreshToken: 'item-123',
      expiresAt: Date.now() + 86400000,
      scopes: 'transactions',
    });

    mockFetchResponse({
      accounts: [{
        account_id: 'acc-1',
        name: 'Checking',
        type: 'depository',
        subtype: 'checking',
        balances: { current: 1500.50, available: 1400.00, iso_currency_code: 'USD' },
      }],
    });

    const result = await adapter.execute('finance.plaid_balances', {});

    expect(result.success).toBe(true);
    const balances = result.data as Array<{ account_id: string; current: number }>;
    expect(balances).toHaveLength(1);
    expect(balances[0]!.current).toBe(1500.50);
  });

  it('checks connection status via finance.plaid_status', async () => {
    await tokenManager.storeTokens({
      provider: 'plaid',
      accessToken: 'access-sandbox-xyz',
      refreshToken: 'item-123',
      expiresAt: Date.now() + 86400000,
      scopes: 'transactions',
    });

    mockFetchResponse({
      item: {
        item_id: 'item-123',
        institution_id: 'ins_1',
        consent_expiration_time: null,
        update_type: 'background',
      },
      status: {
        transactions: { last_successful_update: '2026-01-15T12:00:00Z' },
      },
    });

    const result = await adapter.execute('finance.plaid_status', {});

    expect(result.success).toBe(true);
    const status = result.data as { itemId: string; status: string };
    expect(status.itemId).toBe('item-123');
    expect(status.status).toBe('connected');
  });

  it('disconnects and clears tokens via finance.plaid_disconnect', async () => {
    await tokenManager.storeTokens({
      provider: 'plaid',
      accessToken: 'access-sandbox-xyz',
      refreshToken: 'item-123',
      expiresAt: Date.now() + 86400000,
      scopes: 'transactions',
    });

    mockFetchResponse({ request_id: 'req-1' }); // /item/remove response

    const result = await adapter.execute('finance.plaid_disconnect', {});

    expect(result.success).toBe(true);

    // Verify tokens were cleared
    const stored = await tokenManager.getAccessToken('plaid');
    expect(stored).toBeNull();
  });
});
