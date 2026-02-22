/**
 * Bridge Unification + InferenceRouter Wiring Tests
 *
 * Verifies:
 * - Platform selection: iOS → MockMLXBridge, Android → MockLlamaCppBridge
 * - InferenceRouter accepts mobile bridge, routes correctly
 * - MobileProvider wraps bridge into LLMProvider interface
 * - Tier classification on mobile
 * - Fallback when model not loaded
 * - Acid test: end-to-end through InferenceRouter with mock bridge returns real text
 * - Mock bridges produce non-placeholder text
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockMLXBridge, MockLlamaCppBridge } from '../../packages/core/llm/mobile-bridge-mock.js';
import { MobileProvider } from '../../packages/core/llm/mobile-provider.js';
import { InferenceRouter } from '../../packages/core/llm/inference-router.js';
import { classifyMobileDevice, describeMobileProfile } from '../../packages/core/llm/mobile-bridge-types.js';
import type { MobileInferenceBridge } from '../../packages/core/llm/mobile-bridge-types.js';

describe('Bridge Unification + InferenceRouter Wiring', () => {
  // ─── Platform Selection ─────────────────────────────────────────────────

  describe('platform selection', () => {
    it('MockMLXBridge reports ios platform', () => {
      const bridge = new MockMLXBridge();
      expect(bridge.getPlatform()).toBe('ios');
    });

    it('MockLlamaCppBridge reports android platform', () => {
      const bridge = new MockLlamaCppBridge();
      expect(bridge.getPlatform()).toBe('android');
    });
  });

  // ─── MobileProvider wraps bridge into LLMProvider ───────────────────────

  describe('MobileProvider wraps bridge correctly', () => {
    let bridge: MobileInferenceBridge;
    let provider: MobileProvider;

    beforeEach(async () => {
      bridge = new MockMLXBridge();
      provider = new MobileProvider({ bridge, modelName: 'llama-3.2-3b' });
      await bridge.loadModel('/models/test.gguf', {
        contextLength: 2048,
        batchSize: 32,
        threads: 0,
      });
    });

    it('isAvailable returns true when model loaded', async () => {
      expect(await provider.isAvailable()).toBe(true);
    });

    it('isAvailable returns false when model not loaded', async () => {
      const emptyBridge = new MockMLXBridge();
      const emptyProvider = new MobileProvider({ bridge: emptyBridge });
      expect(await emptyProvider.isAvailable()).toBe(false);
    });

    it('generate returns text via bridge', async () => {
      const result = await provider.generate({
        model: 'llama-3.2-3b',
        prompt: 'What is 2+2?',
      });
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.model).toBe('llama-3.2-3b');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('chat returns response via bridge', async () => {
      const result = await provider.chat({
        model: 'llama-3.2-3b',
        messages: [{ role: 'user', content: 'Hello' }],
      });
      expect(result.message.role).toBe('assistant');
      expect(result.message.content.length).toBeGreaterThan(0);
    });

    it('embed returns embeddings via bridge', async () => {
      const result = await provider.embed({
        model: 'nomic-embed',
        input: 'hello world',
      });
      expect(result.embeddings.length).toBe(1);
      expect(result.embeddings[0].length).toBe(384);
    });

    it('listModels returns loaded model info', async () => {
      const models = await provider.listModels();
      expect(models.length).toBe(2); // reasoning + embedding
      expect(models[0].name).toBe('llama-3.2-3b');
      expect(models[0].family).toBe('mobile-ios');
    });
  });

  // ─── InferenceRouter with Mobile Provider ───────────────────────────────

  describe('InferenceRouter with mobile provider', () => {
    let mlxBridge: MockMLXBridge;
    let mobileProvider: MobileProvider;
    let router: InferenceRouter;

    beforeEach(async () => {
      mlxBridge = new MockMLXBridge();
      await mlxBridge.loadModel('/models/test.gguf', {
        contextLength: 2048,
        batchSize: 32,
        threads: 0,
      });

      mobileProvider = new MobileProvider({
        bridge: mlxBridge,
        modelName: 'llama-3.2-3b',
        embeddingModelName: 'nomic-embed',
      });

      // Create a minimal desktop provider stub for the required fields
      const desktopStub: any = {
        isAvailable: async () => false,
        generate: async () => ({ text: '', model: '', tokensUsed: { prompt: 0, completion: 0, total: 0 }, durationMs: 0 }),
        chat: async () => ({ message: { role: 'assistant', content: '' }, model: '', tokensUsed: { prompt: 0, completion: 0, total: 0 }, durationMs: 0 }),
        embed: async () => ({ embeddings: [], model: '', durationMs: 0 }),
        listModels: async () => [],
        getModel: async () => null,
      };

      router = new InferenceRouter({
        reasoningProvider: desktopStub,
        embeddingProvider: desktopStub,
        reasoningModel: 'desktop-model',
        embeddingModel: 'desktop-embed',
        platform: 'ios',
        mobileProvider,
        mobileReasoningModel: 'llama-3.2-3b',
        mobileEmbeddingModel: 'nomic-embed',
      });
    });

    it('router reports as mobile platform', () => {
      expect(router.isMobile()).toBe(true);
      expect(router.getPlatform()).toBe('ios');
    });

    it('router uses mobile provider for generate on mobile', async () => {
      const result = await router.generate({
        model: 'llama-3.2-3b',
        prompt: 'Test prompt',
      });
      // Should get text from MLX mock bridge, not empty desktop stub
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.text).toContain('[MLX]');
    });

    it('router uses mobile provider for chat on mobile', async () => {
      const result = await router.chat({
        model: 'llama-3.2-3b',
        messages: [{ role: 'user', content: 'Hello' }],
      });
      expect(result.message.content.length).toBeGreaterThan(0);
    });

    it('isMobileReady returns true when bridge has loaded model', async () => {
      expect(await router.isMobileReady()).toBe(true);
    });

    it('acid test: end-to-end through InferenceRouter returns non-placeholder text', async () => {
      const result = await router.generate({
        model: 'llama-3.2-3b',
        prompt: 'What is the meaning of life?',
      });

      expect(result.text).not.toBe('');
      expect(result.text.toLowerCase()).not.toContain('placeholder');
      expect(result.text.toLowerCase()).not.toContain('todo');
      expect(result.text.toLowerCase()).not.toContain('not implemented');
      expect(result.text.length).toBeGreaterThan(5);
    });
  });

  // ─── Fallback when model not loaded ─────────────────────────────────────

  describe('fallback when model not loaded', () => {
    it('MobileProvider.isAvailable returns false with unloaded bridge', async () => {
      const bridge = new MockLlamaCppBridge();
      const provider = new MobileProvider({ bridge });
      expect(await provider.isAvailable()).toBe(false);
    });

    it('InferenceRouter falls back to desktop when no mobile provider', async () => {
      const desktopStub: any = {
        isAvailable: async () => true,
        generate: async () => ({
          text: 'Desktop response',
          model: 'desktop-model',
          tokensUsed: { prompt: 5, completion: 2, total: 7 },
          durationMs: 100,
        }),
        chat: async () => ({
          message: { role: 'assistant', content: 'Desktop chat' },
          model: 'desktop-model',
          tokensUsed: { prompt: 5, completion: 2, total: 7 },
          durationMs: 100,
        }),
        embed: async () => ({ embeddings: [], model: 'desktop-embed', durationMs: 10 }),
        listModels: async () => [],
        getModel: async () => null,
      };

      const router = new InferenceRouter({
        reasoningProvider: desktopStub,
        embeddingProvider: desktopStub,
        reasoningModel: 'desktop-model',
        embeddingModel: 'desktop-embed',
        platform: 'desktop',
      });

      const result = await router.generate({
        model: 'desktop-model',
        prompt: 'Test',
      });
      expect(result.text).toBe('Desktop response');
    });
  });

  // ─── Tier Classification ────────────────────────────────────────────────

  describe('tier classification on mobile', () => {
    it('classifies 8GB iOS device as capable', () => {
      const profile = classifyMobileDevice('ios', 8192, 'A17 Pro');
      expect(profile.tier).toBe('capable');
      expect(profile.recommendedModelSize).toBe('3B');
      expect(profile.gpuAcceleration).toBe(true);
    });

    it('classifies 6GB Android device as capable', () => {
      const profile = classifyMobileDevice('android', 6144, 'Snapdragon 8 Gen 3');
      expect(profile.tier).toBe('capable');
      expect(profile.recommendedModelSize).toBe('3B');
    });

    it('classifies 4GB device as constrained', () => {
      const profile = classifyMobileDevice('android', 4096, 'Snapdragon 778G');
      expect(profile.tier).toBe('constrained');
      expect(profile.recommendedModelSize).toBe('1.5B');
    });

    it('classifies 3GB device as none', () => {
      const profile = classifyMobileDevice('android', 3072, 'Mediatek Dimensity 700');
      expect(profile.tier).toBe('none');
      expect(profile.recommendedModelSize).toBeNull();
    });

    it('iOS constrained still has GPU acceleration', () => {
      const profile = classifyMobileDevice('ios', 4096, 'A15');
      expect(profile.tier).toBe('constrained');
      expect(profile.gpuAcceleration).toBe(true); // Metal always available on iOS
    });

    it('Android constrained may not have GPU acceleration', () => {
      const profile = classifyMobileDevice('android', 4096, 'Snapdragon 695');
      expect(profile.tier).toBe('constrained');
      expect(profile.gpuAcceleration).toBe(false); // Vulkan optional on Android
    });

    it('describeMobileProfile returns human-readable string', () => {
      const profile = classifyMobileDevice('ios', 8192, 'A17 Pro');
      const desc = describeMobileProfile(profile);
      expect(desc).toContain('A17 Pro');
      expect(desc).toContain('8GB');
      expect(desc).toContain('3B');
    });
  });

  // ─── Mock Bridge Acid Tests ─────────────────────────────────────────────

  describe('mock bridges return non-placeholder text', () => {
    it('MockMLXBridge generate returns non-placeholder', async () => {
      const bridge = new MockMLXBridge();
      await bridge.loadModel('/models/test.gguf', { contextLength: 2048, batchSize: 32, threads: 0 });

      let text = '';
      for await (const token of bridge.generate('Test prompt', {})) {
        text += token;
      }

      expect(text).not.toBe('');
      expect(text.toLowerCase()).not.toContain('placeholder');
      expect(text.toLowerCase()).not.toContain('not implemented');
    });

    it('MockLlamaCppBridge generate returns non-placeholder', async () => {
      const bridge = new MockLlamaCppBridge();
      await bridge.loadModel('/models/test.gguf', { contextLength: 2048, batchSize: 32, threads: 0 });

      let text = '';
      for await (const token of bridge.generate('Test prompt', {})) {
        text += token;
      }

      expect(text).not.toBe('');
      expect(text.toLowerCase()).not.toContain('placeholder');
      expect(text.toLowerCase()).not.toContain('not implemented');
    });

    it('MLX and LlamaCpp bridges produce different outputs', async () => {
      const mlx = new MockMLXBridge();
      const llama = new MockLlamaCppBridge();
      await mlx.loadModel('/models/test.gguf', { contextLength: 2048, batchSize: 32, threads: 0 });
      await llama.loadModel('/models/test.gguf', { contextLength: 2048, batchSize: 32, threads: 0 });

      let mlxText = '';
      for await (const t of mlx.generate('hello', {})) mlxText += t;

      let llamaText = '';
      for await (const t of llama.generate('hello', {})) llamaText += t;

      expect(mlxText).not.toBe(llamaText);
    });
  });
});
