// Tests for NativeProvider — LLMProvider backed by mocked NativeRuntimeBridge.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NativeProvider } from '@semblance/core/llm/native-provider.js';
import type { NativeRuntimeBridge, NativeBridgeStatus } from '@semblance/core/llm/native-bridge-types.js';

function createMockBridge(overrides: Partial<NativeRuntimeBridge> = {}): NativeRuntimeBridge {
  return {
    generate: vi.fn().mockResolvedValue({
      text: 'Hello world',
      tokensGenerated: 2,
      durationMs: 100,
    }),
    embed: vi.fn().mockResolvedValue({
      embeddings: [[0.1, 0.2, 0.3]],
      dimensions: 3,
      durationMs: 50,
    }),
    loadModel: vi.fn().mockResolvedValue(undefined),
    loadEmbeddingModel: vi.fn().mockResolvedValue(undefined),
    unloadModel: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({
      status: 'ready',
      reasoningModel: 'qwen2.5-7b',
      embeddingModel: 'nomic-embed-text-v1.5',
    } as NativeBridgeStatus),
    isReady: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('NativeProvider', () => {
  let bridge: NativeRuntimeBridge;
  let provider: NativeProvider;

  beforeEach(() => {
    bridge = createMockBridge();
    provider = new NativeProvider({ bridge });
  });

  describe('isAvailable', () => {
    it('returns true when bridge is ready', async () => {
      expect(await provider.isAvailable()).toBe(true);
    });

    it('returns false when bridge is not ready', async () => {
      bridge = createMockBridge({ isReady: vi.fn().mockResolvedValue(false) });
      provider = new NativeProvider({ bridge });
      expect(await provider.isAvailable()).toBe(false);
    });

    it('returns false when bridge throws', async () => {
      bridge = createMockBridge({ isReady: vi.fn().mockRejectedValue(new Error('fail')) });
      provider = new NativeProvider({ bridge });
      expect(await provider.isAvailable()).toBe(false);
    });
  });

  describe('generate', () => {
    it('delegates to bridge.generate', async () => {
      const result = await provider.generate({
        model: 'test-model',
        prompt: 'Hello',
        temperature: 0.5,
        maxTokens: 100,
      });

      expect(bridge.generate).toHaveBeenCalledWith({
        prompt: 'Hello',
        systemPrompt: undefined,
        maxTokens: 100,
        temperature: 0.5,
        stop: undefined,
      });
      expect(result.text).toBe('Hello world');
      expect(result.model).toBe('test-model');
      expect(result.durationMs).toBe(100);
    });

    it('passes system prompt', async () => {
      await provider.generate({
        model: 'test',
        prompt: 'Hi',
        system: 'You are helpful',
      });

      expect(bridge.generate).toHaveBeenCalledWith(
        expect.objectContaining({ systemPrompt: 'You are helpful' })
      );
    });
  });

  describe('chat', () => {
    it('converts messages to prompt and generates', async () => {
      const result = await provider.chat({
        model: 'test-model',
        messages: [
          { role: 'system', content: 'Be helpful' },
          { role: 'user', content: 'Hello' },
        ],
      });

      expect(bridge.generate).toHaveBeenCalled();
      expect(result.message.role).toBe('assistant');
      expect(result.message.content).toBe('Hello world');
      expect(result.model).toBe('test-model');
    });

    it('uses default model name when not specified', async () => {
      provider = new NativeProvider({ bridge, modelName: 'my-model' });
      const result = await provider.chat({
        model: '',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.model).toBe('my-model');
    });
  });

  describe('chatStream', () => {
    it('falls back to non-streaming when generateStream not available', async () => {
      const tokens: string[] = [];
      for await (const token of provider.chatStream!({
        model: 'test',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        tokens.push(token);
      }

      // Should yield the entire response as one chunk
      expect(tokens).toEqual(['Hello world']);
    });

    it('streams tokens when generateStream is available', async () => {
      async function* mockStream() {
        yield 'Hello';
        yield ' ';
        yield 'world';
      }

      bridge = createMockBridge({
        generateStream: vi.fn().mockReturnValue(mockStream()),
      });
      provider = new NativeProvider({ bridge });

      const tokens: string[] = [];
      for await (const token of provider.chatStream!({
        model: 'test',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        tokens.push(token);
      }

      expect(tokens).toEqual(['Hello', ' ', 'world']);
    });
  });

  describe('embed', () => {
    it('handles single string input', async () => {
      const result = await provider.embed({
        model: 'test-embed',
        input: 'hello',
      });

      expect(bridge.embed).toHaveBeenCalledWith({ input: ['hello'] });
      expect(result.embeddings).toEqual([[0.1, 0.2, 0.3]]);
      expect(result.model).toBe('test-embed');
    });

    it('handles array input', async () => {
      const result = await provider.embed({
        model: 'test-embed',
        input: ['hello', 'world'],
      });

      expect(bridge.embed).toHaveBeenCalledWith({ input: ['hello', 'world'] });
    });

    it('uses default embedding model name when not specified', async () => {
      provider = new NativeProvider({ bridge, embeddingModelName: 'my-embed' });
      const result = await provider.embed({
        model: '',
        input: 'test',
      });

      expect(result.model).toBe('my-embed');
    });
  });

  describe('listModels', () => {
    it('returns loaded models from bridge status', async () => {
      const models = await provider.listModels();
      expect(models).toHaveLength(2);

      const reasoning = models.find(m => !m.isEmbedding)!;
      expect(reasoning.name).toBe('qwen2.5-7b');

      const embedding = models.find(m => m.isEmbedding)!;
      expect(embedding.name).toBe('nomic-embed-text-v1.5');
    });

    it('returns empty when no models loaded', async () => {
      bridge = createMockBridge({
        getStatus: vi.fn().mockResolvedValue({
          status: 'uninitialized',
          reasoningModel: null,
          embeddingModel: null,
        }),
      });
      provider = new NativeProvider({ bridge });

      const models = await provider.listModels();
      expect(models).toHaveLength(0);
    });
  });

  describe('getModel', () => {
    it('finds loaded model by name', async () => {
      const model = await provider.getModel('qwen2.5-7b');
      expect(model).not.toBeNull();
      expect(model!.name).toBe('qwen2.5-7b');
    });

    it('returns null for unknown model', async () => {
      const model = await provider.getModel('nonexistent');
      expect(model).toBeNull();
    });
  });
});
