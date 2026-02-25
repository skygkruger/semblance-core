// Key Derivation — Argon2id (production) and SHA-256 (legacy) key derivation.
// Uses hash-wasm for Argon2id — WASM, zero deps, no network calls.
// CRITICAL: No networking imports.

import { argon2id } from 'hash-wasm';
import { getPlatform } from '../platform/index.js';
import type { KeyDerivationResult } from './types.js';

// Argon2id parameters — OWASP recommended minimum for key derivation
const ARGON2_MEMORY_COST = 65536; // 64 MB
const ARGON2_TIME_COST = 3;       // 3 iterations
const ARGON2_PARALLELISM = 1;     // 1 thread (WASM single-threaded)
const ARGON2_HASH_LENGTH = 32;    // 32 bytes = 256 bits
const SALT_LENGTH = 16;           // 16 bytes = 128 bits

/**
 * Derive a 32-byte key from a passphrase using Argon2id.
 * Auto-generates a 16-byte salt if not provided.
 */
export async function deriveKey(
  passphrase: string,
  salt?: Buffer,
): Promise<KeyDerivationResult> {
  const actualSalt = salt ?? generateSalt();
  const saltHex = actualSalt.toString('hex');

  const keyHex = await argon2id({
    password: passphrase,
    salt: actualSalt,
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_TIME_COST,
    memorySize: ARGON2_MEMORY_COST,
    hashLength: ARGON2_HASH_LENGTH,
    outputType: 'hex',
  });

  return {
    keyHex,
    saltHex,
    algorithm: 'argon2id',
  };
}

/**
 * Legacy key derivation: SHA-256(passphrase) -> 64-char hex string.
 * Used for reading v1 archives. Do NOT use for new encryption.
 */
export function deriveKeyLegacy(passphrase: string): string {
  return getPlatform().crypto.sha256(passphrase);
}

/**
 * Generate a cryptographically random 16-byte salt.
 */
export function generateSalt(): Buffer {
  return getPlatform().crypto.randomBytes(SALT_LENGTH);
}
