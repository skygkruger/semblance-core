/**
 * Plaid Adapter — Connects to Plaid API for real-time bank data.
 *
 * Follows GoogleDriveAdapter pattern: direct REST via globalThis.fetch, no SDK.
 * Plaid tokens are encrypted via OAuthTokenManager.
 * Rate limits: sync=4/hr, balances=12/hr, others=5/hr.
 *
 * Amount convention: Plaid positive=expense → Math.round(plaidAmount * -100) for Semblance cents.
 */

import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from './types.js';
import type { OAuthTokenManager } from './oauth-token-manager.js';
import type { RateLimiter } from '../security/rate-limiter.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlaidLinkResult {
  linkToken: string;
  expiration: string;
}

export interface PlaidSyncResult {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: Array<{ transaction_id: string }>;
  nextCursor: string;
  hasMore: boolean;
}

export interface PlaidTransaction {
  transaction_id: string;
  date: string;
  name: string;
  amount: number;             // Plaid convention: positive = expense
  iso_currency_code: string;
  category: string[] | null;
  merchant_name: string | null;
  account_id: string;
}

export interface PlaidBalance {
  account_id: string;
  name: string;
  type: string;
  subtype: string;
  current: number;
  available: number | null;
  iso_currency_code: string;
}

export interface PlaidConnectionStatus {
  itemId: string;
  institution: string;
  consentExpirationTime: string | null;
  updateType: string;
  status: string;
}

// ─── Plaid API Response Types (internal) ────────────────────────────────────

interface PlaidLinkResponse { link_token: string; expiration: string }
interface PlaidExchangeResponse { access_token: string; item_id: string }
interface PlaidSyncResponse { added: PlaidTransaction[]; modified: PlaidTransaction[]; removed: Array<{ transaction_id: string }>; next_cursor: string; has_more: boolean }
interface PlaidBalanceResponse { accounts: Array<{ account_id: string; name: string; type: string; subtype: string; balances: { current: number; available: number | null; iso_currency_code: string } }> }
interface PlaidItemResponse { item: { item_id: string; institution_id: string; consent_expiration_time: string | null; update_type: string }; status: { transactions?: { last_successful_update: string | null } } }

// ─── Plaid API Config ───────────────────────────────────────────────────────

const PLAID_ENVIRONMENTS = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
} as const;

type PlaidEnvironment = keyof typeof PLAID_ENVIRONMENTS;

// ─── Plaid Adapter ──────────────────────────────────────────────────────────

export class PlaidAdapter implements ServiceAdapter {
  private clientId: string;
  private secret: string;
  private baseUrl: string;
  private tokenManager: OAuthTokenManager;
  private rateLimiter: RateLimiter | null;

  constructor(config: {
    clientId: string;
    secret: string;
    environment?: PlaidEnvironment;
    tokenManager: OAuthTokenManager;
    rateLimiter?: RateLimiter;
  }) {
    this.clientId = config.clientId;
    this.secret = config.secret;
    this.baseUrl = PLAID_ENVIRONMENTS[config.environment ?? 'sandbox'];
    this.tokenManager = config.tokenManager;
    this.rateLimiter = config.rateLimiter ?? null;
  }

  async execute(action: ActionType, payload: unknown): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    try {
      // Rate limit check
      if (this.rateLimiter) {
        const check = this.rateLimiter.check(action);
        if (!check.allowed) {
          return { success: false, error: { code: 'RATE_LIMITED', message: `Rate limited. Retry after ${check.retryAfterMs}ms.` } };
        }
        this.rateLimiter.record(action);
      }

      switch (action) {
        case 'finance.plaid_link': return await this.handleLink(payload as { clientUserId: string; products?: string[] });
        case 'finance.plaid_exchange': return await this.handleExchange(payload as { publicToken: string });
        case 'finance.plaid_sync': return await this.handleSync(payload as { cursor?: string; count?: number });
        case 'finance.plaid_balances': return await this.handleBalances(payload as { accountIds?: string[] });
        case 'finance.plaid_status': return await this.handleStatus();
        case 'finance.plaid_disconnect': return await this.handleDisconnect();
        default:
          return { success: false, error: { code: 'UNSUPPORTED_ACTION', message: `PlaidAdapter does not handle ${action}` } };
      }
    } catch (err) {
      return { success: false, error: { code: 'PLAID_ERROR', message: String(err) } };
    }
  }

  // ─── Action Handlers ────────────────────────────────────────────────────

  private async handleLink(payload: { clientUserId: string; products?: string[] }): Promise<{ success: boolean; data?: PlaidLinkResult; error?: { code: string; message: string } }> {
    const response = await this.plaidRequest('/link/token/create', {
      client_id: this.clientId,
      secret: this.secret,
      user: { client_user_id: payload.clientUserId },
      client_name: 'Semblance',
      products: payload.products ?? ['transactions'],
      country_codes: ['US'],
      language: 'en',
    }) as unknown as PlaidLinkResponse;

    return {
      success: true,
      data: {
        linkToken: response.link_token,
        expiration: response.expiration,
      },
    };
  }

  private async handleExchange(payload: { publicToken: string }): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }> {
    const response = await this.plaidRequest('/item/public_token/exchange', {
      client_id: this.clientId,
      secret: this.secret,
      public_token: payload.publicToken,
    }) as unknown as PlaidExchangeResponse;

    // Store encrypted access token
    await this.tokenManager.storeTokens({
      provider: 'plaid',
      accessToken: response.access_token,
      refreshToken: response.item_id, // Plaid uses item_id instead of refresh token
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // Plaid tokens don't expire
      scopes: 'transactions',
      userEmail: undefined,
    });

    return {
      success: true,
      data: { itemId: response.item_id },
    };
  }

  private async handleSync(payload: { cursor?: string; count?: number }): Promise<{ success: boolean; data?: PlaidSyncResult; error?: { code: string; message: string } }> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return { success: false, error: { code: 'NO_TOKEN', message: 'No Plaid access token. Connect bank first.' } };

    const response = await this.plaidRequest('/transactions/sync', {
      client_id: this.clientId,
      secret: this.secret,
      access_token: accessToken,
      cursor: payload.cursor ?? '',
      count: payload.count ?? 100,
    }) as unknown as PlaidSyncResponse;

    return {
      success: true,
      data: {
        added: response.added ?? [],
        modified: response.modified ?? [],
        removed: response.removed ?? [],
        nextCursor: response.next_cursor,
        hasMore: response.has_more,
      },
    };
  }

  private async handleBalances(payload: { accountIds?: string[] }): Promise<{ success: boolean; data?: PlaidBalance[]; error?: { code: string; message: string } }> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return { success: false, error: { code: 'NO_TOKEN', message: 'No Plaid access token. Connect bank first.' } };

    const body: Record<string, unknown> = {
      client_id: this.clientId,
      secret: this.secret,
      access_token: accessToken,
    };
    if (payload.accountIds) {
      body['options'] = { account_ids: payload.accountIds };
    }

    const response = await this.plaidRequest('/accounts/balance/get', body) as unknown as PlaidBalanceResponse;

    const balances: PlaidBalance[] = response.accounts.map(acc => ({
      account_id: acc.account_id,
      name: acc.name,
      type: acc.type,
      subtype: acc.subtype,
      current: acc.balances.current ?? 0,
      available: acc.balances.available ?? null,
      iso_currency_code: acc.balances.iso_currency_code ?? 'USD',
    }));

    return { success: true, data: balances };
  }

  private async handleStatus(): Promise<{ success: boolean; data?: PlaidConnectionStatus; error?: { code: string; message: string } }> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return { success: false, error: { code: 'NO_TOKEN', message: 'No Plaid access token. Connect bank first.' } };

    const response = await this.plaidRequest('/item/get', {
      client_id: this.clientId,
      secret: this.secret,
      access_token: accessToken,
    }) as unknown as PlaidItemResponse;

    const item = response.item;
    return {
      success: true,
      data: {
        itemId: item.item_id ?? '',
        institution: item.institution_id ?? '',
        consentExpirationTime: item.consent_expiration_time ?? null,
        updateType: item.update_type ?? '',
        status: response.status?.transactions?.last_successful_update ? 'connected' : 'unknown',
      },
    };
  }

  private async handleDisconnect(): Promise<{ success: boolean; error?: { code: string; message: string } }> {
    const accessToken = await this.getAccessToken();
    if (accessToken) {
      await this.plaidRequest('/item/remove', {
        client_id: this.clientId,
        secret: this.secret,
        access_token: accessToken,
      });
    }

    // Clear stored tokens
    await this.tokenManager.revokeTokens('plaid');

    return { success: true };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async getAccessToken(): Promise<string | null> {
    return await this.tokenManager.getAccessToken('plaid');
  }

  private async plaidRequest(endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await globalThis.fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error(`Plaid API error ${response.status}: ${(error as Record<string, string>).error_message ?? response.statusText}`);
    }

    return await response.json() as Record<string, unknown>;
  }
}
