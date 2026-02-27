/**
 * OAuth Configuration — Shared interface for all OAuth-based connectors.
 *
 * Each connector provides a static OAuthConfig describing its OAuth provider.
 * BaseOAuthAdapter and BasePKCEAdapter consume this to drive auth flows.
 */

export interface OAuthConfig {
  /** Unique provider key used in OAuthTokenManager (e.g. 'spotify', 'github'). */
  providerKey: string;
  /** OAuth authorization URL. */
  authUrl: string;
  /** OAuth token exchange URL. */
  tokenUrl: string;
  /** Requested scopes (space-separated). */
  scopes: string;
  /** Whether this provider uses PKCE (S256). If true, client_secret is omitted. */
  usePKCE: boolean;
  /** Client ID — loaded from environment variable. */
  clientId: string;
  /** Client Secret — loaded from environment variable. Not used for PKCE flows. */
  clientSecret?: string;
  /** Optional: URL to revoke tokens. */
  revokeUrl?: string;
  /** Optional: extra auth URL params (e.g. access_type=offline). */
  extraAuthParams?: Record<string, string>;
}
