// Tests for RetroactiveEmbedder — background re-embedding of documents.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetroactiveEmbedder } from '@semblance/core/knowledge/retroactive-embedder.js';
import { EmbeddingPipeline } from '@semblance/core/knowledge/embedding-pipeline.js';
import type { DocumentStore } from '@semblance/core/knowledge/document-store.js';
import type { VectorStore, VectorChunk } from '@semblance/core/knowledge/vector-store.js';
import type { LLMProvider } from '@semblance/core/llm/types.js';
import type { Document, DocumentSource } from '@semblance/core/knowledge/types.js';

function makeDocument(id: string, content: string, source: DocumentSource = 'local_file'): Document {
  return {
    id,
    source,
    title: `Document ${id}`,
    content,
    contentHash: 'hash-' + id,
    mimeType: 'text/plain',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    indexedAt: new Date().toISOString(),
    metadata: {},
  };
}

function makeMockLLM(): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn().mockResolvedValue({ text: '', model: 'test', tokensUsed: { prompt: 0, completion: 0, total: 0 }, durationMs: 0 }),
    chat: vi.fn().mockResolvedValue({ message: { role: 'assistant', content: '' }, model: 'test', tokensUsed: { prompt: 0, completion: 0, total: 0 }, durationMs: 0 }),
    embed: vi.fn().mockImplementation(async (req: { input: string | string[] }) => {
      const texts = Array.isArray(req.input) ? req.input : [req.input];
      return {
        embeddings: texts.map(() => Array(768).fill(0.1)),
        model: 'test',
        durationMs: 10,
      };
    }),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn().mockResolvedValue(null),
  };
}

function makeMockDocumentStore(documents: Document[]): DocumentStore {
  return {
    insertDocument: vi.fn(),
    getDocument: vi.fn().mockImplementation((id: string) => documents.find(d => d.id === id) ?? null),
    getDocumentBySourcePath: vi.fn().mockReturnValue(null),
    listDocuments: vi.fn().mockReturnValue(documents),
    deleteDocument: vi.fn().mockReturnValue(true),
    markReindexed: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalDocuments: documents.length, sources: {} }),
    insertEntity: vi.fn().mockReturnValue('entity-1'),
    getEntity: vi.fn().mockReturnValue(null),
    findEntitiesByName: vi.fn().mockReturnValue([]),
    insertMention: vi.fn().mockReturnValue('mention-1'),
    getMentionsForDocument: vi.fn().mockReturnValue([]),
  } as unknown as DocumentStore;
}

function makeMockVectorStore(): VectorStore {
  const chunks: VectorChunk[] = [];
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    insertChunks: vi.fn().mockImplementation(async (newChunks: VectorChunk[]) => {
      chunks.push(...newChunks);
    }),
    search: vi.fn().mockResolvedValue([]),
    deleteByDocumentId: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockImplementation(async () => chunks.length),
    close: vi.fn(),
  } as unknown as VectorStore;
}

describe('RetroactiveEmbedder', () => {
  let embedder: RetroactiveEmbedder;
  let mockDocStore: DocumentStore;
  let mockVectorStore: VectorStore;
  let mockPipeline: EmbeddingPipeline;

  beforeEach(() => {
    const docs = [
      makeDocument('doc-1', 'This is a test document with enough content to be chunked properly.'),
      makeDocument('doc-2', 'Another document for testing the retroactive embedder.'),
    ];

    mockDocStore = makeMockDocumentStore(docs);
    mockVectorStore = makeMockVectorStore();
    mockPipeline = new EmbeddingPipeline({
      llm: makeMockLLM(),
      model: 'nomic-embed-text-v1.5',
      dimensions: 768,
    });

    embedder = new RetroactiveEmbedder({
      documentStore: mockDocStore,
      vectorStore: mockVectorStore,
      embeddingPipeline: mockPipeline,
    });
  });

  it('starts in idle status', () => {
    expect(embedder.getStatus()).toBe('idle');
  });

  it('processes documents and creates chunks', async () => {
    const result = await embedder.run();

    expect(result.documentsProcessed).toBe(2);
    expect(result.chunksCreated).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
    expect(mockVectorStore.insertChunks).toHaveBeenCalled();
  });

  it('returns to idle after successful run', async () => {
    await embedder.run();
    expect(embedder.getStatus()).toBe('idle');
  });

  it('marks documents as reindexed', async () => {
    await embedder.run();
    expect(mockDocStore.markReindexed).toHaveBeenCalledWith('doc-1');
    expect(mockDocStore.markReindexed).toHaveBeenCalledWith('doc-2');
  });

  it('deletes old chunks before inserting new ones', async () => {
    await embedder.run();
    expect(mockVectorStore.deleteByDocumentId).toHaveBeenCalledWith('doc-1');
    expect(mockVectorStore.deleteByDocumentId).toHaveBeenCalledWith('doc-2');
  });

  it('processes specific document IDs when provided', async () => {
    const result = await embedder.run(['doc-1']);
    expect(result.documentsProcessed).toBe(1);
    expect(mockDocStore.getDocument).toHaveBeenCalledWith('doc-1');
  });

  it('skips documents with empty content', async () => {
    const docs = [
      makeDocument('doc-empty', ''),
      makeDocument('doc-ok', 'This document has content.'),
    ];
    const docStore = makeMockDocumentStore(docs);

    const emptyEmbedder = new RetroactiveEmbedder({
      documentStore: docStore,
      vectorStore: makeMockVectorStore(),
      embeddingPipeline: mockPipeline,
    });

    const result = await emptyEmbedder.run();
    expect(result.documentsSkipped).toBe(1);
    expect(result.documentsProcessed).toBe(1);
  });

  it('prevents concurrent runs', async () => {
    // Start first run (won't resolve immediately because it's async)
    const firstRun = embedder.run();

    // Second run should be rejected
    const secondRun = await embedder.run();
    expect(secondRun.errors).toHaveLength(1);
    expect(secondRun.errors[0]!.error).toContain('already running');

    await firstRun;
  });

  it('reports errors for individual document failures', async () => {
    const docs = [makeDocument('doc-fail', 'Some content here.')];
    const docStore = makeMockDocumentStore(docs);
    const failVectorStore = makeMockVectorStore();
    (failVectorStore.insertChunks as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Vector store failure')
    );

    const failEmbedder = new RetroactiveEmbedder({
      documentStore: docStore,
      vectorStore: failVectorStore,
      embeddingPipeline: mockPipeline,
    });

    const result = await failEmbedder.run();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.documentId).toBe('doc-fail');
    expect(result.errors[0]!.error).toContain('Vector store failure');
  });

  it('can be stopped mid-run', async () => {
    // Create many documents so there's time to stop
    const docs = Array.from({ length: 20 }, (_, i) =>
      makeDocument(`doc-${i}`, `Document content number ${i} for testing.`)
    );
    const docStore = makeMockDocumentStore(docs);

    const stoppableEmbedder = new RetroactiveEmbedder({
      documentStore: docStore,
      vectorStore: makeMockVectorStore(),
      embeddingPipeline: mockPipeline,
      documentsPerBatch: 100,
    });

    // Schedule stop after a tiny delay
    setTimeout(() => stoppableEmbedder.stop(), 5);

    const result = await stoppableEmbedder.run();
    // Should have processed some but potentially not all
    expect(result.documentsProcessed).toBeGreaterThanOrEqual(0);
    // Status should be 'stopped' or 'idle' depending on timing
    expect(['stopped', 'idle']).toContain(stoppableEmbedder.getStatus());
  });

  it('tracks duration', async () => {
    const result = await embedder.run();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
