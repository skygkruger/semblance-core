// Tests for EmbeddingPipeline — batch processing, retry logic, dimension validation.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingPipeline } from '@semblance/core/knowledge/embedding-pipeline.js';
import type { LLMProvider, EmbedResponse } from '@semblance/core/llm/types.js';

function makeMockLLM(embedFn?: (input: string | string[]) => EmbedResponse): LLMProvider {
  const defaultEmbed = (input: string | string[]): EmbedResponse => {
    const texts = Array.isArray(input) ? input : [input];
    return {
      embeddings: texts.map(() => Array(768).fill(0.1)),
      model: 'nomic-embed-text',
      durationMs: 10,
    };
  };
  const fn = embedFn ?? defaultEmbed;
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn().mockResolvedValue({ text: '', model: 'test', tokensUsed: { prompt: 0, completion: 0, total: 0 }, durationMs: 0 }),
    chat: vi.fn().mockResolvedValue({ message: { role: 'assistant', content: '' }, model: 'test', tokensUsed: { prompt: 0, completion: 0, total: 0 }, durationMs: 0 }),
    embed: vi.fn().mockImplementation(async (req: { input: string | string[] }) => fn(req.input)),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn().mockResolvedValue(null),
  };
}

describe('EmbeddingPipeline', () => {
  let pipeline: EmbeddingPipeline;
  let mockLLM: LLMProvider;

  beforeEach(() => {
    mockLLM = makeMockLLM();
    pipeline = new EmbeddingPipeline({
      llm: mockLLM,
      model: 'nomic-embed-text-v1.5',
      dimensions: 768,
      batchSize: 4,
      maxRetries: 2,
      retryDelayMs: 10, // fast retries for tests
    });
  });

  it('reports correct dimensions and model', () => {
    expect(pipeline.getDimensions()).toBe(768);
    expect(pipeline.getModel()).toBe('nomic-embed-text-v1.5');
  });

  it('embeds a single text', async () => {
    const embedding = await pipeline.embedSingle('hello world');
    expect(embedding).toHaveLength(768);
    expect(mockLLM.embed).toHaveBeenCalledTimes(1);
  });

  it('returns empty result for empty batch', async () => {
    const result = await pipeline.embedBatch([]);
    expect(result.embeddings).toHaveLength(0);
    expect(result.batchesProcessed).toBe(0);
    expect(mockLLM.embed).not.toHaveBeenCalled();
  });

  it('processes small batch in single call', async () => {
    const result = await pipeline.embedBatch(['a', 'b', 'c']);
    expect(result.embeddings).toHaveLength(3);
    expect(result.batchesProcessed).toBe(1);
    expect(mockLLM.embed).toHaveBeenCalledTimes(1);
  });

  it('splits large input into multiple batches', async () => {
    const texts = Array.from({ length: 10 }, (_, i) => `text-${i}`);
    const result = await pipeline.embedBatch(texts);
    expect(result.embeddings).toHaveLength(10);
    expect(result.batchesProcessed).toBe(3); // 4 + 4 + 2
    expect(mockLLM.embed).toHaveBeenCalledTimes(3);
  });

  it('reports progress during batch processing', async () => {
    const progress: Array<{ processedTexts: number; totalTexts: number }> = [];
    const texts = Array.from({ length: 6 }, (_, i) => `text-${i}`);

    await pipeline.embedBatch(texts, (p) => {
      progress.push({ processedTexts: p.processedTexts, totalTexts: p.totalTexts });
    });

    // Should have progress updates: before each batch + final
    expect(progress.length).toBeGreaterThanOrEqual(3);
    expect(progress[progress.length - 1]!.processedTexts).toBe(6);
  });

  it('retries on transient failure', async () => {
    let callCount = 0;
    const flakyLLM = makeMockLLM((input) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('transient network error');
      }
      const texts = Array.isArray(input) ? input : [input];
      return {
        embeddings: texts.map(() => Array(768).fill(0.1)),
        model: 'nomic-embed-text',
        durationMs: 10,
      };
    });

    const retryPipeline = new EmbeddingPipeline({
      llm: flakyLLM,
      model: 'test',
      dimensions: 768,
      maxRetries: 2,
      retryDelayMs: 10,
    });

    const result = await retryPipeline.embedBatch(['a']);
    expect(result.embeddings).toHaveLength(1);
    expect(result.retriesUsed).toBe(1);
  });

  it('throws after exhausting retries', async () => {
    const failingLLM = makeMockLLM(() => {
      throw new Error('permanent failure');
    });

    const failPipeline = new EmbeddingPipeline({
      llm: failingLLM,
      model: 'test',
      dimensions: 768,
      maxRetries: 1,
      retryDelayMs: 10,
    });

    await expect(failPipeline.embedBatch(['a'])).rejects.toThrow('permanent failure');
  });

  it('validates embedding dimensions', async () => {
    const wrongDimLLM = makeMockLLM((input) => {
      const texts = Array.isArray(input) ? input : [input];
      return {
        embeddings: texts.map(() => Array(384).fill(0.1)), // wrong dimensions
        model: 'test',
        durationMs: 10,
      };
    });

    const dimPipeline = new EmbeddingPipeline({
      llm: wrongDimLLM,
      model: 'test',
      dimensions: 768,
      maxRetries: 0,
      retryDelayMs: 10,
    });

    await expect(dimPipeline.embedBatch(['a'])).rejects.toThrow('Dimension mismatch');
  });

  it('tracks duration across batches', async () => {
    const texts = Array.from({ length: 5 }, (_, i) => `text-${i}`);
    const result = await pipeline.embedBatch(texts);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.batchesProcessed).toBe(2); // 4 + 1
  });
});
