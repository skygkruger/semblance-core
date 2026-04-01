// Tests for CloudBridgeCredentialStore — API key storage via KeychainStore interface.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudBridgeCredentialStore } from '@semblance/core/security/cloud-bridge-credentials.js';
import type { KeychainStore } from '@semblance/core/credentials/keychain.js';

function createMockKeychain(): KeychainStore & {
  _store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    _store: store,
    set: vi.fn(async (service: string, account: string, value: string) => {
      store.set(`${service}:${account}`, value);
    }),
    get: vi.fn(async (service: string, account: string) => {
      return store.get(`${service}:${account}`) ?? null;
    }),
    delete: vi.fn(async (service: string, account: string) => {
      store.delete(`${service}:${account}`);
    }),
    clear: vi.fn(async (servicePrefix: string) => {
      for (const key of store.keys()) {
        if (key.startsWith(servicePrefix)) store.delete(key);
      }
    }),
  };
}

describe('CloudBridgeCredentialStore', () => {
  let keychain: ReturnType<typeof createMockKeychain>;
  let credStore: CloudBridgeCredentialStore;

  beforeEach(() => {
    keychain = createMockKeychain();
    credStore = new CloudBridgeCredentialStore(keychain);
  });

  it('stores and retrieves an API key', async () => {
    await credStore.storeApiKey('anthropic', 'sk-ant-test-key-123');
    const key = await credStore.getApiKey('anthropic');
    expect(key).toBe('sk-ant-test-key-123');
  });

  it('returns null for missing providers', async () => {
    const key = await credStore.getApiKey('nonexistent');
    expect(key).toBeNull();
  });

  it('stores and retrieves full credential with metadata', async () => {
    await credStore.storeApiKey('openai', 'sk-openai-test', 'https://api.openai.com');
    const cred = await credStore.getCredential('openai');

    expect(cred).not.toBeNull();
    expect(cred!.providerId).toBe('openai');
    expect(cred!.apiKey).toBe('sk-openai-test');
    expect(cred!.baseUrl).toBe('https://api.openai.com');
    expect(cred!.storedAt).toBeTruthy();
  });

  it('stores credential with custom base URL for OpenAI-compatible endpoints', async () => {
    await credStore.storeApiKey('custom', 'my-key', 'https://my-vllm.internal:8080');
    const cred = await credStore.getCredential('custom');
    expect(cred!.baseUrl).toBe('https://my-vllm.internal:8080');
  });

  it('overwrites existing credentials', async () => {
    await credStore.storeApiKey('anthropic', 'old-key');
    await credStore.storeApiKey('anthropic', 'new-key');
    const key = await credStore.getApiKey('anthropic');
    expect(key).toBe('new-key');
  });

  it('removes credentials', async () => {
    await credStore.storeApiKey('anthropic', 'test-key');
    expect(await credStore.hasCredential('anthropic')).toBe(true);

    await credStore.removeCredential('anthropic');
    expect(await credStore.hasCredential('anthropic')).toBe(false);
    expect(await credStore.getApiKey('anthropic')).toBeNull();
  });

  it('checks credential existence', async () => {
    expect(await credStore.hasCredential('anthropic')).toBe(false);
    await credStore.storeApiKey('anthropic', 'test-key');
    expect(await credStore.hasCredential('anthropic')).toBe(true);
  });

  it('lists provider IDs with stored credentials', async () => {
    await credStore.storeApiKey('anthropic', 'key-1');
    await credStore.storeApiKey('openai', 'key-2');

    const ids = await credStore.listProviderIds(['anthropic', 'openai', 'google']);
    expect(ids).toEqual(['anthropic', 'openai']);
  });

  it('generates correct keychain service names', () => {
    expect(CloudBridgeCredentialStore.serviceName('anthropic')).toBe('semblance.cloud-bridge.anthropic');
    expect(CloudBridgeCredentialStore.serviceName('custom')).toBe('semblance.cloud-bridge.custom');
  });

  it('never exposes API keys in the credential metadata', async () => {
    await credStore.storeApiKey('anthropic', 'secret-key-12345');
    // The metadata entry should NOT contain the API key
    const metadataStr = keychain._store.get('semblance.cloud-bridge.anthropic:metadata');
    expect(metadataStr).toBeTruthy();
    expect(metadataStr).not.toContain('secret-key-12345');
  });
});

describe('Cloud Bridge Types', () => {
  it('exports all types from the core types index', async () => {
    const types = await import('@semblance/core/types/index.js');

    // Type exports exist (verified at compile time, but check runtime exports)
    expect(types.DEFAULT_ROUTING_POLICY).toBeDefined();
    expect(types.DEFAULT_ROUTING_POLICY.mode).toBe('off');
    expect(types.KNOWN_PROVIDERS).toBeDefined();
    expect(types.KNOWN_PROVIDERS.length).toBeGreaterThanOrEqual(3);
    expect(types.getKnownProvider).toBeDefined();

    // Verify known providers
    const anthropic = types.getKnownProvider('anthropic');
    expect(anthropic).not.toBeNull();
    expect(anthropic!.name).toContain('Anthropic');

    const openai = types.getKnownProvider('openai');
    expect(openai).not.toBeNull();

    const google = types.getKnownProvider('google');
    expect(google).not.toBeNull();
  });

  it('default routing policy has Cloud Bridge OFF', async () => {
    const mod = await import('@semblance/core/types/cloud-bridge.js');
    expect(mod.DEFAULT_ROUTING_POLICY.mode).toBe('off');
    expect(mod.DEFAULT_ROUTING_POLICY.excludedCategories).toContain('financial');
    expect(mod.DEFAULT_ROUTING_POLICY.excludedCategories).toContain('health');
  });
});
