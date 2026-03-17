// Tests for InferenceRouter — task-based routing, fallback, provider delegation, three-tier.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InferenceRouter } from '@semblance/core/llm/inference-router.js';
import type { LLMProvider, ModelInfo } from '@semblance/core/llm/types.js';
import type { TaskType } from '@semblance/core/llm/inference-types.js';

function createMockProvider(name: string = 'mock'): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn().mockResolvedValue({
      text: `response from ${name}`,
      model: name,
      tokensUsed: { prompt: 10, completion: 20, total: 30 },
      durationMs: 100,
    }),
    chat: vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: `chat from ${name}` },
      model: name,
      tokensUsed: { prompt: 10, completion: 20, total: 30 },
      durationMs: 100,
    }),
    embed: vi.fn().mockResolvedValue({
      embeddings: [[0.1, 0.2, 0.3]],
      model: name,
      durationMs: 50,
    }),
    listModels: vi.fn().mockResolvedValue([
      { name, size: 1000, isEmbedding: false } as ModelInfo,
    ]),
    getModel: vi.fn().mockResolvedValue(null),
  };
}

describe('InferenceRouter', () => {
  let reasoningProvider: LLMProvider;
  let embeddingProvider: LLMProvider;
  let router: InferenceRouter;

  beforeEach(() => {
    reasoningProvider = createMockProvider('reasoning');
    embeddingProvider = createMockProvider('embedding');
    router = new InferenceRouter({
      reasoningProvider,
      embeddingProvider,
      reasoningModel: 'qwen3-8b',
      embeddingModel: 'nomic-embed-text-v1.5',
    });
  });

  describe('LLMProvider interface', () => {
    it('isAvailable returns true when reasoning provider is available', async () => {
      expect(await router.isAvailable()).toBe(true);
    });

    it('isAvailable returns true when only embedding is available', async () => {
      (reasoningProvider.isAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      expect(await router.isAvailable()).toBe(true);
    });

    it('isAvailable returns false when neither provider is available', async () => {
      (reasoningProvider.isAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (embeddingProvider.isAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      expect(await router.isAvailable()).toBe(false);
    });

    it('generate delegates to reasoning provider', async () => {
      const result = await router.generate({
        model: '', prompt: 'test',
      });

      expect(reasoningProvider.generate).toHaveBeenCalled();
      expect(result.text).toBe('response from reasoning');
    });

    it('generate uses reasoningModel as default', async () => {
      await router.generate({ model: '', prompt: 'test' });

      expect(reasoningProvider.generate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'qwen3-8b' })
      );
    });

    it('chat delegates to reasoning provider', async () => {
      const result = await router.chat({
        model: '', messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(reasoningProvider.chat).toHaveBeenCalled();
      expect(result.message.content).toBe('chat from reasoning');
    });

    it('embed delegates to embedding provider', async () => {
      const result = await router.embed({
        model: '', input: 'hello',
      });

      expect(embeddingProvider.embed).toHaveBeenCalled();
      expect(result.embeddings).toEqual([[0.1, 0.2, 0.3]]);
    });

    it('embed uses embeddingModel as default', async () => {
      await router.embed({ model: '', input: 'test' });

      expect(embeddingProvider.embed).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'nomic-embed-text-v1.5' })
      );
    });
  });

  describe('Task-aware routing', () => {
    it('routedChat routes classify to fast provider when available', async () => {
      const fastProvider = createMockProvider('fast');
      router.setFastProvider(fastProvider, 'smollm2-1.7b');

      await router.routedChat(
        { model: '', messages: [{ role: 'user', content: 'classify this' }] },
        'classify'
      );
      expect(fastProvider.chat).toHaveBeenCalled();
      expect(reasoningProvider.chat).not.toHaveBeenCalled();
    });

    it('routedChat routes extract to fast provider when available', async () => {
      const fastProvider = createMockProvider('fast');
      router.setFastProvider(fastProvider, 'smollm2-1.7b');

      await router.routedChat(
        { model: '', messages: [{ role: 'user', content: 'extract data' }] },
        'extract'
      );
      expect(fastProvider.chat).toHaveBeenCalled();
    });

    it('routedChat routes classify to reasoning provider when no fast provider', async () => {
      await router.routedChat(
        { model: '', messages: [{ role: 'user', content: 'classify this' }] },
        'classify'
      );
      expect(reasoningProvider.chat).toHaveBeenCalled();
    });

    it('routedChat routes generate to reasoning provider', async () => {
      await router.routedChat(
        { model: '', messages: [{ role: 'user', content: 'generate text' }] },
        'generate'
      );
      expect(reasoningProvider.chat).toHaveBeenCalled();
    });

    it('routedChat routes reason to reasoning provider (quality tier)', async () => {
      await router.routedChat(
        { model: '', messages: [{ role: 'user', content: 'complex reasoning' }] },
        'reason'
      );
      expect(reasoningProvider.chat).toHaveBeenCalled();
    });

    it('routedGenerate routes extract to fast provider', async () => {
      const fastProvider = createMockProvider('fast');
      router.setFastProvider(fastProvider, 'smollm2-1.7b');

      await router.routedGenerate(
        { model: '', prompt: 'extract data' },
        'extract'
      );
      expect(fastProvider.generate).toHaveBeenCalled();
    });

    it('all task types route to a provider without error', async () => {
      const tasks: TaskType[] = ['generate', 'classify', 'extract', 'reason', 'draft'];
      for (const task of tasks) {
        const result = await router.routedChat(
          { model: '', messages: [{ role: 'user', content: 'test' }] },
          task
        );
        expect(result.message.role).toBe('assistant');
      }
    });
  });

  describe('Vision tier routing', () => {
    it('routes vision_fast to vision provider', async () => {
      const visionProvider = createMockProvider('vision');
      router.setVisionProvider(visionProvider, 'moondream2', 'qwen2.5-vl-3b');

      await router.routedChat(
        { model: '', messages: [{ role: 'user', content: 'what is this?' }] },
        'vision_fast'
      );
      expect(visionProvider.chat).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'moondream2' })
      );
    });

    it('routes vision_rich to vision provider with rich model', async () => {
      const visionProvider = createMockProvider('vision');
      router.setVisionProvider(visionProvider, 'moondream2', 'qwen2.5-vl-3b');

      await router.routedChat(
        { model: '', messages: [{ role: 'user', content: 'OCR this document' }] },
        'vision_rich'
      );
      expect(visionProvider.chat).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'qwen2.5-vl-3b' })
      );
    });

    it('isVisionReady returns false when no vision provider', () => {
      expect(router.isVisionReady()).toBe(false);
    });

    it('isVisionReady returns true when vision provider set', () => {
      const visionProvider = createMockProvider('vision');
      router.setVisionProvider(visionProvider, 'moondream2');
      expect(router.isVisionReady()).toBe(true);
    });
  });

  describe('Fast tier management', () => {
    it('isFastTierReady returns false initially', () => {
      expect(router.isFastTierReady()).toBe(false);
    });

    it('isFastTierReady returns true after setFastProvider', () => {
      const fastProvider = createMockProvider('fast');
      router.setFastProvider(fastProvider, 'smollm2-1.7b');
      expect(router.isFastTierReady()).toBe(true);
      expect(router.getFastModel()).toBe('smollm2-1.7b');
    });
  });

  describe('routeByTier', () => {
    it('returns fast tier for classify', () => {
      const fastProvider = createMockProvider('fast');
      router.setFastProvider(fastProvider, 'smollm2-1.7b');

      const result = router.routeByTier('classify');
      expect(result.tier).toBe('fast');
      expect(result.modelName).toBe('smollm2-1.7b');
    });

    it('returns primary tier for generate', () => {
      const result = router.routeByTier('generate');
      expect(result.tier).toBe('primary');
      expect(result.modelName).toBe('qwen3-8b');
    });

    it('returns vision tier for vision_fast', () => {
      const visionProvider = createMockProvider('vision');
      router.setVisionProvider(visionProvider, 'moondream2');

      const result = router.routeByTier('vision_fast');
      expect(result.tier).toBe('vision');
      expect(result.modelName).toBe('moondream2');
    });
  });

  describe('Model name helpers', () => {
    it('getModelForTask returns fast model for classify when available', () => {
      const fastProvider = createMockProvider('fast');
      router.setFastProvider(fastProvider, 'smollm2-1.7b');
      expect(router.getModelForTask('classify')).toBe('smollm2-1.7b');
    });

    it('getModelForTask returns reasoning model for generate', () => {
      expect(router.getModelForTask('generate')).toBe('qwen3-8b');
    });

    it('getModelForTask returns embedding model for embed task', () => {
      expect(router.getModelForTask('embed')).toBe('nomic-embed-text-v1.5');
    });

    it('getReasoningModel returns the reasoning model name', () => {
      expect(router.getReasoningModel()).toBe('qwen3-8b');
    });

    it('getEmbeddingModel returns the embedding model name', () => {
      expect(router.getEmbeddingModel()).toBe('nomic-embed-text-v1.5');
    });
  });

  describe('Provider swapping', () => {
    it('setReasoningProvider updates the reasoning backend', async () => {
      const newProvider = createMockProvider('new-reasoning');
      router.setReasoningProvider(newProvider, 'new-model');

      await router.chat({ model: '', messages: [{ role: 'user', content: 'test' }] });

      expect(newProvider.chat).toHaveBeenCalled();
      expect(router.getReasoningModel()).toBe('new-model');
    });

    it('setEmbeddingProvider updates the embedding backend', async () => {
      const newProvider = createMockProvider('new-embedding');
      router.setEmbeddingProvider(newProvider, 'new-embed');

      await router.embed({ model: '', input: 'test' });

      expect(newProvider.embed).toHaveBeenCalled();
      expect(router.getEmbeddingModel()).toBe('new-embed');
    });
  });

  describe('listModels', () => {
    it('combines models from both providers', async () => {
      (embeddingProvider.listModels as ReturnType<typeof vi.fn>).mockResolvedValue([
        { name: 'embed-model', size: 500, isEmbedding: true },
      ]);

      const models = await router.listModels();
      expect(models).toHaveLength(2);
      expect(models.map(m => m.name)).toContain('reasoning');
      expect(models.map(m => m.name)).toContain('embed-model');
    });

    it('deduplicates when providers are the same instance', async () => {
      const sameProvider = createMockProvider('shared');
      const singleRouter = new InferenceRouter({
        reasoningProvider: sameProvider,
        embeddingProvider: sameProvider,
        reasoningModel: 'model',
        embeddingModel: 'model',
      });

      const models = await singleRouter.listModels();
      const names = models.map(m => m.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe('chatStream', () => {
    it('streams from reasoning provider', async () => {
      async function* mockStream(): AsyncIterable<string> {
        yield 'Hello';
        yield ' world';
      }

      (reasoningProvider as any).chatStream = vi.fn().mockReturnValue(mockStream());

      const tokens: string[] = [];
      for await (const token of router.chatStream!({
        model: '', messages: [{ role: 'user', content: 'Hi' }],
      })) {
        tokens.push(token);
      }

      expect(tokens).toEqual(['Hello', ' world']);
    });
  });
});
