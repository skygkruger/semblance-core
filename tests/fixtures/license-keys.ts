/**
 * Test fixture keypair and pre-signed license keys for license verification tests.
 *
 * All keys are signed with the test Ed25519 keypair below.
 * The test public key must be injected via setLicensePublicKey() before running tests.
 *
 * NEVER use this private key in production.
 */

import { createPrivateKey, createPublicKey, sign, generateKeyPairSync } from 'node:crypto';

// Generate a fresh test keypair for license key tests.
// This is separate from the founding token test keypair.
const { publicKey: testPublicKeyObj, privateKey: testPrivateKeyObj } = generateKeyPairSync('ed25519');

export const LICENSE_TEST_PUBLIC_KEY_PEM = testPublicKeyObj.export({ type: 'spki', format: 'pem' }) as string;
export const LICENSE_TEST_PRIVATE_KEY_PEM = testPrivateKeyObj.export({ type: 'pkcs8', format: 'pem' }) as string;

// ─── Helpers ──────────────────────────────────────────────────────────────

function base64urlEncode(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Generate a signed license key for testing.
 */
export function generateTestLicenseKey(opts: {
  tier: string;
  exp?: string;
  sub?: string;
  seat?: number;
  privateKeyPem?: string;
}): string {
  const header = base64urlEncode(JSON.stringify({ alg: 'EdDSA', typ: 'LIC' }));

  const payloadObj: Record<string, unknown> = { tier: opts.tier };
  if (opts.exp) payloadObj.exp = opts.exp;
  if (opts.sub) payloadObj.sub = opts.sub;
  if (opts.seat !== undefined) payloadObj.seat = opts.seat;

  const payload = base64urlEncode(JSON.stringify(payloadObj));
  const signingInput = Buffer.from(`${header}.${payload}`);

  const privateKey = createPrivateKey(opts.privateKeyPem ?? LICENSE_TEST_PRIVATE_KEY_PEM);
  const signature = sign(null, signingInput, privateKey);

  return `sem_${header}.${payload}.${base64urlEncode(signature)}`;
}

// ─── Pre-signed test keys ─────────────────────────────────────────────────

/** Valid digital-representative key, expires 1 year from fixture generation */
export function validDRKey(): string {
  const exp = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  return generateTestLicenseKey({ tier: 'digital-representative', exp, sub: 'test-user-hash' });
}

/** Valid lifetime key (no expiration) */
export function validLifetimeKey(): string {
  return generateTestLicenseKey({ tier: 'lifetime', sub: 'test-user-hash' });
}

/** Expired key */
export function expiredKey(): string {
  const exp = new Date(Date.now() - 86400000).toISOString();
  return generateTestLicenseKey({ tier: 'digital-representative', exp, sub: 'test-user-hash' });
}

/** Key with tampered payload (signature won't match) */
export function tamperedKey(): string {
  const key = validDRKey();
  // Tamper the payload segment (change last character)
  const parts = key.slice(4).split('.');
  const tampered = parts[1]!.slice(0, -1) + (parts[1]!.endsWith('A') ? 'B' : 'A');
  return `sem_${parts[0]}.${tampered}.${parts[2]}`;
}
