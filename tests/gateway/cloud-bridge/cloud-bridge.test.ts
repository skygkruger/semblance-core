// Tests for Cloud Bridge — Provider Registry, API Key Validator structure,
// Cloud Bridge Adapter structure.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderRegistry } from '@semblance/gateway/cloud-bridge/provider-registry.js';
import { CloudBridgeAdapter } from '@semblance/gateway/cloud-bridge/cloud-bridge-adapter.js';
import { KNOWN_PROVIDERS, getKnownProvider } from '@semblance/core';
import type { CloudBridgeModel } from '@semblance/core';

// ─── Provider Registry ────────────────────────────────────────────────────────

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('starts empty', () => {
    expect(registry.listProviders()).toHaveLength(0);
    expect(registry.hasConnectedProvider()).toBe(false);
  });

  it('registers and retrieves a provider', () => {
    const anthropicModels = getKnownProvider('anthropic')!.models;
    registry.registerProvider({
      id: 'anthropic',
      name: 'Anthropic API',
      models: anthropicModels,
      storageKey: 'semblance.cloud-bridge.anthropic',
    });

    const provider = registry.getProvider('anthropic');
    expect(provider).not.toBeNull();
    expect(provider!.id).toBe('anthropic');
    expect(provider!.status).toBe('connected');
    expect(provider!.models.length).toBeGreaterThan(0);
    expect(provider!.connectionType).toBe('api_key');
    expect(provider!.usageThisMonth.requests).toBe(0);
    expect(registry.hasConnectedProvider()).toBe(true);
  });

  it('unregisters a provider', () => {
    registry.registerProvider({
      id: 'openai',
      name: 'OpenAI API',
      models: [],
      storageKey: 'semblance.cloud-bridge.openai',
    });

    expect(registry.getProvider('openai')).not.toBeNull();
    registry.unregisterProvider('openai');
    expect(registry.getProvider('openai')).toBeNull();
  });

  it('tracks usage', () => {
    registry.registerProvider({
      id: 'anthropic',
      name: 'Anthropic',
      models: [],
      storageKey: 'key',
    });

    registry.recordUsage('anthropic', 100, 50, 25);
    registry.recordUsage('anthropic', 200, 100, 50);

    const provider = registry.getProvider('anthropic')!;
    expect(provider.usageThisMonth.requests).toBe(2);
    expect(provider.usageThisMonth.tokensIn).toBe(300);
    expect(provider.usageThisMonth.tokensOut).toBe(150);
    expect(provider.usageThisMonth.estimatedCost).toBe(75);
  });

  it('resets monthly usage', () => {
    registry.registerProvider({
      id: 'anthropic',
      name: 'Anthropic',
      models: [],
      storageKey: 'key',
    });
    registry.recordUsage('anthropic', 1000, 500, 100);

    registry.resetMonthlyUsage();

    const provider = registry.getProvider('anthropic')!;
    expect(provider.usageThisMonth.requests).toBe(0);
    expect(provider.usageThisMonth.tokensIn).toBe(0);
  });

  it('updates provider status', () => {
    registry.registerProvider({
      id: 'openai',
      name: 'OpenAI',
      models: [],
      storageKey: 'key',
    });

    registry.setStatus('openai', 'error', 'Rate limited');
    expect(registry.getProvider('openai')!.status).toBe('error');
    expect(registry.getProvider('openai')!.errorMessage).toBe('Rate limited');

    registry.setStatus('openai', 'connected');
    expect(registry.getProvider('openai')!.status).toBe('connected');
    expect(registry.getProvider('openai')!.errorMessage).toBeNull();
  });

  it('returns connected providers only', () => {
    registry.registerProvider({ id: 'a', name: 'A', models: [], storageKey: 'k1' });
    registry.registerProvider({ id: 'b', name: 'B', models: [], storageKey: 'k2' });
    registry.setStatus('b', 'error', 'broken');

    expect(registry.getConnectedProviders()).toHaveLength(1);
    expect(registry.getConnectedProviders()[0]!.id).toBe('a');
  });

  it('gets default model with tool support preference', () => {
    const models: CloudBridgeModel[] = [
      { id: 'model-no-tools', provider: 'test', displayName: 'No Tools', contextWindow: 4096, supportsStreaming: true, supportsTools: false, costPerInputToken: null, costPerOutputToken: null },
      { id: 'model-with-tools', provider: 'test', displayName: 'With Tools', contextWindow: 8192, supportsStreaming: true, supportsTools: true, costPerInputToken: null, costPerOutputToken: null },
    ];
    registry.registerProvider({ id: 'test', name: 'Test', models, storageKey: 'k' });

    const model = registry.getDefaultModel('test');
    expect(model).not.toBeNull();
    expect(model!.id).toBe('model-with-tools');
  });
});

// ─── Cloud Bridge Adapter Structure ───────────────────────────────────────────

describe('CloudBridgeAdapter', () => {
  it('can be instantiated with credential callbacks', () => {
    const adapter = new CloudBridgeAdapter({
      getApiKey: vi.fn().mockResolvedValue('test-key'),
    });
    expect(adapter).toBeDefined();
  });

  it('throws when no API key is available', async () => {
    const adapter = new CloudBridgeAdapter({
      getApiKey: vi.fn().mockResolvedValue(null),
    });

    await expect(adapter.execute({
      id: 'req-1',
      subagentId: 'sub-1',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'test' }],
      maxTokens: 100,
      temperature: 0.7,
      metadata: { taskType: 'test', domain: 'general', contentCategories: [], estimatedCost: null },
    })).rejects.toThrow('No API key available');
  });
});

// ─── Known Providers ──────────────────────────────────────────────────────────

describe('Known Providers', () => {
  it('defines Anthropic, OpenAI, and Google', () => {
    expect(KNOWN_PROVIDERS.length).toBeGreaterThanOrEqual(3);

    const anthropic = getKnownProvider('anthropic');
    expect(anthropic).not.toBeNull();
    expect(anthropic!.chatEndpoint).toContain('messages');
    expect(anthropic!.authHeader).toBe('x-api-key');
    expect(anthropic!.models.length).toBeGreaterThan(0);

    const openai = getKnownProvider('openai');
    expect(openai).not.toBeNull();
    expect(openai!.chatEndpoint).toContain('chat/completions');
    expect(openai!.authHeader).toBe('Authorization');

    const google = getKnownProvider('google');
    expect(google).not.toBeNull();
    expect(google!.chatEndpoint).toContain('generateContent');
  });

  it('returns null for unknown providers', () => {
    expect(getKnownProvider('unknown')).toBeNull();
  });

  it('all models have required fields', () => {
    for (const provider of KNOWN_PROVIDERS) {
      for (const model of provider.models) {
        expect(model.id).toBeTruthy();
        expect(model.provider).toBe(provider.id);
        expect(model.displayName).toBeTruthy();
        expect(model.contextWindow).toBeGreaterThan(0);
        expect(typeof model.supportsStreaming).toBe('boolean');
        expect(typeof model.supportsTools).toBe('boolean');
      }
    }
  });
});
