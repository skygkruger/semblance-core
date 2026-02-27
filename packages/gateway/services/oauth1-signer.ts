/**
 * OAuth 1.0a Signature Utility — HMAC-SHA1 signature generation for OAuth 1.0a.
 *
 * Used by Garmin Connect and Instapaper adapters. OAuth 1.0a is older and more verbose
 * than OAuth 2.0/PKCE but fully implementable and required by these services.
 *
 * Implements:
 *   - Nonce generation (random hex string)
 *   - Percent-encoding per RFC 5849
 *   - Signature base string construction
 *   - HMAC-SHA1 signing
 *   - Authorization header construction
 */

import { createHmac, randomBytes } from 'node:crypto';

export interface OAuth1Credentials {
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
}

export interface OAuth1Params {
  method: string;
  url: string;
  /** Extra query/body params to include in signature base string. */
  extraParams?: Record<string, string>;
}

/**
 * Percent-encode a string per RFC 5849 Section 3.6.
 * More strict than encodeURIComponent: also encodes !, *, (, ), '.
 */
export function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/!/g, '%21')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

/** Generate a random nonce (32-char hex string). */
export function generateNonce(): string {
  return randomBytes(16).toString('hex');
}

/** Get current Unix timestamp in seconds. */
export function getTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

/**
 * Build the OAuth 1.0a signature base string.
 * Per RFC 5849 Section 3.4.1.
 */
export function buildSignatureBaseString(
  method: string,
  baseUrl: string,
  params: Record<string, string>,
): string {
  // Sort params alphabetically by key, then by value
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys
    .map(key => `${percentEncode(key)}=${percentEncode(params[key]!)}`)
    .join('&');

  return [
    method.toUpperCase(),
    percentEncode(baseUrl),
    percentEncode(paramString),
  ].join('&');
}

/**
 * Generate the HMAC-SHA1 signature.
 * Per RFC 5849 Section 3.4.2.
 */
export function signHmacSha1(
  baseString: string,
  consumerSecret: string,
  tokenSecret: string = '',
): string {
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');
}

/**
 * Generate a complete OAuth 1.0a Authorization header value.
 */
export function generateOAuth1Header(
  credentials: OAuth1Credentials,
  params: OAuth1Params,
): string {
  const nonce = generateNonce();
  const timestamp = getTimestamp();

  // Base OAuth params
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_version: '1.0',
  };

  if (credentials.token) {
    oauthParams['oauth_token'] = credentials.token;
  }

  // Combine OAuth params with extra params for signature
  const allParams: Record<string, string> = {
    ...oauthParams,
    ...params.extraParams,
  };

  // Strip query params from URL and add them to allParams
  const urlObj = new URL(params.url);
  const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  for (const [key, value] of urlObj.searchParams) {
    allParams[key] = value;
  }

  // Generate signature
  const baseString = buildSignatureBaseString(params.method, baseUrl, allParams);
  const signature = signHmacSha1(
    baseString,
    credentials.consumerSecret,
    credentials.tokenSecret ?? '',
  );

  oauthParams['oauth_signature'] = signature;

  // Build Authorization header
  const headerParts = Object.keys(oauthParams)
    .sort()
    .map(key => `${percentEncode(key)}="${percentEncode(oauthParams[key]!)}"`)
    .join(', ');

  return `OAuth ${headerParts}`;
}
