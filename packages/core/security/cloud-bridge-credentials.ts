// Cloud Bridge Credential Store — Manages API keys for cloud AI providers.
//
// Credentials are stored in the OS keychain via the KeychainStore interface.
// This module NEVER handles the actual keychain I/O — it delegates to the
// platform-specific KeychainStore implementation provided at construction.
//
// Credentials are NEVER:
//   - Written to SQLite or LanceDB
//   - Included in knowledge graph exports or Living Will archives
//   - Transmitted to any VERIDIAN SYNTHETICS server
//   - Logged in the Merkle audit trail (only the fact of the call, not the credential)
//   - Accessible to the AI Core process boundary
//
// CRITICAL: This file is in packages/core/security/. ZERO network imports.
// The KeychainStore implementation handles platform-specific keychain access.

import type { KeychainStore } from '../credentials/keychain.js';

const SERVICE_PREFIX = 'semblance.cloud-bridge';

export interface StoredProviderCredential {
  providerId: string;
  apiKey: string;
  baseUrl: string | null;
  storedAt: string;
}

/**
 * CloudBridgeCredentialStore — Manages Cloud Bridge API keys in the OS keychain.
 *
 * Each provider's API key is stored as a separate keychain entry:
 *   service: "semblance.cloud-bridge.{providerId}"
 *   account: "api_key"
 *   value: the API key
 *
 * Provider metadata (base URL, stored timestamp) is stored alongside:
 *   account: "metadata"
 *   value: JSON string
 */
export class CloudBridgeCredentialStore {
  private keychain: KeychainStore;

  constructor(keychain: KeychainStore) {
    this.keychain = keychain;
  }

  /**
   * Store an API key for a Cloud Bridge provider.
   * Overwrites any existing key for the same provider.
   */
  async storeApiKey(providerId: string, apiKey: string, baseUrl?: string): Promise<void> {
    const service = `${SERVICE_PREFIX}.${providerId}`;
    await this.keychain.set(service, 'api_key', apiKey);
    await this.keychain.set(service, 'metadata', JSON.stringify({
      baseUrl: baseUrl ?? null,
      storedAt: new Date().toISOString(),
    }));
  }

  /**
   * Retrieve an API key for a Cloud Bridge provider.
   * Returns null if no key is stored.
   */
  async getApiKey(providerId: string): Promise<string | null> {
    const service = `${SERVICE_PREFIX}.${providerId}`;
    return this.keychain.get(service, 'api_key');
  }

  /**
   * Retrieve the full stored credential (key + metadata) for a provider.
   * Returns null if no key is stored.
   */
  async getCredential(providerId: string): Promise<StoredProviderCredential | null> {
    const service = `${SERVICE_PREFIX}.${providerId}`;
    const apiKey = await this.keychain.get(service, 'api_key');
    if (!apiKey) return null;

    const metadataStr = await this.keychain.get(service, 'metadata');
    let baseUrl: string | null = null;
    let storedAt = '';
    if (metadataStr) {
      try {
        const meta = JSON.parse(metadataStr) as { baseUrl?: string; storedAt?: string };
        baseUrl = meta.baseUrl ?? null;
        storedAt = meta.storedAt ?? '';
      } catch {
        // Corrupt metadata — key still valid
      }
    }

    return { providerId, apiKey, baseUrl, storedAt };
  }

  /**
   * Remove all stored credentials for a provider.
   */
  async removeCredential(providerId: string): Promise<void> {
    const service = `${SERVICE_PREFIX}.${providerId}`;
    await this.keychain.delete(service, 'api_key');
    await this.keychain.delete(service, 'metadata');
  }

  /**
   * Check if a provider has a stored credential.
   */
  async hasCredential(providerId: string): Promise<boolean> {
    const apiKey = await this.getApiKey(providerId);
    return apiKey !== null;
  }

  /**
   * List all provider IDs that have stored credentials.
   * Note: this queries keychain entries by prefix, which may not be supported
   * on all platforms. Callers should maintain their own provider list.
   */
  async listProviderIds(knownProviderIds: string[]): Promise<string[]> {
    const result: string[] = [];
    for (const id of knownProviderIds) {
      if (await this.hasCredential(id)) {
        result.push(id);
      }
    }
    return result;
  }

  /** The keychain service name for a given provider (for reference/debugging). */
  static serviceName(providerId: string): string {
    return `${SERVICE_PREFIX}.${providerId}`;
  }
}
