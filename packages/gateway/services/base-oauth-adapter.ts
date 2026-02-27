/**
 * BaseOAuthAdapter — Abstract base class for all OAuth 2.0 connector adapters.
 *
 * Extracts the common OAuth flow (auth, token exchange, refresh, disconnect, status)
 * from GoogleDriveAdapter so every connector doesn't duplicate 80+ lines.
 *
 * Subclasses implement:
 *   - getUserInfo(accessToken): fetch user email/name after successful auth
 *   - execute(action, payload): route action types to connector-specific handlers
 *   - static getOAuthConfig(): return the OAuthConfig for this connector
 */

import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from './types.js';
import type { OAuthTokenManager } from './oauth-token-manager.js';
import type { OAuthConfig } from './oauth-config.js';
import { OAuthCallbackServer } from './oauth-callback-server.js';

export interface AdapterResult {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

export abstract class BaseOAuthAdapter implements ServiceAdapter {
  protected tokenManager: OAuthTokenManager;
  protected config: OAuthConfig;

  constructor(tokenManager: OAuthTokenManager, config: OAuthConfig) {
    this.tokenManager = tokenManager;
    this.config = config;
  }

  abstract execute(action: ActionType, payload: unknown): Promise<AdapterResult>;

  /** Fetch user info after successful auth. Return the user email or display name. */
  protected abstract getUserInfo(accessToken: string): Promise<{ email?: string; displayName?: string }>;

  /**
   * Start the OAuth authorization flow.
   * Opens a localhost callback server, builds the auth URL, exchanges the code for tokens.
   */
  async performAuthFlow(): Promise<AdapterResult> {
    const callbackServer = new OAuthCallbackServer();
    const { callbackUrl, state } = await callbackServer.start();

    const authUrl = new URL(this.config.authUrl);
    authUrl.searchParams.set('client_id', this.config.clientId);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', this.config.scopes);
    authUrl.searchParams.set('state', state);

    // Apply extra params (e.g. access_type=offline, prompt=consent)
    if (this.config.extraAuthParams) {
      for (const [key, value] of Object.entries(this.config.extraAuthParams)) {
        authUrl.searchParams.set(key, value);
      }
    }

    // Subclasses (BasePKCEAdapter) may add PKCE params — this is the extension point
    this.augmentAuthUrl(authUrl, callbackUrl);

    try {
      const { code } = await callbackServer.waitForCallback();

      // Exchange code for tokens
      const tokenBody = this.buildTokenExchangeBody(code, callbackUrl);

      const tokenResponse = await globalThis.fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(tokenBody),
      });

      const tokenData = await tokenResponse.json() as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
      };

      if (tokenData.error || !tokenData.access_token) {
        return {
          success: false,
          error: {
            code: 'TOKEN_ERROR',
            message: tokenData.error_description ?? tokenData.error ?? 'Token exchange failed',
          },
        };
      }

      // Get user info
      const userInfo = await this.getUserInfo(tokenData.access_token);

      this.tokenManager.storeTokens({
        provider: this.config.providerKey,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? '',
        expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
        scopes: this.config.scopes,
        userEmail: userInfo.email,
      });

      return {
        success: true,
        data: {
          provider: this.config.providerKey,
          userEmail: userInfo.email,
          displayName: userInfo.displayName,
        },
      };
    } catch (err) {
      callbackServer.stop();
      return {
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /** Check current authentication status. */
  handleAuthStatus(): AdapterResult {
    const hasTokens = this.tokenManager.hasValidTokens(this.config.providerKey);
    const email = this.tokenManager.getUserEmail(this.config.providerKey);
    return {
      success: true,
      data: { authenticated: hasTokens, userEmail: email },
    };
  }

  /** Disconnect: revoke token (best-effort) and clear stored tokens. */
  async performDisconnect(): Promise<AdapterResult> {
    if (this.config.revokeUrl) {
      const accessToken = this.tokenManager.getAccessToken(this.config.providerKey);
      if (accessToken) {
        try {
          await globalThis.fetch(`${this.config.revokeUrl}?token=${accessToken}`, {
            method: 'POST',
          });
        } catch {
          // Revocation is best-effort
        }
      }
    }
    this.tokenManager.revokeTokens(this.config.providerKey);
    return { success: true, data: { disconnected: true } };
  }

  /**
   * Get a valid access token, refreshing if expired.
   * Throws if not authenticated.
   */
  async getValidAccessToken(): Promise<string> {
    if (!this.tokenManager.isTokenExpired(this.config.providerKey)) {
      const token = this.tokenManager.getAccessToken(this.config.providerKey);
      if (token) return token;
    }

    const refreshToken = this.tokenManager.getRefreshToken(this.config.providerKey);
    if (!refreshToken) {
      throw new Error(`Not authenticated with ${this.config.providerKey}`);
    }

    const body: Record<string, string> = {
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      grant_type: 'refresh_token',
    };

    if (this.config.clientSecret && !this.config.usePKCE) {
      body['client_secret'] = this.config.clientSecret;
    }

    const response = await globalThis.fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });

    const data = await response.json() as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };

    this.tokenManager.refreshAccessToken(
      this.config.providerKey,
      data.access_token,
      Date.now() + data.expires_in * 1000,
      data.refresh_token,
    );

    return data.access_token;
  }

  /**
   * Extension point for subclasses to add params to the auth URL (e.g. PKCE).
   * Default is a no-op.
   */
  protected augmentAuthUrl(_authUrl: URL, _callbackUrl: string): void {
    // Subclasses override this
  }

  /**
   * Build the body for the token exchange POST.
   * Override in BasePKCEAdapter to include code_verifier.
   */
  protected buildTokenExchangeBody(code: string, callbackUrl: string): Record<string, string> {
    const body: Record<string, string> = {
      code,
      client_id: this.config.clientId,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code',
    };

    if (this.config.clientSecret && !this.config.usePKCE) {
      body['client_secret'] = this.config.clientSecret;
    }

    return body;
  }
}
