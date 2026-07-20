// Integration: multi-model architecture — registry recommend APIs, BitNet gating, Settings mutual exclusion.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InferenceRouter } from '@semblance/core/llm/inference-router.js';
import type { LLMProvider, ModelInfo } from '@semblance/core/llm/types.js';
import {
  getRecommendedReasoningModel,
  getRecommendedBitNetModel,
} from '@semblance/core/llm/model-registry.js';

const ROOT = join(import.meta.dirname, '..', '..');
const BRIDGE = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.ts');

function createMockProvider(name: string, available: boolean): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(available),
    generate: vi.fn().mockResolvedValue({
      text: `from ${name}`,
      model: name,
      tokensUsed: { prompt: 1, completion: 1, total: 2 },
      durationMs: 1,
    }),
    chat: vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: `chat from ${name}` },
      model: name,
      tokensUsed: { prompt: 1, completion: 1, total: 2 },
      durationMs: 1,
    }),
    embed: vi.fn().mockResolvedValue({
      embeddings: [[0.1]],
      model: name,
      durationMs: 1,
    }),
    listModels: vi.fn().mockResolvedValue([{ name, size: 1, isEmbedding: false } as ModelInfo]),
    getModel: vi.fn().mockResolvedValue(null),
  };
}

describe('Multi-model architecture', () => {
  const tiers = ['constrained', 'standard', 'performance', 'workstation', 'enthusiast'] as const;

  describe('registry recommend APIs', () => {
    it.each(tiers)('getRecommendedReasoningModel(%s) returns a standard catalog model', (tier) => {
      const model = getRecommendedReasoningModel(tier);
      expect(model.id.length).toBeGreaterThan(0);
      expect(model.displayName.length).toBeGreaterThan(0);
      expect(model.isEmbedding).toBe(false);
      expect(model.nativeOneBit ?? false).toBe(false);
    });

    it.each(tiers)('getRecommendedBitNetModel(%s) returns a BitNet catalog entry', (tier) => {
      const model = getRecommendedBitNetModel(tier);
      expect(model.id.length).toBeGreaterThan(0);
      expect(model.displayName.length).toBeGreaterThan(0);
    });
  });

  describe('InferenceRouter BitNet availability gate', () => {
    it('does not route to BitNet when provider is attached but not loaded/ready', async () => {
      const reasoning = createMockProvider('native', true);
      const bitnet = createMockProvider('bitnet', false);
      const router = new InferenceRouter({
        reasoningProvider: reasoning,
        embeddingProvider: reasoning,
        reasoningModel: 'qwen3-4b',
        embeddingModel: 'nomic-embed-text-v1.5',
        bitnetProvider: bitnet,
        bitnetReasoningModel: 'falcon-e-3b',
      });

      await router.routedChat(
        { model: '', messages: [{ role: 'user', content: 'hello' }] },
        'generate',
      );

      expect(reasoning.chat).toHaveBeenCalled();
      expect(bitnet.chat).not.toHaveBeenCalled();
    });

    it('routes to BitNet after setBitNetProvider when isAvailable is true', async () => {
      const reasoning = createMockProvider('native', true);
      const bitnet = createMockProvider('bitnet', true);
      const router = new InferenceRouter({
        reasoningProvider: reasoning,
        embeddingProvider: reasoning,
        reasoningModel: 'qwen3-4b',
        embeddingModel: 'nomic-embed-text-v1.5',
      });

      router.setBitNetProvider(bitnet, 'falcon-e-3b');

      await router.routedChat(
        { model: '', messages: [{ role: 'user', content: 'hello' }] },
        'generate',
      );

      expect(bitnet.chat).toHaveBeenCalled();
      expect(reasoning.chat).not.toHaveBeenCalled();
    });

    it('falls back to reasoning when BitNet was ready but isAvailable becomes false', async () => {
      const reasoning = createMockProvider('native', true);
      const bitnet = createMockProvider('bitnet', false);
      const router = new InferenceRouter({
        reasoningProvider: reasoning,
        embeddingProvider: reasoning,
        reasoningModel: 'qwen3-4b',
        embeddingModel: 'nomic-embed-text-v1.5',
      });

      router.setBitNetProvider(bitnet, 'falcon-e-3b');

      await router.routedChat(
        { model: '', messages: [{ role: 'user', content: 'hello' }] },
        'generate',
      );

      expect(reasoning.chat).toHaveBeenCalled();
      expect(bitnet.chat).not.toHaveBeenCalled();
    });
  });

  describe('Settings activate mutual exclusion (source invariants)', () => {
    const bridgeSrc = readFileSync(BRIDGE, 'utf-8');

    it('handleBitNetSetActive clears standard_active_model pref', () => {
      const fnStart = bridgeSrc.indexOf('async function handleBitNetSetActive');
      expect(fnStart).toBeGreaterThan(-1);
      const fnBody = bridgeSrc.slice(fnStart, fnStart + 2500);
      expect(fnBody).toContain("setPref('standard_active_model', '')");
    });

    it('handleStandardSetActive clears bitnet_active_model pref and router BitNet slot', () => {
      const fnStart = bridgeSrc.indexOf('async function handleStandardSetActive');
      expect(fnStart).toBeGreaterThan(-1);
      const fnBody = bridgeSrc.slice(fnStart, fnStart + 3500);
      expect(fnBody).toContain("setPref('bitnet_active_model', '')");
      expect(fnBody).toContain('clearBitNetProvider');
    });
  });

  describe('onboarding hardware recommendation wiring', () => {
    const onboardingSrc = readFileSync(
      join(ROOT, 'packages', 'desktop', 'src', 'screens', 'OnboardingFlow.tsx'),
      'utf-8',
    );

    it('fetches tier recommendations after detectHardware', () => {
      expect(onboardingSrc).toContain('getRecommendedModelsForTier');
      expect(onboardingSrc).toContain('recommendedModel={recommendedModel}');
    });
  });
});
