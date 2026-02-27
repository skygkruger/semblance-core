/**
 * Generate Ed25519 keypair for Semblance license key signing.
 *
 * Usage: npx tsx scripts/generate-license-keypair.ts
 *
 * Output:
 * - PEM public key  → embed in PremiumGate (packages/core/premium/license-keys.ts)
 * - PEM private key → deploy to Cloudflare Worker as secret (LICENSE_SIGNING_KEY)
 * - Base64 raw keys → for Worker KV or alternative storage
 *
 * IMPORTANT: The private key must NEVER be committed to the repository.
 * This script is run once, the public key is embedded in code, and the
 * private key is securely stored in the Worker's environment variables.
 *
 * This keypair is SEPARATE from the founding token keypair in founding-token.ts.
 * Founding tokens are JWTs with EdDSA algorithm.
 * License keys use the sem_ format with raw Ed25519 signature over header.payload.
 */

import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');

const publicPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

const publicRaw = publicKey.export({ type: 'spki', format: 'der' });
const privateRaw = privateKey.export({ type: 'pkcs8', format: 'der' });

console.log('=== Ed25519 License Signing Keypair ===\n');

console.log('--- PUBLIC KEY (PEM) --- embed in license-keys.ts ---');
console.log(publicPem);

console.log('--- PRIVATE KEY (PEM) --- deploy to Worker as LICENSE_SIGNING_KEY ---');
console.log(privatePem);

console.log('--- PUBLIC KEY (Base64 DER) ---');
console.log(publicRaw.toString('base64'));
console.log();

console.log('--- PRIVATE KEY (Base64 DER) ---');
console.log(privateRaw.toString('base64'));
console.log();

console.log('REMINDER: Do NOT commit the private key. Store it in:');
console.log('  - Cloudflare Worker secret: LICENSE_SIGNING_KEY');
console.log('  - Or secure key management system');
