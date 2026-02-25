// TLS Configuration — Enforces TLS 1.3 minimum for all outbound connections.
// Used by Gateway service adapters (IMAP, SMTP, CalDAV, API calls).

import type { Agent as HttpsAgent } from 'node:https';

/**
 * Minimum TLS version for all outbound connections.
 */
export const MIN_TLS_VERSION = 'TLSv1.3' as const;

/**
 * Get TLS options to apply to any outbound connection.
 */
export function getTlsOptions(): { minVersion: typeof MIN_TLS_VERSION } {
  return { minVersion: MIN_TLS_VERSION };
}

/**
 * Secure ciphers for TLS 1.3.
 * These are the AEAD ciphers recommended by NIST and IETF.
 */
export const SECURE_CIPHERS = [
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'TLS_AES_128_GCM_SHA256',
].join(':');

export interface SecureAgentOptions {
  /** Optional certificate pin verification callback */
  checkServerIdentity?: (hostname: string, cert: { fingerprint256: string }) => Error | undefined;
}

/**
 * Create an HTTPS agent configuration object with TLS 1.3 enforcement.
 * Returns plain options — actual https.Agent instantiation is left to the caller
 * (avoids importing node:https in unit-testable code).
 */
export function createSecureAgentOptions(opts?: SecureAgentOptions): {
  minVersion: string;
  ciphers: string;
  rejectUnauthorized: boolean;
  checkServerIdentity?: (hostname: string, cert: { fingerprint256: string }) => Error | undefined;
} {
  return {
    minVersion: MIN_TLS_VERSION,
    ciphers: SECURE_CIPHERS,
    rejectUnauthorized: true,
    ...(opts?.checkServerIdentity ? { checkServerIdentity: opts.checkServerIdentity } : {}),
  };
}
