/**
 * BasePKCEAdapter — Extends BaseOAuthAdapter with PKCE (S256) support.
 *
 * PKCE (Proof Key for Code Exchange) is required by modern OAuth providers
 * like Spotify, GitHub, Fitbit, and Whoop. It eliminates the need for a
 * client_secret in the token exchange.
 *
 * Generates a cryptographically random code_verifier, derives the
 * code_challenge via SHA-256 + base64url, and injects both into the
 * auth URL and token exchange body.
 */

import { randomBytes, createHash } from 'node:crypto';
import type { OAuthTokenManager } from './oauth-token-manager.js';
import type { OAuthConfig } from './oauth-config.js';
import { BaseOAuthAdapter } from './base-oauth-adapter.js';

/**
 * Generate a cryptographically random code_verifier (43-128 chars, base64url).
 * Per RFC 7636 Section 4.1.
 */
export function generateCodeVerifier(length: number = 64): string {
  const bytes = randomBytes(length);
  return bytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
    .slice(0, 128);
}

/**
 * Derive the code_challenge from a code_verifier using S256.
 * Per RFC 7636 Section 4.2.
 */
export function deriveCodeChallenge(codeVerifier: string): string {
  return createHash('sha256')
    .update(codeVerifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export abstract class BasePKCEAdapter extends BaseOAuthAdapter {
  private codeVerifier: string | null = null;

  constructor(tokenManager: OAuthTokenManager, config: OAuthConfig) {
    super(tokenManager, { ...config, usePKCE: true });
  }

  /**
   * Augment the auth URL with PKCE params: code_challenge and code_challenge_method.
   */
  protected override augmentAuthUrl(authUrl: URL, _callbackUrl: string): void {
    this.codeVerifier = generateCodeVerifier();
    const challenge = deriveCodeChallenge(this.codeVerifier);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
  }

  /**
   * Build token exchange body with code_verifier instead of client_secret.
   */
  protected override buildTokenExchangeBody(code: string, callbackUrl: string): Record<string, string> {
    const body: Record<string, string> = {
      code,
      client_id: this.config.clientId,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code',
    };

    if (this.codeVerifier) {
      body['code_verifier'] = this.codeVerifier;
    }

    return body;
  }
}
