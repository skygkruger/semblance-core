// Tests for InferenceRouter — task-based routing, fallback, provider delegation.

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
      reasoningModel: 'qwen2.5-7b',
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
        expect.objectContaining({ model: 'qwen2.5-7b' })
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
    it('routedChat routes classify to reasoning provider', async () => {
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

    it('routedGenerate routes extract to reasoning provider', async () => {
      await router.routedGenerate(
        { model: '', prompt: 'extract data' },
        'extract'
      );
      expect(reasoningProvider.generate).toHaveBeenCalled();
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

  describe('Model name helpers', () => {
    it('getModelForTask returns reasoning model for non-embed tasks', () => {
      expect(router.getModelForTask('generate')).toBe('qwen2.5-7b');
      expect(router.getModelForTask('classify')).toBe('qwen2.5-7b');
      expect(router.getModelForTask('reason')).toBe('qwen2.5-7b');
    });

    it('getModelForTask returns embedding model for embed task', () => {
      expect(router.getModelForTask('embed')).toBe('nomic-embed-text-v1.5');
    });

    it('getReasoningModel returns the reasoning model name', () => {
      expect(router.getReasoningModel()).toBe('qwen2.5-7b');
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
      // Should not have duplicates
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
