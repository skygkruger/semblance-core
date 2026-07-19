import type { KeyStore } from './key-store.js';
import { createFileKeyStore } from './file-key-store.js';

/**
 * Injectable backend for OS-backed secret storage.
 *
 * Desktop Host wires this to Tauri `secure_storage_*` commands backed by Rust
 * keyring (macOS Keychain / Windows Credential Manager / Linux Secret Service).
 * Tests inject an in-memory implementation.
 */
export interface SecureStorageBackend {
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
}

export interface OsKeyStoreConfig {
  /** Production or test backend. Required unless file fallback is explicitly allowed. */
  backend?: SecureStorageBackend;
  /** Allow ~/.semblance/kernel-keystore.json fallback (headless/CI only). */
  allowFileFallback?: boolean;
  /** Override file keystore path when fallback is enabled. */
  fileStorePath?: string;
}

function isFileFallbackAllowed(config: OsKeyStoreConfig): boolean {
  return config.allowFileFallback === true || process.env.SEMBLANCE_ALLOW_FILE_KEYSTORE === '1';
}

function wrapBackend(backend: SecureStorageBackend): KeyStore {
  return {
    async get(key: string): Promise<string | null> {
      return backend.getSecret(key);
    },
    async set(key: string, value: string): Promise<void> {
      await backend.setSecret(key, value);
    },
    async delete(key: string): Promise<void> {
      await backend.deleteSecret(key);
    },
  };
}

/**
 * Create a kernel KeyStore backed by OS secure storage.
 *
 * - With `backend`: uses the injected SecureStorageBackend (desktop Host / tests).
 * - With explicit allowlist: falls back to file storage for headless/CI.
 * - Otherwise: throws — plaintext file storage is never implicit.
 */
export function createOsKeyStore(config: OsKeyStoreConfig = {}): KeyStore {
  if (config.backend) {
    return wrapBackend(config.backend);
  }

  if (isFileFallbackAllowed(config)) {
    return createFileKeyStore(config.fileStorePath);
  }

  throw new Error(
    'OS-backed KeyStore requires a SecureStorageBackend. '
    + 'Inject the Tauri/Rust bridge in desktop Host, or set SEMBLANCE_ALLOW_FILE_KEYSTORE=1 '
    + 'for explicit headless/test file fallback.',
  );
}

/** Returns true when file fallback would be selected without a backend. */
export function isFileKeyStoreFallbackAllowed(config: OsKeyStoreConfig = {}): boolean {
  return isFileFallbackAllowed(config);
}

export type TauriInvoke = (cmd: string, args: Record<string, unknown>) => Promise<unknown>;

/**
 * Adapter from Tauri invoke() to SecureStorageBackend.
 * Desktop Host should pass `invoke` from `@tauri-apps/api/core`.
 */
export function createTauriSecureStorageBackend(invoke: TauriInvoke): SecureStorageBackend {
  return {
    async getSecret(key: string): Promise<string | null> {
      const value = await invoke('secure_storage_get', { key });
      return typeof value === 'string' ? value : null;
    },
    async setSecret(key: string, value: string): Promise<void> {
      await invoke('secure_storage_set', { key, value });
    },
    async deleteSecret(key: string): Promise<void> {
      await invoke('secure_storage_delete', { key });
    },
  };
}

/** In-memory SecureStorageBackend for unit tests. */
export function createMemorySecureStorageBackend(
  initial: Record<string, string> = {},
): SecureStorageBackend {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    async getSecret(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async setSecret(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async deleteSecret(key: string): Promise<void> {
      store.delete(key);
    },
  };
}
