// Multi-file DocumentContextManager tests.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentContextManager } from '../../../packages/core/agent/document-context';
import type { KnowledgeGraph, SearchResult } from '../../../packages/core/knowledge/index';

function makeMockKG(): KnowledgeGraph {
  let docCounter = 0;
  return {
    indexDocument: vi.fn(async (doc: { title: string }) => ({
      documentId: `doc_${++docCounter}`,
      chunksCreated: 3,
      durationMs: 10,
    })),
    search: vi.fn(async () => [] as SearchResult[]),
    scanDirectory: vi.fn(async () => ({ filesFound: 0, filesIndexed: 0, errors: [] })),
    getDocument: vi.fn(async () => null),
    listDocuments: vi.fn(async () => []),
    getStats: vi.fn(async () => ({ totalDocuments: 0, totalChunks: 0, sources: {} })),
    deleteDocument: vi.fn(async () => {}),
    semanticSearch: {} as KnowledgeGraph['semanticSearch'],
  } as unknown as KnowledgeGraph;
}

// Mock file reading
vi.mock('../../../packages/core/knowledge/file-scanner', () => ({
  readFileContent: vi.fn(async (filePath: string) => {
    const name = filePath.split('/').pop() ?? filePath;
    return {
      path: filePath,
      title: name.replace(/\.[^.]+$/, ''),
      content: `Content of ${name}`,
      mimeType: 'text/plain',
    };
  }),
}));

describe('DocumentContextManager (multi-file)', () => {
  let kg: KnowledgeGraph;
  let mgr: DocumentContextManager;

  beforeEach(() => {
    kg = makeMockKG();
    mgr = new DocumentContextManager(kg);
  });

  it('starts with no active documents', () => {
    expect(mgr.hasActiveDocument()).toBe(false);
    expect(mgr.getActiveDocuments()).toHaveLength(0);
    expect(mgr.getDocumentCount()).toBe(0);
  });

  it('addDocument indexes file and tracks it', async () => {
    const info = await mgr.addDocument('/docs/readme.md');
    expect(info.documentId).toBe('doc_1');
    expect(info.fileName).toBe('readme');
    expect(info.chunksCreated).toBe(3);
    expect(mgr.hasActiveDocument()).toBe(true);
    expect(mgr.getDocumentCount()).toBe(1);
    expect(kg.indexDocument).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'chat_attachment' }),
    );
  });

  it('addDocument supports multiple files', async () => {
    await mgr.addDocument('/docs/a.txt');
    await mgr.addDocument('/docs/b.txt');
    await mgr.addDocument('/docs/c.txt');
    expect(mgr.getDocumentCount()).toBe(3);
    expect(mgr.getActiveDocuments()).toHaveLength(3);
  });

  it('addDocument deduplicates by file path', async () => {
    const first = await mgr.addDocument('/docs/a.txt');
    const second = await mgr.addDocument('/docs/a.txt');
    expect(first).toBe(second);
    expect(mgr.getDocumentCount()).toBe(1);
  });

  it('addDocument throws at MAX_ATTACHMENTS capacity', async () => {
    for (let i = 0; i < 10; i++) {
      await mgr.addDocument(`/docs/file${i}.txt`);
    }
    await expect(mgr.addDocument('/docs/toomany.txt')).rejects.toThrow('Maximum 10');
  });

  it('removeDocument removes by ID', async () => {
    const info = await mgr.addDocument('/docs/a.txt');
    expect(mgr.removeDocument(info.documentId)).toBe(true);
    expect(mgr.getDocumentCount()).toBe(0);
  });

  it('removeDocument returns false for unknown ID', () => {
    expect(mgr.removeDocument('nonexistent')).toBe(false);
  });

  it('getActiveDocument returns first document (backward compat)', async () => {
    await mgr.addDocument('/docs/a.txt');
    await mgr.addDocument('/docs/b.txt');
    const first = mgr.getActiveDocument();
    expect(first).not.toBeNull();
    expect(first?.documentId).toBe('doc_1');
  });

  it('getActiveDocument returns null when empty', () => {
    expect(mgr.getActiveDocument()).toBeNull();
  });

  it('setDocument clears existing and adds new (backward compat)', async () => {
    await mgr.addDocument('/docs/a.txt');
    await mgr.addDocument('/docs/b.txt');
    expect(mgr.getDocumentCount()).toBe(2);

    await mgr.setDocument('/docs/c.txt');
    expect(mgr.getDocumentCount()).toBe(1);
    expect(mgr.getActiveDocument()?.fileName).toBe('c');
  });

  it('clearDocument removes all active references', async () => {
    await mgr.addDocument('/docs/a.txt');
    await mgr.addDocument('/docs/b.txt');
    mgr.clearDocument();
    expect(mgr.hasActiveDocument()).toBe(false);
    expect(mgr.getDocumentCount()).toBe(0);
  });

  it('getContextForPrompt returns empty when no documents', async () => {
    const results = await mgr.getContextForPrompt('test query');
    expect(results).toHaveLength(0);
  });

  it('getContextForPrompt filters to active document IDs', async () => {
    const info = await mgr.addDocument('/docs/a.txt');

    const mockResults: SearchResult[] = [
      {
        chunk: { id: 'c1', documentId: info.documentId, content: 'match', chunkIndex: 0, metadata: {} },
        document: { id: info.documentId, source: 'chat_attachment', title: 'a', content: '', contentHash: '', mimeType: '', createdAt: '', updatedAt: '', indexedAt: '', metadata: {} },
        score: 0.9,
      },
      {
        chunk: { id: 'c2', documentId: 'other_doc', content: 'no match', chunkIndex: 0, metadata: {} },
        document: { id: 'other_doc', source: 'local_file', title: 'other', content: '', contentHash: '', mimeType: '', createdAt: '', updatedAt: '', indexedAt: '', metadata: {} },
        score: 0.8,
      },
    ];

    (kg.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResults);

    const results = await mgr.getContextForPrompt('test query');
    expect(results).toHaveLength(1);
    expect(results[0]?.document.id).toBe(info.documentId);
  });

  it('addToKnowledge re-indexes with local_file source', async () => {
    const info = await mgr.addDocument('/docs/important.md');
    const result = await mgr.addToKnowledge(info.documentId);
    expect(result).toBe(true);
    expect(kg.indexDocument).toHaveBeenCalledTimes(2);
    const secondCall = (kg.indexDocument as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(secondCall?.[0]).toEqual(
      expect.objectContaining({ source: 'local_file', metadata: { promotedFromChat: true } }),
    );
  });

  it('addToKnowledge returns false for unknown document', async () => {
    const result = await mgr.addToKnowledge('nonexistent');
    expect(result).toBe(false);
  });
});
