// Key Storage — OS keychain abstraction for credential encryption key.
//
// SECURITY: The encryption key must NOT be stored as a plain file on disk.
// On desktop, Tauri secure storage (stronghold) provides OS-level protection.
// A file-based fallback exists for headless/CI environments only.
//
// Migration: On first launch post-upgrade, reads existing ~/.semblance/credential.key,
// stores it in the keychain, and securely deletes the file.

import { randomBytes } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  chmodSync,
  unlinkSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const KEY_BYTES = 32;
const KEYCHAIN_SERVICE = 'com.veridian.semblance';
const KEYCHAIN_ACCOUNT = 'credential-encryption-key';

// ─── Interface ──────────────────────────────────────────────────────────────

export interface KeyStorage {
  /** Retrieve the encryption key. Creates one if it doesn't exist. */
  getKey(): Promise<Buffer>;
  /** Store an encryption key. */
  setKey(key: Buffer): Promise<void>;
  /** Delete the stored encryption key (for credential disconnect/reset). */
  deleteKey(): Promise<void>;
}

// ─── Tauri Keychain Storage ────────────────────────────────────────────────

/**
 * KeychainKeyStorage — Uses Tauri secure storage (stronghold plugin)
 * for OS-level key protection. Primary storage method.
 *
 * On macOS: Keychain
 * On Windows: Windows Credential Manager (DPAPI)
 * On Linux: Secret Service API (GNOME Keyring / KWallet)
 *
 * The Tauri invoke() calls must be provided by the desktop app context.
 */
export class KeychainKeyStorage implements KeyStorage {
  private invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown>;

  constructor(tauriInvoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown>) {
    this.invoke = tauriInvoke;
  }

  async getKey(): Promise<Buffer> {
    try {
      const stored = await this.invoke('plugin:stronghold|get_record', {
        service: KEYCHAIN_SERVICE,
        account: KEYCHAIN_ACCOUNT,
      }) as string | null;

      if (stored) {
        return Buffer.from(stored, 'base64');
      }
    } catch {
      // Key doesn't exist yet — will generate below
    }

    // Generate and store a new key
    const key = randomBytes(KEY_BYTES);
    await this.setKey(key);
    return key;
  }

  async setKey(key: Buffer): Promise<void> {
    await this.invoke('plugin:stronghold|set_record', {
      service: KEYCHAIN_SERVICE,
      account: KEYCHAIN_ACCOUNT,
      value: key.toString('base64'),
    });
  }

  async deleteKey(): Promise<void> {
    try {
      await this.invoke('plugin:stronghold|delete_record', {
        service: KEYCHAIN_SERVICE,
        account: KEYCHAIN_ACCOUNT,
      });
    } catch {
      // Key might not exist — that's fine
    }
  }
}

// ─── File-Based Storage (Fallback) ─────────────────────────────────────────

/**
 * FileKeyStorage — Stores key in a file with restricted permissions.
 * ONLY for headless/CI environments where Tauri is not available.
 *
 * SECURITY WARNING: On Windows, chmod(0o600) is a no-op.
 * This fallback is NOT recommended for production desktop use.
 */
export class FileKeyStorage implements KeyStorage {
  private path: string;

  constructor(keyPath?: string) {
    this.path = keyPath ?? join(homedir(), '.semblance', 'credential.key');
  }

  async getKey(): Promise<Buffer> {
    if (existsSync(this.path)) {
      return readFileSync(this.path);
    }

    const key = randomBytes(KEY_BYTES);
    await this.setKey(key);
    return key;
  }

  async setKey(key: Buffer): Promise<void> {
    const dir = dirname(this.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(this.path, key);
    try {
      chmodSync(this.path, 0o600);
    } catch {
      // Windows fallback — not ideal
    }
  }

  async deleteKey(): Promise<void> {
    if (existsSync(this.path)) {
      // Secure delete: overwrite with random bytes before unlinking
      try {
        writeFileSync(this.path, randomBytes(KEY_BYTES));
        unlinkSync(this.path);
      } catch {
        // Best-effort deletion
        try { unlinkSync(this.path); } catch { /* ignore */ }
      }
    }
  }
}

// ─── Migration ──────────────────────────────────────────────────────────────

/**
 * Migrate from legacy file-based key to OS keychain.
 *
 * 1. Read existing ~/.semblance/credential.key
 * 2. Store in keychain via KeychainKeyStorage
 * 3. Securely delete the file (overwrite with random, then unlink)
 *
 * Returns true if migration occurred, false if no legacy file found.
 */
export async function migrateKeyToKeychain(
  keychainStorage: KeychainKeyStorage,
  legacyKeyPath?: string,
): Promise<boolean> {
  const path = legacyKeyPath ?? join(homedir(), '.semblance', 'credential.key');

  if (!existsSync(path)) {
    return false;
  }

  // Read legacy key
  const key = readFileSync(path);

  // Store in keychain
  await keychainStorage.setKey(key);

  // Secure delete: overwrite with random data, then unlink
  try {
    writeFileSync(path, randomBytes(key.length));
    unlinkSync(path);
  } catch {
    // Best-effort — the key is now in the keychain regardless
    try { unlinkSync(path); } catch { /* ignore */ }
  }

  return true;
}
