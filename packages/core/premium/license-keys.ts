/**
 * License Key Signature Verification — Ed25519 offline validation.
 *
 * License key format: sem_<header>.<payload>.<signature>
 *   header   = base64url({ alg: 'EdDSA', typ: 'LIC' })
 *   payload  = base64url({ tier, exp, sub, seat? })
 *   signature = base64url(ed25519_sign(private_key, header + '.' + payload))
 *
 * This module verifies that a license key was signed by the Semblance license
 * signing key. It does NOT handle storage or activation — that's PremiumGate's job.
 *
 * This keypair is SEPARATE from the founding token keypair in founding-token.ts.
 * Founding tokens are JWTs with EdDSA/JWT semantics.
 * License keys use the sem_ prefix format with LIC type header.
 */

import { createPublicKey, verify } from 'node:crypto';

// ─── Embedded Public Key ──────────────────────────────────────────────────

// TEST KEY — used when NODE_ENV === 'test' so fixture keys verify correctly.
// Generated with: npx tsx scripts/generate-license-keypair.ts
const TEST_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEATestLicenseKeyPublicForUnitTestsOnly00=
-----END PUBLIC KEY-----`;

// PRODUCTION KEY — the corresponding private key is held by the Cloudflare license Worker.
// Generated 2026-02-26 via scripts/generate-license-keypair.ts
const PRODUCTION_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAjZLwfE5cpkjYZF0kVoOvR3FzySjU1NNOezrQSgtimkU=
-----END PUBLIC KEY-----`;

// Exported for testing — allows tests to inject their own keypair
export let LICENSE_PUBLIC_KEY_PEM =
  process.env.NODE_ENV === 'test' ? TEST_PUBLIC_KEY_PEM : PRODUCTION_PUBLIC_KEY_PEM;

/**
 * Override the public key used for verification. Test-only.
 * In production, the embedded key is used.
 * Throws if called outside test environment to prevent key injection attacks.
 */
export function setLicensePublicKey(pem: string): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setLicensePublicKey is test-only and cannot be used in production');
  }
  LICENSE_PUBLIC_KEY_PEM = pem;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function base64urlDecode(str: string): Buffer {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding === 2) base64 += '==';
  else if (padding === 3) base64 += '=';
  return Buffer.from(base64, 'base64');
}

// ─── Verification ─────────────────────────────────────────────────────────

export interface LicenseKeyVerification {
  valid: boolean;
  error?: string;
}

export interface PaidLicensePayload {
  tier: 'founding' | 'digital-representative' | 'lifetime';
  sub: string;
  exp: string | null;
  seat: number | null;
}

export interface PaidLicenseValidation extends LicenseKeyVerification {
  payload?: PaidLicensePayload;
}

/**
 * Verify that a sem_ license key has a valid Ed25519 signature.
 *
 * Validates:
 * - Key starts with 'sem_'
 * - 3 dot-separated segments (header.payload.signature)
 * - Header decodes and has alg: 'EdDSA', typ: 'LIC'
 * - Ed25519 signature is valid against the embedded public key
 *
 * Does NOT validate payload contents (tier, expiry) — that's PremiumGate's job.
 * Returns structured result, never throws.
 */
export function verifyLicenseKeySignature(key: string): LicenseKeyVerification {
  if (!key.startsWith('sem_')) {
    return { valid: false, error: 'Invalid key: must start with sem_' };
  }

  const withoutPrefix = key.slice(4);
  const segments = withoutPrefix.split('.');

  if (segments.length !== 3) {
    return { valid: false, error: 'Invalid key: expected 3 dot-separated segments' };
  }

  const [headerB64, payloadB64, signatureB64] = segments as [string, string, string];

  // Decode and validate header
  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(base64urlDecode(headerB64).toString('utf-8'));
  } catch {
    return { valid: false, error: 'Invalid key: could not decode header' };
  }

  if (header.alg !== 'EdDSA') {
    return { valid: false, error: `Invalid key: unsupported algorithm '${header.alg}'` };
  }

  if (header.typ !== 'LIC') {
    return { valid: false, error: `Invalid key: expected type 'LIC', got '${header.typ}'` };
  }

  // Verify Ed25519 signature
  try {
    const publicKey = createPublicKey(LICENSE_PUBLIC_KEY_PEM);
    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature = base64urlDecode(signatureB64);

    const isValid = verify(null, signingInput, publicKey, signature);
    if (!isValid) {
      return { valid: false, error: 'Invalid key: signature verification failed' };
    }
  } catch {
    return { valid: false, error: 'Invalid key: signature verification failed' };
  }

  return { valid: true };
}

/**
 * Verify and parse a complete paid entitlement.
 *
 * A valid signature alone is not an entitlement: all tiers require a non-empty
 * subject, subscriptions require a future canonical ISO timestamp, founding
 * keys require a positive integer seat, and non-applicable fields are rejected.
 */
export function validatePaidLicenseKey(
  key: string,
  nowMs = Date.now(),
): PaidLicenseValidation {
  const signature = verifyLicenseKeySignature(key);
  if (!signature.valid) return signature;

  let value: unknown;
  try {
    const payloadSegment = key.slice(4).split('.')[1];
    if (!payloadSegment) {
      return { valid: false, error: 'Invalid key: missing payload' };
    }
    value = JSON.parse(base64urlDecode(payloadSegment).toString('utf8'));
  } catch {
    return { valid: false, error: 'Invalid key: could not decode payload' };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, error: 'Invalid key: payload must be an object' };
  }
  const payload = value as Record<string, unknown>;
  const tier = payload.tier;
  if (
    tier !== 'founding'
    && tier !== 'digital-representative'
    && tier !== 'lifetime'
  ) {
    return { valid: false, error: `Invalid license tier: ${String(tier)}` };
  }
  if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
    return { valid: false, error: 'Invalid key: subject is required' };
  }

  if (tier === 'digital-representative') {
    if (typeof payload.exp !== 'string') {
      return { valid: false, error: 'Invalid key: subscription expiration is required' };
    }
    const expirationMs = Date.parse(payload.exp);
    if (!Number.isFinite(expirationMs) || new Date(expirationMs).toISOString() !== payload.exp) {
      return { valid: false, error: 'Invalid expiration date in license key' };
    }
    if (expirationMs <= nowMs) {
      return { valid: false, error: 'License key has expired' };
    }
    if (payload.seat !== undefined) {
      return { valid: false, error: 'Invalid key: subscription keys cannot contain a seat' };
    }
    return {
      valid: true,
      payload: { tier, sub: payload.sub, exp: payload.exp, seat: null },
    };
  }

  if (payload.exp !== undefined) {
    return { valid: false, error: `Invalid key: ${tier} keys cannot expire` };
  }
  if (tier === 'founding') {
    if (!Number.isSafeInteger(payload.seat) || (payload.seat as number) <= 0) {
      return { valid: false, error: 'Invalid key: founding seat must be a positive integer' };
    }
    return {
      valid: true,
      payload: { tier, sub: payload.sub, exp: null, seat: payload.seat as number },
    };
  }
  if (payload.seat !== undefined) {
    return { valid: false, error: 'Invalid key: lifetime keys cannot contain a seat' };
  }
  return {
    valid: true,
    payload: { tier, sub: payload.sub, exp: null, seat: null },
  };
}
