// Tests for enhanced SemanticSearch — SearchOptions with sourceTypes, minScore, dateRange.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SemanticSearch } from '@semblance/core/knowledge/search.js';
import { EmbeddingPipeline } from '@semblance/core/knowledge/embedding-pipeline.js';
import type { DocumentStore } from '@semblance/core/knowledge/document-store.js';
import type { VectorStore } from '@semblance/core/knowledge/vector-store.js';
import type { LLMProvider } from '@semblance/core/llm/types.js';
import type { Document, DocumentSource } from '@semblance/core/knowledge/types.js';

function makeDoc(id: string, source: DocumentSource, createdAt: string): Document {
  return {
    id,
    source,
    title: `Doc ${id}`,
    content: `Content of ${id}`,
    contentHash: `hash-${id}`,
    mimeType: 'text/plain',
    createdAt,
    updatedAt: createdAt,
    indexedAt: createdAt,
    metadata: {},
  };
}

function makeMockLLM(): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn(),
    chat: vi.fn(),
    embed: vi.fn().mockResolvedValue({
      embeddings: [Array(768).fill(0.1)],
      model: 'test',
      durationMs: 10,
    }),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn().mockResolvedValue(null),
  };
}

describe('SemanticSearch with SearchOptions', () => {
  let search: SemanticSearch;
  let mockLLM: LLMProvider;
  let mockDocStore: DocumentStore;
  let mockVectorStore: VectorStore;

  const docs = [
    makeDoc('email-1', 'email', '2025-06-01T00:00:00Z'),
    makeDoc('cal-1', 'calendar', '2025-07-01T00:00:00Z'),
    makeDoc('file-1', 'local_file', '2025-08-01T00:00:00Z'),
    makeDoc('note-1', 'note', '2025-09-01T00:00:00Z'),
  ];

  beforeEach(() => {
    mockLLM = makeMockLLM();

    mockDocStore = {
      getDocument: vi.fn().mockImplementation((id: string) => docs.find(d => d.id === id) ?? null),
    } as unknown as DocumentStore;

    mockVectorStore = {
      search: vi.fn().mockResolvedValue([
        { id: 'c1', documentId: 'email-1', content: 'email chunk', chunkIndex: 0, metadata: '{}', sourceType: 'email', sourceId: '', score: 0.95 },
        { id: 'c2', documentId: 'cal-1', content: 'cal chunk', chunkIndex: 0, metadata: '{}', sourceType: 'calendar', sourceId: '', score: 0.85 },
        { id: 'c3', documentId: 'file-1', content: 'file chunk', chunkIndex: 0, metadata: '{}', sourceType: 'local_file', sourceId: '', score: 0.60 },
        { id: 'c4', documentId: 'note-1', content: 'note chunk', chunkIndex: 0, metadata: '{}', sourceType: 'note', sourceId: '', score: 0.30 },
      ]),
    } as unknown as VectorStore;

    search = new SemanticSearch({
      llm: mockLLM,
      documentStore: mockDocStore,
      vectorStore: mockVectorStore,
      embeddingModel: 'test-embed',
    });
  });

  it('returns all results with default options', async () => {
    const results = await search.search('test query');
    expect(results).toHaveLength(4);
  });

  it('respects limit option', async () => {
    const results = await search.search('test query', { limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('filters by single source (legacy)', async () => {
    const results = await search.search('test query', { source: 'email' });
    expect(results).toHaveLength(1);
    expect(results[0]!.document.source).toBe('email');
  });

  it('filters by multiple sourceTypes', async () => {
    const results = await search.search('test query', {
      sourceTypes: ['email', 'calendar'],
    });
    expect(results).toHaveLength(2);
    expect(results.every(r => ['email', 'calendar'].includes(r.document.source))).toBe(true);
  });

  it('filters by minimum score', async () => {
    const results = await search.search('test query', { minScore: 0.7 });
    expect(results).toHaveLength(2);
    expect(results.every(r => r.score >= 0.7)).toBe(true);
  });

  it('filters by date range (from)', async () => {
    const results = await search.search('test query', {
      dateRange: { from: '2025-07-15T00:00:00Z' },
    });
    // Only file-1 (Aug) and note-1 (Sep) are after Jul 15
    expect(results).toHaveLength(2);
  });

  it('filters by date range (to)', async () => {
    const results = await search.search('test query', {
      dateRange: { to: '2025-07-15T00:00:00Z' },
    });
    // email-1 (Jun) and cal-1 (Jul 1) are before Jul 15
    expect(results).toHaveLength(2);
  });

  it('filters by date range (from + to)', async () => {
    const results = await search.search('test query', {
      dateRange: {
        from: '2025-06-15T00:00:00Z',
        to: '2025-08-15T00:00:00Z',
      },
    });
    // cal-1 (Jul) and file-1 (Aug) are within range
    expect(results).toHaveLength(2);
  });

  it('combines minScore and sourceTypes filters', async () => {
    const results = await search.search('test query', {
      sourceTypes: ['email', 'local_file', 'note'],
      minScore: 0.5,
    });
    // email-1 (0.95) and file-1 (0.60) pass both filters; note-1 (0.30) fails minScore
    expect(results).toHaveLength(2);
  });

  it('uses EmbeddingPipeline when provided', async () => {
    const pipelineLLM = makeMockLLM();
    const pipeline = new EmbeddingPipeline({
      llm: pipelineLLM,
      model: 'nomic-embed-text-v1.5',
      dimensions: 768,
    });

    const pipelineSearch = new SemanticSearch({
      llm: mockLLM,
      documentStore: mockDocStore,
      vectorStore: mockVectorStore,
      embeddingModel: 'test',
      embeddingPipeline: pipeline,
    });

    await pipelineSearch.search('test');
    // Pipeline's LLM was used, not the search's direct LLM
    expect(pipelineLLM.embed).toHaveBeenCalled();
    expect(mockLLM.embed).not.toHaveBeenCalled();
  });

  it('returns empty array when embedding returns nothing', async () => {
    const emptyLLM = makeMockLLM();
    (emptyLLM.embed as ReturnType<typeof vi.fn>).mockResolvedValue({
      embeddings: [],
      model: 'test',
      durationMs: 0,
    });

    const emptySearch = new SemanticSearch({
      llm: emptyLLM,
      documentStore: mockDocStore,
      vectorStore: mockVectorStore,
      embeddingModel: 'test',
    });

    const results = await emptySearch.search('test');
    expect(results).toHaveLength(0);
  });
});
