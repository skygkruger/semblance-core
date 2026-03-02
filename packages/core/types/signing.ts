// Action Signing — Pure cryptographic functions
// CRITICAL: No networking imports. Uses PlatformAdapter for crypto.
// These functions live in core/types/ so both Core and Gateway can use them.
// Gateway auto-detects Node.js → desktop adapter → node:crypto under the hood.

import { getPlatform } from '../platform/index.js';

/**
 * Compute SHA-256 hash of arbitrary data.
 */
export function sha256(data: string): string {
  return getPlatform().crypto.sha256(data);
}

/**
 * Construct the signing payload from request fields.
 * Format: "${id}|${timestamp}|${action}|${sha256(payload)}"
 */
export function buildSigningPayload(
  id: string,
  timestamp: string,
  action: string,
  payload: Record<string, unknown>,
): string {
  const payloadHash = sha256(JSON.stringify(payload));
  return `${id}|${timestamp}|${action}|${payloadHash}`;
}

/**
 * Sign a request using HMAC-SHA256.
 * Returns the hex-encoded signature.
 */
export function signRequest(
  key: Buffer,
  id: string,
  timestamp: string,
  action: string,
  payload: Record<string, unknown>,
): string {
  const signingPayload = buildSigningPayload(id, timestamp, action, payload);
  return getPlatform().crypto.hmacSha256(key, signingPayload);
}

/**
 * Verify a request signature against the expected HMAC-SHA256.
 * Returns true if the signature is valid.
 */
export function verifySignature(
  key: Buffer,
  signature: string,
  id: string,
  timestamp: string,
  action: string,
  payload: Record<string, unknown>,
): boolean {
  const expected = signRequest(key, id, timestamp, action, payload);
  // SECURITY: Use platform-provided constant-time comparison (delegates to
  // OpenSSL's CRYPTO_memcmp on Node.js) instead of hand-rolled JS loop
  // which V8 JIT may optimize into a timing-variable comparison.
  const sigBuf = Buffer.from(signature, 'utf-8');
  const expBuf = Buffer.from(expected, 'utf-8');
  if (sigBuf.length !== expBuf.length) return false;
  return getPlatform().crypto.timingSafeEqual(sigBuf, expBuf);
}
