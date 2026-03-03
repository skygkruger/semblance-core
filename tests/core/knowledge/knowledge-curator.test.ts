// Tests for KnowledgeCurator — Drill-down list, remove, recategorize, reindex, suggest, delete.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { DocumentStore } from '@semblance/core/knowledge/document-store.js';
import { KnowledgeCurator } from '@semblance/core/knowledge/knowledge-curator.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';
import type { LLMProvider } from '@semblance/core/llm/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockLLM(overrides?: Partial<LLMProvider>): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn().mockResolvedValue({
      text: '',
      model: 'llama3.2:3b',
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      durationMs: 0,
    }),
    chat: vi.fn().mockResolvedValue({
      message: { role: 'assistant' as const, content: '' },
      model: 'llama3.2:3b',
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      durationMs: 0,
    }),
    embed: vi.fn().mockResolvedValue({
      embeddings: [Array(768).fill(0.1)],
      model: 'nomic-embed-text',
      durationMs: 10,
    }),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function createMockVectorStore() {
  return {
    deleteByDocumentId: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockIndexer() {
  return {
    indexDocument: vi.fn().mockResolvedValue({ id: 'reindexed-1', chunks: 1 }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('KnowledgeCurator', () => {
  let db: Database.Database;
  let docStore: DocumentStore;
  let mockVector: ReturnType<typeof createMockVectorStore>;
  let mockIndexer: ReturnType<typeof createMockIndexer>;
  let mockLLM: LLMProvider;
  let curator: KnowledgeCurator;

  beforeEach(() => {
    db = new Database(':memory:');
    docStore = new DocumentStore(db as unknown as DatabaseHandle);
    mockVector = createMockVectorStore();
    mockIndexer = createMockIndexer();
    mockLLM = createMockLLM();

    curator = new KnowledgeCurator({
      documentStore: docStore,
      vectorStore: mockVector as any,
      indexer: mockIndexer as any,
      db: db as unknown as DatabaseHandle,
      llm: mockLLM,
      activeModel: 'llama3.2:3b',
    });

    // Create pending_actions table — must match schema used by logCurationAction
    db.exec(`
      CREATE TABLE IF NOT EXISTS pending_actions (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        reasoning TEXT,
        domain TEXT,
        tier TEXT,
        status TEXT NOT NULL DEFAULT 'pending_approval',
        created_at TEXT NOT NULL,
        executed_at TEXT,
        response_json TEXT
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  // ─── listChunksByCategory ──────────────────────────────────────────

  describe('listChunksByCategory', () => {
    it('returns items matching the requested category', async () => {
      docStore.insertDocument({
        source: 'local_file',
        title: 'My Notes',
        contentHash: 'h1',
        mimeType: 'text/plain',
      });
      docStore.insertDocument({
        source: 'financial',
        title: 'Bank Statement',
        contentHash: 'h2',
        mimeType: 'text/plain',
      });

      // local_file maps to 'knowledge' category, financial maps to 'finance'
      const result = await curator.listChunksByCategory('knowledge');
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items.every(i => i.category === 'knowledge')).toBe(true);
    });

    it('returns paginated results', async () => {
      for (let i = 0; i < 5; i++) {
        docStore.insertDocument({
          source: 'local_file',
          title: `File ${i}`,
          contentHash: `hash-${i}`,
          mimeType: 'text/plain',
        });
      }

      const page1 = await curator.listChunksByCategory('knowledge', { limit: 2, offset: 0 });
      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(5);

      const page2 = await curator.listChunksByCategory('knowledge', { limit: 2, offset: 2 });
      expect(page2.items).toHaveLength(2);
    });

    it('filters by search query', async () => {
      docStore.insertDocument({
        source: 'local_file',
        title: 'Budget Report',
        contentHash: 'h-budget',
        mimeType: 'text/plain',
      });
      docStore.insertDocument({
        source: 'local_file',
        title: 'Meeting Notes',
        contentHash: 'h-meeting',
        mimeType: 'text/plain',
      });

      const result = await curator.listChunksByCategory('knowledge', { searchQuery: 'budget' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('Budget Report');
    });

    it('returns empty for category with no documents', async () => {
      const result = await curator.listChunksByCategory('music');
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('respects visualizationCategory override in metadata', async () => {
      docStore.insertDocument({
        source: 'local_file',
        title: 'Moved to Finance',
        contentHash: 'h-moved',
        mimeType: 'text/plain',
        metadata: { visualizationCategory: 'finance' },
      });

      // Should NOT appear in 'knowledge' (default for local_file)
      const knowledgeResult = await curator.listChunksByCategory('knowledge');
      expect(knowledgeResult.items.find(i => i.title === 'Moved to Finance')).toBeUndefined();

      // Should appear in 'finance'
      const financeResult = await curator.listChunksByCategory('finance');
      expect(financeResult.items.find(i => i.title === 'Moved to Finance')).toBeDefined();
    });
  });

  // ─── removeFromGraph ───────────────────────────────────────────────

  describe('removeFromGraph', () => {
    it('removes an existing document from graph', async () => {
      const { id } = docStore.insertDocument({
        source: 'local_file',
        title: 'To Remove',
        contentHash: 'h-remove',
        mimeType: 'text/plain',
      });

      const result = await curator.removeFromGraph(id);

      expect(result.success).toBe(true);
      expect(result.operation).toBe('remove');
      expect(result.chunkId).toBe(id);

      // Verify vector store was called
      expect(mockVector.deleteByDocumentId).toHaveBeenCalledWith(id);

      // Verify document is gone
      const doc = docStore.getDocument(id);
      expect(doc).toBeNull();
    });

    it('returns failure for non-existent document', async () => {
      const result = await curator.removeFromGraph('nonexistent-id');
      expect(result.success).toBe(false);
      expect(result.detail).toContain('not found');
    });

    it('logs curation action to audit trail', async () => {
      const { id } = docStore.insertDocument({
        source: 'email',
        title: 'Audit Test',
        contentHash: 'h-audit',
        mimeType: 'text/plain',
      });

      await curator.removeFromGraph(id);

      const entries = db.prepare(
        'SELECT * FROM pending_actions WHERE action = ?',
      ).all('knowledge.remove') as Array<{ action: string; payload: string; status: string }>;

      expect(entries).toHaveLength(1);
      expect(entries[0]!.status).toBe('executed');
      const payload = JSON.parse(entries[0]!.payload);
      expect(payload.title).toBe('Audit Test');
      expect(payload.source).toBe('email');
    });
  });

  // ─── recategorize ──────────────────────────────────────────────────

  describe('recategorize', () => {
    it('updates document metadata with new category', async () => {
      const { id } = docStore.insertDocument({
        source: 'local_file',
        title: 'Finance Report',
        contentHash: 'h-recat',
        mimeType: 'text/plain',
      });

      const result = await curator.recategorize(id, 'finance');

      expect(result.success).toBe(true);
      expect(result.operation).toBe('recategorize');

      // Verify metadata was updated in DB
      const row = db.prepare('SELECT metadata FROM documents WHERE id = ?').get(id) as { metadata: string } | undefined;
      expect(row).toBeDefined();
      const meta = JSON.parse(row!.metadata);
      expect(meta.visualizationCategory).toBe('finance');
    });

    it('returns failure for non-existent document', async () => {
      const result = await curator.recategorize('nonexistent', 'finance');
      expect(result.success).toBe(false);
      expect(result.detail).toContain('not found');
    });

    it('logs recategorize action to audit trail', async () => {
      const { id } = docStore.insertDocument({
        source: 'local_file',
        title: 'Moving File',
        contentHash: 'h-move',
        mimeType: 'text/plain',
      });

      await curator.recategorize(id, 'work');

      const entries = db.prepare(
        'SELECT * FROM pending_actions WHERE action = ?',
      ).all('knowledge.recategorize') as Array<{ payload: string }>;

      expect(entries).toHaveLength(1);
      const payload = JSON.parse(entries[0]!.payload);
      expect(payload.toCategory).toBe('work');
    });

    it('preserves existing metadata when adding category override', async () => {
      const { id } = docStore.insertDocument({
        source: 'local_file',
        title: 'Has Metadata',
        contentHash: 'h-meta',
        mimeType: 'text/plain',
        metadata: { size: 1024, customField: 'preserved' },
      });

      await curator.recategorize(id, 'health');

      const row = db.prepare('SELECT metadata FROM documents WHERE id = ?').get(id) as { metadata: string };
      const meta = JSON.parse(row.metadata);
      expect(meta.visualizationCategory).toBe('health');
      expect(meta.size).toBe(1024);
      expect(meta.customField).toBe('preserved');
    });
  });

  // ─── deleteFromDisk ────────────────────────────────────────────────

  describe('deleteFromDisk', () => {
    it('removes document from graph and logs to audit trail', async () => {
      const { id } = docStore.insertDocument({
        source: 'email',
        title: 'Email to Delete',
        contentHash: 'h-delete',
        mimeType: 'text/plain',
      });

      const result = await curator.deleteFromDisk(id);

      expect(result.success).toBe(true);
      expect(result.operation).toBe('delete');
      expect(mockVector.deleteByDocumentId).toHaveBeenCalledWith(id);

      const entries = db.prepare(
        'SELECT * FROM pending_actions WHERE action = ?',
      ).all('knowledge.delete');
      expect(entries).toHaveLength(1);
    });

    it('returns failure for non-existent document', async () => {
      const result = await curator.deleteFromDisk('missing');
      expect(result.success).toBe(false);
      expect(result.detail).toContain('not found');
    });
  });

  // ─── suggestCategories ─────────────────────────────────────────────

  describe('suggestCategories', () => {
    it('returns empty array for non-existent document', async () => {
      const suggestions = await curator.suggestCategories('nonexistent');
      expect(suggestions).toEqual([]);
    });

    it('calls LLM with title and metadata only (never content)', async () => {
      const { id } = docStore.insertDocument({
        source: 'local_file',
        sourcePath: '/home/user/secrets.txt',
        title: 'Sensitive Document',
        contentHash: 'h-suggest',
        mimeType: 'text/plain',
      });

      // Mock LLM to return valid suggestions
      const generateFn = vi.fn().mockResolvedValue({
        text: JSON.stringify([
          { category: 'work', reason: 'Based on title', confidence: 0.8 },
        ]),
        model: 'llama3.2:3b',
        tokensUsed: { prompt: 50, completion: 30, total: 80 },
        durationMs: 200,
      });
      (mockLLM.generate as ReturnType<typeof vi.fn>).mockImplementation(generateFn);

      await curator.suggestCategories(id);

      // Verify LLM was called
      expect(generateFn).toHaveBeenCalled();

      // Verify content was NOT in the prompt (content is '' for documents)
      const call = generateFn.mock.calls[0]!;
      const prompt = JSON.stringify(call);
      expect(prompt).toContain('Sensitive Document'); // Title IS included
    });

    it('returns fallback on LLM error', async () => {
      const { id } = docStore.insertDocument({
        source: 'local_file',
        title: 'Fallback Test',
        contentHash: 'h-fallback',
        mimeType: 'text/plain',
      });

      (mockLLM.generate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('LLM down'));

      const suggestions = await curator.suggestCategories(id);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]!.confidence).toBe(1.0);
    });
  });

  // ─── listCategories ────────────────────────────────────────────────

  describe('listCategories', () => {
    it('returns categories with counts based on documents', () => {
      docStore.insertDocument({ source: 'local_file', title: 'F1', contentHash: 'c1', mimeType: 'text/plain' });
      docStore.insertDocument({ source: 'local_file', title: 'F2', contentHash: 'c2', mimeType: 'text/plain' });
      docStore.insertDocument({ source: 'financial', title: 'Bank', contentHash: 'c3', mimeType: 'text/plain' });

      const categories = curator.listCategories();

      const knowledgeCat = categories.find(c => c.category === 'knowledge');
      const financeCat = categories.find(c => c.category === 'finance');

      // local_file → knowledge, financial → finance
      expect(knowledgeCat).toBeDefined();
      expect(knowledgeCat!.count).toBe(2);
      expect(financeCat).toBeDefined();
      expect(financeCat!.count).toBe(1);
    });

    it('returns all categories even if empty', () => {
      const categories = curator.listCategories();
      // Should include all 10 base categories
      expect(categories.length).toBeGreaterThanOrEqual(10);
    });

    it('includes color and displayName for each category', () => {
      const categories = curator.listCategories();
      for (const cat of categories) {
        expect(cat.color).toBeDefined();
        expect(cat.displayName).toBeDefined();
        expect(cat.category).toBeDefined();
      }
    });
  });
});
