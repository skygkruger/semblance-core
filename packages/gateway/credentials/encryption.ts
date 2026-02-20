// Credential Encryption — AES-256-GCM encryption for passwords at rest.
//
// AUTONOMOUS DECISION: Local key file at ~/.semblance/credential.key
// Reasoning: OS keychain integration (tauri-plugin-stronghold) requires Rust-side
// changes and is complex to wire through the Node.js sidecar. The local key file
// approach (256-bit random key, 0600 permissions on Unix, stored in the user's
// .semblance directory) provides strong encryption at rest. This is the same pattern
// used by the Gateway's signing key. OS-level keychain integration is documented as
// a Sprint 4 improvement (OS-level sandboxing step).
// Escalation check: Build prompt explicitly authorizes this decision.

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;      // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Get or create the credential encryption key.
 * The key is a 256-bit random value stored at ~/.semblance/credential.key.
 */
export function getEncryptionKey(keyPath?: string): Buffer {
  const path = keyPath ?? join(homedir(), '.semblance', 'credential.key');

  if (existsSync(path)) {
    return readFileSync(path);
  }

  // Generate a new key
  const key = randomBytes(32);

  // Ensure directory exists
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(path, key);

  // Set restrictive permissions on Unix-like systems
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows doesn't support chmod — file permissions are handled differently
  }

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
