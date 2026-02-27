// Credential Encryption — AES-256-GCM encryption for passwords at rest.
//
// The encryption key is stored via KeyStorage:
// - Desktop: OS keychain (Tauri secure storage / stronghold)
// - Headless/CI: File-based fallback with 0600 permissions
//
// SECURITY: The key MUST be stored in the OS keychain on desktop.
// The file-based fallback is for headless environments only.

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import type { KeyStorage } from './key-storage.js';
import { FileKeyStorage } from './key-storage.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;      // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

// Cached key for synchronous access after async initialization
let cachedKey: Buffer | null = null;
let activeKeyStorage: KeyStorage | null = null;

/**
 * Initialize encryption with a KeyStorage backend.
 * Must be called once at app startup before any encrypt/decrypt operations.
 */
export async function initEncryption(storage: KeyStorage): Promise<Buffer> {
  activeKeyStorage = storage;
  cachedKey = await storage.getKey();
  return cachedKey;
}

/**
 * Get the encryption key synchronously.
 * Requires initEncryption() to have been called first.
 *
 * Falls back to FileKeyStorage if not initialized (for backward compatibility
 * during migration). This fallback will be removed in a future version.
 */
export function getEncryptionKey(keyPath?: string): Buffer {
  if (cachedKey) return cachedKey;

  // LEGACY FALLBACK: Direct file access when initEncryption hasn't been called.
  // This path is only reached during migration or in headless/CI environments.
  const fileStorage = new FileKeyStorage(keyPath);
  // Synchronous wrapper — FileKeyStorage.getKey() does sync I/O internally
  const key = require('node:fs').existsSync(
    keyPath ?? require('node:path').join(require('node:os').homedir(), '.semblance', 'credential.key')
  )
    ? require('node:fs').readFileSync(
        keyPath ?? require('node:path').join(require('node:os').homedir(), '.semblance', 'credential.key')
      )
    : (() => {
        // Generate synchronously for legacy compat
        const newKey = randomBytes(32);
        const path = keyPath ?? require('node:path').join(require('node:os').homedir(), '.semblance', 'credential.key');
        const dir = require('node:path').dirname(path);
        if (!require('node:fs').existsSync(dir)) {
          require('node:fs').mkdirSync(dir, { recursive: true });
        }
        require('node:fs').writeFileSync(path, newKey);
        try { require('node:fs').chmodSync(path, 0o600); } catch { /* Windows */ }
        return newKey;
      })();

  cachedKey = key;
  return key;
}

/**
 * Encrypt a plaintext password using AES-256-GCM.
 * Returns a base64-encoded string containing: IV + auth tag + ciphertext.
 */
export function encryptPassword(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: IV (12) + authTag (16) + ciphertext (variable)
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt an encrypted password using AES-256-GCM.
 * Input is a base64-encoded string containing: IV + auth tag + ciphertext.
 */
export function decryptPassword(key: Buffer, encrypted: string): string {
  const packed = Buffer.from(encrypted, 'base64');

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Invalid encrypted data: too short');
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf-8');
}
