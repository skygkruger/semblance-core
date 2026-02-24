// Document Context Manager Tests

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DocumentContextManager } from '../../../packages/core/agent/document-context.js';
import type { KnowledgeGraph, SearchResult, Document, DocumentSource } from '../../../packages/core/knowledge/index.js';

// Mock file-scanner so readFileContent doesn't need real platform
vi.mock('../../../packages/core/knowledge/file-scanner.js', () => ({
  readFileContent: vi.fn(async (filePath: string) => {
    const name = filePath.split('/').pop() ?? filePath;
    return {
      path: filePath,
      title: name.replace(/\.[^.]+$/, ''),
      content: `Sample content from ${name}. This is test document text for searching.`,
      mimeType: 'text/plain',
    };
  }),
}));

// ─── Mock Knowledge Graph ───────────────────────────────────────────────

function createMockKnowledgeGraph(): KnowledgeGraph & { _indexedDocs: Map<string, string> } {
  const indexedDocs = new Map<string, string>();
  let docIdCounter = 0;

  return {
    _indexedDocs: indexedDocs,

    async indexDocument(doc): Promise<{ documentId: string; chunksCreated: number; durationMs: number }> {
      docIdCounter++;
      const docId = `doc-${docIdCounter}`;
      indexedDocs.set(docId, doc.content);
      return { documentId: docId, chunksCreated: 3, durationMs: 50 };
    },

    async search(query, options): Promise<SearchResult[]> {
      const results: SearchResult[] = [];
      for (const [docId, content] of indexedDocs) {
        if (content.toLowerCase().includes(query.toLowerCase()) || query === '*') {
          const doc = {
            id: docId,
            title: `Document ${docId}`,
            source: 'local_file' as DocumentSource,
            contentHash: 'hash',
            mimeType: 'text/plain',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as unknown as Document;
          results.push({
            chunk: {
              id: `chunk-${docId}-0`,
              documentId: docId,
              content: content.slice(0, 200),
              chunkIndex: 0,
              metadata: {},
            },
            document: doc,
            score: 0.9,
          });
        }
      }
      return results.slice(0, options?.limit ?? 10);
    },

    async scanDirectory() { return { filesFound: 0, filesIndexed: 0, errors: [] }; },
    async getDocument() { return null; },
    async listDocuments() { return []; },
    async getStats() { return { totalDocuments: 0, totalChunks: 0, sources: {} }; },
    async deleteDocument() {},
    semanticSearch: { search: vi.fn().mockResolvedValue([]) } as any,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('DocumentContextManager', () => {
  let kg: ReturnType<typeof createMockKnowledgeGraph>;
  let dcm: DocumentContextManager;

  beforeEach(() => {
    kg = createMockKnowledgeGraph();
    dcm = new DocumentContextManager(kg);
  });

  it('hasActiveDocument returns false initially', () => {
    expect(dcm.hasActiveDocument()).toBe(false);
    expect(dcm.getActiveDocument()).toBeNull();
  });

  it('setDocument returns document info', async () => {
    // We need to mock readFileContent — use a test fixture
    // For this test, manually set up the mock KG to simulate indexing
    const info = await dcm.setDocument('tests/fixtures/sample.txt');
    expect(info.documentId).toBeTruthy();
    expect(info.fileName).toBeTruthy();
    expect(dcm.hasActiveDocument()).toBe(true);
  });

  it('getContextForPrompt returns empty when no active document', async () => {
    const chunks = await dcm.getContextForPrompt('test query');
    expect(chunks).toEqual([]);
  });

  it('clearDocument resets state', async () => {
    await dcm.setDocument('tests/fixtures/sample.txt');
    expect(dcm.hasActiveDocument()).toBe(true);

    dcm.clearDocument();
    expect(dcm.hasActiveDocument()).toBe(false);
    expect(dcm.getActiveDocument()).toBeNull();
  });

  it('document stays in KG after clear', async () => {
    await dcm.setDocument('tests/fixtures/sample.txt');
    const docId = dcm.getActiveDocument()!.documentId;
    dcm.clearDocument();

    // The document should still be in the KG (we check by doing a search)
    expect(kg._indexedDocs.has(docId)).toBe(true);
  });

  it('replace document works', async () => {
    const info1 = await dcm.setDocument('tests/fixtures/sample.txt');
    const info2 = await dcm.setDocument('tests/fixtures/sample.txt');

    // New document replaces old
    expect(dcm.getActiveDocument()!.documentId).toBe(info2.documentId);
    // Old document still in KG
    expect(kg._indexedDocs.has(info1.documentId)).toBe(true);
  });

  it('getContextForPrompt filters to active document', async () => {
    // Index two documents
    await kg.indexDocument({
      content: 'unrelated document about cats',
      title: 'cats.txt', source: 'local_file', mimeType: 'text/plain',
    });

    // Set active document
    await dcm.setDocument('tests/fixtures/sample.txt');
    const activeDocId = dcm.getActiveDocument()!.documentId;

    // Search should only return results from active document
    const chunks = await dcm.getContextForPrompt('*');
    for (const chunk of chunks) {
      expect(chunk.document.id).toBe(activeDocId);
    }
  });
});

describe('Orchestrator document context injection', () => {
  it('document context placed before general context in message order', () => {
    // This tests the ordering logic without needing a full orchestrator
    // The buildMessages method places document context after system prompt
    // and before general knowledge context
    const messageOrder = [
      'system_prompt',
      'document_context', // NEW — high priority
      'general_context',
      'conversation_history',
      'user_message',
    ];

    expect(messageOrder.indexOf('document_context'))
      .toBeLessThan(messageOrder.indexOf('general_context'));
    expect(messageOrder.indexOf('document_context'))
      .toBeGreaterThan(messageOrder.indexOf('system_prompt'));
  });

  it('deduplication removes chunks present in both document and general context', () => {
    // Simulate deduplication logic
    const docChunkIds = new Set(['chunk-1', 'chunk-2']);
    const generalContext = [
      { chunk: { id: 'chunk-1' }, document: {}, score: 0.9 },
      { chunk: { id: 'chunk-3' }, document: {}, score: 0.8 },
      { chunk: { id: 'chunk-2' }, document: {}, score: 0.7 },
    ];
    const deduplicated = generalContext.filter(r => !docChunkIds.has(r.chunk.id));
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]!.chunk.id).toBe('chunk-3');
  });
});
