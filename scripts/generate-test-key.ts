/**
 * Generate a test license key for local development and testing.
 *
 * Usage:
 *   SEMBLANCE_LICENSE_PRIVATE_KEY="$(cat private.pem)" npx tsx scripts/generate-test-key.ts [tier] [days]
 *
 * Arguments:
 *   tier  — 'founding' | 'digital-representative' | 'lifetime' (default: 'founding')
 *   days  — expiration in days from now (default: 365, 0 = no expiration)
 *
 * Environment:
 *   SEMBLANCE_LICENSE_PRIVATE_KEY — PEM-encoded Ed25519 private key (REQUIRED)
 *
 * Output:
 *   The generated sem_ license key, verified against the compiled-in public key.
 *
 * IMPORTANT: The private key is NEVER read from a file or hardcoded.
 *            It must be passed via environment variable only.
 */

import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { verifyLicenseKeySignature, setLicensePublicKey } from '../packages/core/premium/license-keys.js';

// ─── Read Private Key from Environment ────────────────────────────────────

const privateKeyPem = process.env.SEMBLANCE_LICENSE_PRIVATE_KEY;

if (!privateKeyPem) {
  console.error('ERROR: SEMBLANCE_LICENSE_PRIVATE_KEY environment variable is not set.');
  console.error('');
  console.error('Usage:');
  console.error('  SEMBLANCE_LICENSE_PRIVATE_KEY="$(cat private.pem)" npx tsx scripts/generate-test-key.ts [tier] [days]');
  process.exit(1);
}

// ─── Parse Arguments ─────────────────────────────────────────────────────

type LicenseTier = 'founding' | 'digital-representative' | 'lifetime';

const validTiers: LicenseTier[] = ['founding', 'digital-representative', 'lifetime'];
const tierArg = (process.argv[2] ?? 'founding') as LicenseTier;
const daysArg = parseInt(process.argv[3] ?? '365', 10);

if (!validTiers.includes(tierArg)) {
  console.error(`ERROR: Invalid tier '${tierArg}'. Valid tiers: ${validTiers.join(', ')}`);
  process.exit(1);
}

if (isNaN(daysArg) || daysArg < 0) {
  console.error('ERROR: Days must be a non-negative integer.');
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function base64urlEncode(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── Build License Key ──────────────────────────────────────────────────

const header = { alg: 'EdDSA', typ: 'LIC' };
const headerB64 = base64urlEncode(JSON.stringify(header));

const now = Math.floor(Date.now() / 1000);
const payload: Record<string, unknown> = {
  tier: tierArg,
  sub: `test-${Date.now()}`,
  iat: now,
};

if (daysArg > 0) {
  payload.exp = now + (daysArg * 86400);
}

if (tierArg === 'founding') {
  payload.seat = 42; // Test seat number
}

const payloadB64 = base64urlEncode(JSON.stringify(payload));

// Sign with Ed25519
const privateKey = createPrivateKey(privateKeyPem);
const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
const signature = sign(null, signingInput, privateKey);
const signatureB64 = base64urlEncode(signature);

const licenseKey = `sem_${headerB64}.${payloadB64}.${signatureB64}`;

// ─── Self-Validate ──────────────────────────────────────────────────────

// Derive public key from the private key to check if it matches the compiled-in key
const publicFromPrivate = createPublicKey(privateKey);
const publicPem = publicFromPrivate.export({ type: 'spki', format: 'pem' }) as string;

// If running in test mode, inject the derived public key for verification
const isTestMode = process.env.NODE_ENV === 'test';
if (isTestMode) {
  setLicensePublicKey(publicPem);
}

// Verify against the compiled-in public key (or test key if NODE_ENV=test)
const verification = verifyLicenseKeySignature(licenseKey);

// ─── Output ─────────────────────────────────────────────────────────────

console.log('=== Semblance Test License Key ===\n');
console.log(`Tier:    ${tierArg}`);
console.log(`Expires: ${daysArg > 0 ? `${daysArg} days from now` : 'Never'}`);
console.log(`Valid:   ${verification.valid ? 'YES' : `NO — ${verification.error}`}`);
console.log('');
console.log(licenseKey);
console.log('');

if (!verification.valid) {
  console.error('WARNING: Generated key does NOT verify against the compiled-in public key.');
  console.error('This key will work if you set the matching public key in license-keys.ts,');
  console.error('or if the private key corresponds to the production public key.');
  process.exit(2);
}
