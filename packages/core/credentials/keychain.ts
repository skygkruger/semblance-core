// KeychainStore — Interface for storing individual credential values in the OS keychain.
//
// Unlike KeyStorage (which stores the shared encryption KEY), KeychainStore stores
// individual credential VALUES (passwords, tokens) directly in the OS keychain.
// This eliminates the AES-encrypted SQLite intermediate layer for sensitive values.
//
// CRITICAL: This file is in packages/core/. No network imports.

/**
 * KeychainStore — OS keychain interface for storing individual secrets.
 *
 * Each credential value is stored as a separate keychain entry with:
 * - service: namespaced identifier (e.g., "semblance.credential.imap-1")
 * - account: the secret name (e.g., "password", "access_token")
 * - value: the secret data
 *
 * Desktop: Tauri stronghold (macOS Keychain / Windows DPAPI / Linux Secret Service)
 * Mobile: react-native-keychain (iOS Keychain / Android Keystore)
 */
export interface KeychainStore {
  /** Store a secret in the OS keychain. */
  set(service: string, account: string, value: string): Promise<void>;

  /** Retrieve a secret from the OS keychain. Returns null if not found. */
  get(service: string, account: string): Promise<string | null>;

  /** Delete a secret from the OS keychain. */
  delete(service: string, account: string): Promise<void>;

  /** Delete all secrets for a given service prefix. */
  clear(servicePrefix: string): Promise<void>;
}

/**
 * Build a keychain service name for a connector credential.
 * Format: "semblance.credential.{connectorId}"
 */
export function keychainServiceName(connectorId: string): string {
  return `semblance.credential.${connectorId}`;
}

/**
 * Build a keychain service name for an OAuth provider.
 * Format: "semblance.oauth.{provider}"
 */
export function keychainOAuthServiceName(provider: string): string {
  return `semblance.oauth.${provider}`;
}

/** Sentinel value indicating a credential has been migrated to keychain. */
export const MIGRATED_SENTINEL = 'MIGRATED_TO_KEYCHAIN';
