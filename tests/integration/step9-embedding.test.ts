// Integration: Step 9 Embedding — Pipeline, semantic search, retroactive embedder.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { EmbeddingPipeline } from '@semblance/core/knowledge/embedding-pipeline.js';
import { RetroactiveEmbedder } from '@semblance/core/knowledge/retroactive-embedder.js';
import type { LLMProvider } from '@semblance/core/llm/types.js';

const ROOT = join(import.meta.dirname, '..', '..');

function makeMockLLM(): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn(),
    chat: vi.fn(),
    embed: vi.fn().mockImplementation(async (req: { input: string | string[] }) => {
      const texts = Array.isArray(req.input) ? req.input : [req.input];
      return { embeddings: texts.map(() => Array(768).fill(0.1)), model: 'test', durationMs: 10 };
    }),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn().mockResolvedValue(null),
  };
}

describe('Step 9: Embedding Pipeline Integration', () => {
  it('embedding-pipeline.ts exists', () => {
    const path = join(ROOT, 'packages', 'core', 'knowledge', 'embedding-pipeline.ts');
    expect(existsSync(path)).toBe(true);
  });

  it('EmbeddingPipeline class can be instantiated', () => {
    const pipeline = new EmbeddingPipeline({
      llm: makeMockLLM(),
      model: 'nomic-embed-text-v1.5',
      dimensions: 768,
    });
    expect(pipeline.getDimensions()).toBe(768);
    expect(pipeline.getModel()).toBe('nomic-embed-text-v1.5');
  });

  it('embeds batch and returns correct dimensions', async () => {
    const pipeline = new EmbeddingPipeline({
      llm: makeMockLLM(),
      model: 'test',
      dimensions: 768,
    });
    const result = await pipeline.embedBatch(['hello', 'world']);
    expect(result.embeddings).toHaveLength(2);
    expect(result.embeddings[0]).toHaveLength(768);
    expect(result.embeddings[1]).toHaveLength(768);
  });

  it('uses 768 dimensions matching VectorStore default', () => {
    const vectorStorePath = join(ROOT, 'packages', 'core', 'knowledge', 'vector-store.ts');
    const content = readFileSync(vectorStorePath, 'utf-8');
    expect(content).toContain('dimensions: number = 768');
  });
});

describe('Step 9: Retroactive Embedder Integration', () => {
  it('retroactive-embedder.ts exists', () => {
    const path = join(ROOT, 'packages', 'core', 'knowledge', 'retroactive-embedder.ts');
    expect(existsSync(path)).toBe(true);
  });

  it('RetroactiveEmbedder starts in idle status', () => {
    const embedder = new RetroactiveEmbedder({
      documentStore: { listDocuments: vi.fn().mockReturnValue([]), getDocument: vi.fn(), markReindexed: vi.fn() } as any,
      vectorStore: { insertChunks: vi.fn(), deleteByDocumentId: vi.fn(), count: vi.fn().mockResolvedValue(0) } as any,
      embeddingPipeline: new EmbeddingPipeline({ llm: makeMockLLM(), model: 'test', dimensions: 768 }),
    });
    expect(embedder.getStatus()).toBe('idle');
  });
});

describe('Step 9: Semantic Search Enhancements', () => {
  const searchPath = join(ROOT, 'packages', 'core', 'knowledge', 'search.ts');

  it('search.ts exports SearchOptions type', () => {
    const content = readFileSync(searchPath, 'utf-8');
    expect(content).toContain('export interface SearchOptions');
  });

  it('SearchOptions supports sourceTypes filter', () => {
    const content = readFileSync(searchPath, 'utf-8');
    expect(content).toContain('sourceTypes');
  });

  it('SearchOptions supports minScore filter', () => {
    const content = readFileSync(searchPath, 'utf-8');
    expect(content).toContain('minScore');
  });

  it('SearchOptions supports dateRange filter', () => {
    const content = readFileSync(searchPath, 'utf-8');
    expect(content).toContain('dateRange');
  });

  it('SemanticSearch can use EmbeddingPipeline', () => {
    const content = readFileSync(searchPath, 'utf-8');
    expect(content).toContain('embeddingPipeline');
  });
});

describe('Step 9: VectorStore Enhancements', () => {
  const vstorePath = join(ROOT, 'packages', 'core', 'knowledge', 'vector-store.ts');

  it('VectorChunk has sourceType field', () => {
    const content = readFileSync(vstorePath, 'utf-8');
    expect(content).toContain('sourceType');
  });

  it('VectorChunk has sourceId field', () => {
    const content = readFileSync(vstorePath, 'utf-8');
    expect(content).toContain('sourceId');
  });

  it('search method accepts sourceTypes filter', () => {
    const content = readFileSync(vstorePath, 'utf-8');
    expect(content).toContain('sourceTypes');
  });
});
