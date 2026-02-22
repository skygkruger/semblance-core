// Tests for Commit 2: Mobile InferenceRouter + Native Bridge Interface.
// Verifies MobileInferenceBridge mocks, MobileProvider, device classification,
// and InferenceRouter platform-aware routing.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockMLXBridge, MockLlamaCppBridge } from '@semblance/core/llm/mobile-bridge-mock.js';
import { MobileProvider } from '@semblance/core/llm/mobile-provider.js';
import { InferenceRouter } from '@semblance/core/llm/inference-router.js';
import {
  classifyMobileDevice,
  describeMobileProfile,
  MOBILE_MODEL_DEFAULTS,
} from '@semblance/core/llm/mobile-bridge-types.js';
import type { LLMProvider, ChatResponse, GenerateResponse, EmbedResponse } from '@semblance/core/llm/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockDesktopProvider(): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn().mockResolvedValue({
      text: 'Desktop response',
      model: 'llama3.2:8b',
      tokensUsed: { prompt: 10, completion: 5, total: 15 },
      durationMs: 100,
    } satisfies GenerateResponse),
    chat: vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: 'Desktop chat response' },
      model: 'llama3.2:8b',
      tokensUsed: { prompt: 10, completion: 5, total: 15 },
      durationMs: 100,
    } satisfies ChatResponse),
    embed: vi.fn().mockResolvedValue({
      embeddings: [[0.1, 0.2, 0.3]],
      model: 'nomic-embed-text',
      durationMs: 50,
    } satisfies EmbedResponse),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn().mockResolvedValue(null),
  };
}

// ─── MockMLXBridge Tests ────────────────────────────────────────────────────

describe('MockMLXBridge (iOS)', () => {
  let bridge: MockMLXBridge;

  beforeEach(() => {
    bridge = new MockMLXBridge();
  });

  it('reports platform as ios', () => {
    expect(bridge.getPlatform()).toBe('ios');
  });

  it('is not loaded initially', () => {
    expect(bridge.isModelLoaded()).toBe(false);
  });

  it('loads model and becomes available', async () => {
    await bridge.loadModel('/path/to/model.gguf', MOBILE_MODEL_DEFAULTS.capable);
    expect(bridge.isModelLoaded()).toBe(true);
  });

  it('generates streaming tokens after model load', async () => {
    await bridge.loadModel('/path/to/model.gguf', MOBILE_MODEL_DEFAULTS.capable);

    const tokens: string[] = [];
    for await (const token of bridge.generate('Hello world', {})) {
      tokens.push(token);
    }

    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.join('')).toContain('[MLX]');
  });

  it('generates embeddings with correct dimensions', async () => {
    await bridge.loadModel('/path/to/model.gguf', MOBILE_MODEL_DEFAULTS.capable);

    const embedding = await bridge.embed('Test text');
    expect(embedding).toHaveLength(384);
    expect(typeof embedding[0]).toBe('number');
  });

  it('throws when generating without loaded model', async () => {
    const gen = bridge.generate('test', {});
    await expect(async () => {
      for await (const _ of gen) { /* consume */ }
    }).rejects.toThrow('No model loaded');
  });

  it('unloads model', async () => {
    await bridge.loadModel('/path/to/model.gguf', MOBILE_MODEL_DEFAULTS.capable);
    expect(bridge.isModelLoaded()).toBe(true);

    await bridge.unloadModel();
    expect(bridge.isModelLoaded()).toBe(false);
  });

  it('reports memory usage', async () => {
    const beforeLoad = await bridge.getMemoryUsage();
    expect(beforeLoad.used).toBe(0);

    await bridge.loadModel('/path/to/model.gguf', MOBILE_MODEL_DEFAULTS.capable);
    const afterLoad = await bridge.getMemoryUsage();
    expect(afterLoad.used).toBeGreaterThan(0);
    expect(afterLoad.available).toBeGreaterThan(0);
  });
});

// ─── MockLlamaCppBridge Tests ───────────────────────────────────────────────

describe('MockLlamaCppBridge (Android)', () => {
  let bridge: MockLlamaCppBridge;

  beforeEach(() => {
    bridge = new MockLlamaCppBridge();
  });

  it('reports platform as android', () => {
    expect(bridge.getPlatform()).toBe('android');
  });

  it('generates streaming tokens', async () => {
    await bridge.loadModel('/path/to/model.gguf', MOBILE_MODEL_DEFAULTS.capable);

    const tokens: string[] = [];
    for await (const token of bridge.generate('Hello world', {})) {
      tokens.push(token);
    }

    expect(tokens.join('')).toContain('[LlamaCpp]');
  });

  it('embedding differs from MLX (cosine vs sine)', async () => {
    const mlx = new MockMLXBridge();
    await mlx.loadModel('/path/to/model.gguf', MOBILE_MODEL_DEFAULTS.capable);
    await bridge.loadModel('/path/to/model.gguf', MOBILE_MODEL_DEFAULTS.capable);

    const mlxEmbed = await mlx.embed('test');
    const llamaEmbed = await bridge.embed('test');

    // Both return 384-dim but with different values (sin vs cos)
    expect(mlxEmbed).toHaveLength(384);
    expect(llamaEmbed).toHaveLength(384);
    expect(mlxEmbed[0]).not.toBe(llamaEmbed[0]);
  });
});

// ─── MobileProvider Tests ───────────────────────────────────────────────────

describe('MobileProvider', () => {
  let bridge: MockMLXBridge;
  let provider: MobileProvider;

  beforeEach(async () => {
    bridge = new MockMLXBridge();
    await bridge.loadModel('/path/to/model.gguf', MOBILE_MODEL_DEFAULTS.capable);
    provider = new MobileProvider({ bridge });
  });

  it('is available when model is loaded', async () => {
    expect(await provider.isAvailable()).toBe(true);
  });

  it('is not available when model is unloaded', async () => {
    await bridge.unloadModel();
    expect(await provider.isAvailable()).toBe(false);
  });

  it('generates text via bridge', async () => {
    const result = await provider.generate({ prompt: 'Hello', model: '' });
    expect(result.text).toContain('[MLX]');
    expect(result.model).toBe('mobile-native');
  });

  it('handles chat via bridge', async () => {
    const result = await provider.chat({
      messages: [{ role: 'user', content: 'What is 2+2?' }],
      model: '',
    });
    expect(result.message.role).toBe('assistant');
    expect(result.message.content).toContain('[MLX]');
  });

  it('streams chat tokens', async () => {
    const tokens: string[] = [];
    for await (const token of provider.chatStream!({
      messages: [{ role: 'user', content: 'test' }],
      model: '',
    })) {
      tokens.push(token);
    }
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('generates embeddings via bridge', async () => {
    const result = await provider.embed({ input: 'test text', model: '' });
    expect(result.embeddings).toHaveLength(1);
    expect(result.embeddings[0]).toHaveLength(384);
  });

  it('generates batch embeddings', async () => {
    const result = await provider.embed({ input: ['text1', 'text2', 'text3'], model: '' });
    expect(result.embeddings).toHaveLength(3);
  });
});

// ─── Mobile Device Classification ───────────────────────────────────────────

describe('Mobile Device Classification', () => {
  it('classifies 8GB iPhone as capable', () => {
    const profile = classifyMobileDevice('ios', 8192, 'A17 Pro');
    expect(profile.tier).toBe('capable');
    expect(profile.recommendedModelSize).toBe('3B');
    expect(profile.gpuAcceleration).toBe(true);
  });

  it('classifies 6GB iPhone as capable', () => {
    const profile = classifyMobileDevice('ios', 6144, 'A16 Bionic');
    expect(profile.tier).toBe('capable');
    expect(profile.recommendedModelSize).toBe('3B');
  });

  it('classifies 4GB iPhone as constrained', () => {
    const profile = classifyMobileDevice('ios', 4096, 'A14 Bionic');
    expect(profile.tier).toBe('constrained');
    expect(profile.recommendedModelSize).toBe('1.5B');
    expect(profile.gpuAcceleration).toBe(true); // Metal always available on iOS
  });

  it('classifies 4GB Android as constrained with no guaranteed GPU', () => {
    const profile = classifyMobileDevice('android', 4096, 'Snapdragon 865');
    expect(profile.tier).toBe('constrained');
    expect(profile.gpuAcceleration).toBe(false); // Vulkan not guaranteed on Android
  });

  it('classifies <4GB device as none (no inference)', () => {
    const profile = classifyMobileDevice('ios', 3072, 'A13 Bionic');
    expect(profile.tier).toBe('none');
    expect(profile.recommendedModelSize).toBeNull();
  });

  it('assigns correct model options for capable tier', () => {
    const profile = classifyMobileDevice('ios', 8192, 'A17 Pro');
    expect(profile.modelOptions.contextLength).toBe(2048);
    expect(profile.modelOptions.batchSize).toBe(32);
    expect(profile.modelOptions.gpuLayers).toBe(32);
  });

  it('assigns correct model options for constrained tier', () => {
    const profile = classifyMobileDevice('android', 4096, 'Snapdragon 778G');
    expect(profile.modelOptions.contextLength).toBe(1024);
    expect(profile.modelOptions.batchSize).toBe(16);
    expect(profile.modelOptions.gpuLayers).toBe(16);
  });

  it('produces human-readable descriptions', () => {
    const capable = classifyMobileDevice('ios', 8192, 'A17 Pro');
    expect(describeMobileProfile(capable)).toContain('3B model');

    const constrained = classifyMobileDevice('android', 4096, 'Snapdragon 865');
    expect(describeMobileProfile(constrained)).toContain('1.5B model');

    const none = classifyMobileDevice('ios', 3072, 'A13 Bionic');
    expect(describeMobileProfile(none)).toContain('desktop connection');
  });
});

// ─── InferenceRouter Platform Routing ───────────────────────────────────────

describe('InferenceRouter with mobile support', () => {
  it('defaults to desktop platform', () => {
    const router = new InferenceRouter({
      reasoningProvider: makeMockDesktopProvider(),
      embeddingProvider: makeMockDesktopProvider(),
      reasoningModel: 'llama3.2:8b',
      embeddingModel: 'nomic-embed-text',
    });

    expect(router.getPlatform()).toBe('desktop');
    expect(router.isMobile()).toBe(false);
  });

  it('recognizes ios platform as mobile', () => {
    const router = new InferenceRouter({
      reasoningProvider: makeMockDesktopProvider(),
      embeddingProvider: makeMockDesktopProvider(),
      reasoningModel: 'llama3.2:8b',
      embeddingModel: 'nomic-embed-text',
      platform: 'ios',
    });

    expect(router.getPlatform()).toBe('ios');
    expect(router.isMobile()).toBe(true);
  });

  it('uses mobile provider when on mobile platform', async () => {
    const bridge = new MockMLXBridge();
    await bridge.loadModel('/model.gguf', MOBILE_MODEL_DEFAULTS.capable);
    const mobileProvider = new MobileProvider({ bridge });

    const desktopProvider = makeMockDesktopProvider();

    const router = new InferenceRouter({
      reasoningProvider: desktopProvider,
      embeddingProvider: desktopProvider,
      reasoningModel: 'llama3.2:8b',
      embeddingModel: 'nomic-embed-text',
      platform: 'ios',
      mobileProvider,
    });

    const result = await router.generate({ prompt: 'test', model: '' });
    // Should use mobile provider (contains [MLX]), not desktop
    expect(result.text).toContain('[MLX]');
    expect(desktopProvider.generate).not.toHaveBeenCalled();
  });

  it('uses desktop provider when on desktop platform', async () => {
    const desktopProvider = makeMockDesktopProvider();

    const router = new InferenceRouter({
      reasoningProvider: desktopProvider,
      embeddingProvider: desktopProvider,
      reasoningModel: 'llama3.2:8b',
      embeddingModel: 'nomic-embed-text',
      platform: 'desktop',
    });

    const result = await router.generate({ prompt: 'test', model: '' });
    expect(result.text).toBe('Desktop response');
  });

  it('falls back to desktop provider on mobile when no mobile provider set', async () => {
    const desktopProvider = makeMockDesktopProvider();

    const router = new InferenceRouter({
      reasoningProvider: desktopProvider,
      embeddingProvider: desktopProvider,
      reasoningModel: 'llama3.2:8b',
      embeddingModel: 'nomic-embed-text',
      platform: 'ios',
      // No mobileProvider
    });

    const result = await router.generate({ prompt: 'test', model: '' });
    // Falls back to desktop provider
    expect(result.text).toBe('Desktop response');
  });

  it('setMobileProvider updates the mobile backend', async () => {
    const desktopProvider = makeMockDesktopProvider();

    const router = new InferenceRouter({
      reasoningProvider: desktopProvider,
      embeddingProvider: desktopProvider,
      reasoningModel: 'llama3.2:8b',
      embeddingModel: 'nomic-embed-text',
      platform: 'android',
    });

    // Initially no mobile provider — uses desktop
    let result = await router.generate({ prompt: 'test', model: '' });
    expect(result.text).toBe('Desktop response');

    // Now set mobile provider
    const bridge = new MockLlamaCppBridge();
    await bridge.loadModel('/model.gguf', MOBILE_MODEL_DEFAULTS.capable);
    const mobileProvider = new MobileProvider({ bridge });

    router.setMobileProvider(mobileProvider, 'llama-3b', 'nomic-384');

    result = await router.generate({ prompt: 'test', model: '' });
    expect(result.text).toContain('[LlamaCpp]');
  });

  it('isMobileReady returns false when no mobile provider', async () => {
    const router = new InferenceRouter({
      reasoningProvider: makeMockDesktopProvider(),
      embeddingProvider: makeMockDesktopProvider(),
      reasoningModel: 'llama3.2:8b',
      embeddingModel: 'nomic-embed-text',
      platform: 'ios',
    });

    expect(await router.isMobileReady()).toBe(false);
  });

  it('isMobileReady returns true when mobile provider is loaded', async () => {
    const bridge = new MockMLXBridge();
    await bridge.loadModel('/model.gguf', MOBILE_MODEL_DEFAULTS.capable);
    const mobileProvider = new MobileProvider({ bridge });

    const router = new InferenceRouter({
      reasoningProvider: makeMockDesktopProvider(),
      embeddingProvider: makeMockDesktopProvider(),
      reasoningModel: 'llama3.2:8b',
      embeddingModel: 'nomic-embed-text',
      platform: 'ios',
      mobileProvider,
    });

    expect(await router.isMobileReady()).toBe(true);
  });

  it('routedChat uses mobile provider on mobile', async () => {
    const bridge = new MockMLXBridge();
    await bridge.loadModel('/model.gguf', MOBILE_MODEL_DEFAULTS.capable);
    const mobileProvider = new MobileProvider({ bridge });

    const router = new InferenceRouter({
      reasoningProvider: makeMockDesktopProvider(),
      embeddingProvider: makeMockDesktopProvider(),
      reasoningModel: 'llama3.2:8b',
      embeddingModel: 'nomic-embed-text',
      platform: 'ios',
      mobileProvider,
    });

    const result = await router.routedChat({
      messages: [{ role: 'user', content: 'test' }],
      model: '',
    }, 'classify');

    expect(result.message.content).toContain('[MLX]');
  });
});
