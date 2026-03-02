// Mobile KeychainStore — react-native-keychain-backed implementation.
//
// Uses kSecAttrAccessibleWhenUnlockedThisDeviceOnly for iOS Keychain
// and encrypted shared preferences on Android.
//
// Service naming: each credential gets a unique service name via keychainServiceName().

import type { KeychainStore } from '@semblance/core';

// react-native-keychain types (imported at runtime on mobile)
interface RNKeychain {
  setGenericPassword(
    username: string,
    password: string,
    options?: { service?: string; accessible?: string },
  ): Promise<boolean>;
  getGenericPassword(options?: { service?: string }): Promise<false | { password: string }>;
  resetGenericPassword(options?: { service?: string }): Promise<boolean>;
}

// Accessible constant for iOS
const WHEN_UNLOCKED_THIS_DEVICE = 'AccessibleWhenUnlockedThisDeviceOnly';

export class MobileKeychainStore implements KeychainStore {
  private keychain: RNKeychain;
  // In-memory tracking of stored entries (no SQLite dependency on mobile for this)
  private entries: Map<string, Set<string>> = new Map();

  constructor(keychain: RNKeychain) {
    this.keychain = keychain;
  }

  async set(service: string, account: string, value: string): Promise<void> {
    // Combine service+account into a unique keychain service identifier
    const keychainService = `${service}.${account}`;
    await this.keychain.setGenericPassword(account, value, {
      service: keychainService,
      accessible: WHEN_UNLOCKED_THIS_DEVICE,
    });

    // Track for clear()
    if (!this.entries.has(service)) {
      this.entries.set(service, new Set());
    }
    this.entries.get(service)!.add(account);
  }

  async get(service: string, account: string): Promise<string | null> {
    const keychainService = `${service}.${account}`;
    const result = await this.keychain.getGenericPassword({ service: keychainService });
    if (!result) return null;
    return result.password;
  }

  async delete(service: string, account: string): Promise<void> {
    const keychainService = `${service}.${account}`;
    await this.keychain.resetGenericPassword({ service: keychainService });

    const accounts = this.entries.get(service);
    if (accounts) {
      accounts.delete(account);
      if (accounts.size === 0) this.entries.delete(service);
    }
  }

  async clear(servicePrefix: string): Promise<void> {
    for (const [service, accounts] of this.entries) {
      if (service.startsWith(servicePrefix)) {
        for (const account of accounts) {
          const keychainService = `${service}.${account}`;
          try {
            await this.keychain.resetGenericPassword({ service: keychainService });
          } catch {
            // Best-effort cleanup
          }
        }
        this.entries.delete(service);
      }
    }
  }
}
