/**
 * Founding Member JWT Verification — Zero-network token validation.
 *
 * Token format: standard JWT (header.payload.signature) signed with Ed25519.
 * Payload: { sub: string, tier: 'founding', iat: number, seat: number }
 * No expiry field — founding membership is lifetime, never expires.
 *
 * The public key is embedded as a constant. Production key is a one-line swap.
 * Verification uses Node.js crypto.verify() with Ed25519 — no external dependencies.
 */

import { createPublicKey, verify } from 'node:crypto';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FoundingTokenPayload {
  /** SHA-256 hash of the member's email (not raw email) */
  sub: string;
  /** Always 'founding' */
  tier: 'founding';
  /** Issued-at timestamp (Unix seconds) */
  iat: number;
  /** Founding member seat number (1–500) */
  seat: number;
}

export interface FoundingTokenResult {
  valid: boolean;
  payload?: FoundingTokenPayload;
  error?: string;
}

// ─── Embedded Public Keys ───────────────────────────────────────────────────

// TEST KEY — used when NODE_ENV === 'test' so fixture tokens verify correctly.
const TEST_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAAeOrN1OgTzVAT9Y9LtGqnpR8/bYEdayuEMtSi9gqK1c=
-----END PUBLIC KEY-----`;

// PRODUCTION KEY — the corresponding private key is held by the semblance-run backend.
const PRODUCTION_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAjdSpFw84m5aJU+Qa8vXlGFS4IQRZW1s/sAfMbKl4/rI=
-----END PUBLIC KEY-----`;

// Use production key unless running tests (vitest sets NODE_ENV=test automatically)
const FOUNDING_PUBLIC_KEY_PEM =
  process.env.NODE_ENV === 'test' ? TEST_PUBLIC_KEY_PEM : PRODUCTION_PUBLIC_KEY_PEM;

const MAX_FOUNDING_SEAT = 500;

// ─── Helpers ────────────────────────────────────────────────────────────────

function base64urlDecode(str: string): Buffer {
  // Restore standard base64 from base64url encoding
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding === 2) base64 += '==';
  else if (padding === 3) base64 += '=';
  return Buffer.from(base64, 'base64');
}

// ─── Verification ───────────────────────────────────────────────────────────

/**
 * Verify a founding member JWT token offline using the embedded Ed25519 public key.
 *
 * Validates:
 * - JWT structure (3 dot-separated segments)
 * - Ed25519 signature
 * - Header algorithm is EdDSA
 * - Payload tier is 'founding'
 * - Seat number is in range 1–500
 * - Required fields present (sub, tier, iat, seat)
 *
 * Does NOT validate sub against user's email — the token is bearer-style.
 * Does NOT check expiry — founding membership is lifetime.
 *
 * Returns structured result, never throws.
 */
export function verifyFoundingToken(token: string): FoundingTokenResult {
  // Strip deep link URL prefix if pasted as full URL
  let jwt = token.trim();
  const deepLinkPrefix = 'semblance://activate?';
  if (jwt.startsWith(deepLinkPrefix)) {
    try {
      const url = new URL(jwt.replace('semblance://', 'https://'));
      const tokenParam = url.searchParams.get('token');
      if (tokenParam) {
        jwt = tokenParam;
      }
    } catch {
      return { valid: false, error: 'Invalid deep link URL format' };
    }
  }

  // Validate JWT structure: header.payload.signature
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Invalid token format: expected 3 dot-separated segments' };
  }

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  // Decode and validate header
  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(base64urlDecode(headerB64).toString('utf-8'));
  } catch {
    return { valid: false, error: 'Invalid token: could not decode header' };
  }

  if (header.alg !== 'EdDSA') {
    return { valid: false, error: `Invalid token: unsupported algorithm '${header.alg}'` };
  }

  // Verify Ed25519 signature
  try {
    const publicKey = createPublicKey(FOUNDING_PUBLIC_KEY_PEM);
    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature = base64urlDecode(signatureB64);

    const isValid = verify(null, signingInput, publicKey, signature);
    if (!isValid) {
      return { valid: false, error: 'Invalid token: signature verification failed' };
    }
  } catch {
    return { valid: false, error: 'Invalid token: signature verification failed' };
  }

  // Decode payload
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString('utf-8'));
  } catch {
    return { valid: false, error: 'Invalid token: could not decode payload' };
  }

  // Validate required fields
  if (typeof payload.sub !== 'string' || !payload.sub) {
    return { valid: false, error: 'Invalid token: missing or invalid sub field' };
  }

  if (payload.tier !== 'founding') {
    return { valid: false, error: `Invalid token: expected tier 'founding', got '${String(payload.tier)}'` };
  }

  if (typeof payload.iat !== 'number') {
    return { valid: false, error: 'Invalid token: missing or invalid iat field' };
  }

  if (typeof payload.seat !== 'number' || !Number.isInteger(payload.seat)) {
    return { valid: false, error: 'Invalid token: missing or invalid seat field' };
  }

  if (payload.seat < 1 || payload.seat > MAX_FOUNDING_SEAT) {
    return { valid: false, error: `Invalid token: seat number ${payload.seat} out of range (1–${MAX_FOUNDING_SEAT})` };
  }

  return {
    valid: true,
    payload: {
      sub: payload.sub as string,
      tier: 'founding',
      iat: payload.iat as number,
      seat: payload.seat as number,
    },
  };
}
