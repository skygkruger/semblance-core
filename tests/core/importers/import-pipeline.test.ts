import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';
import { ImportPipeline } from '@semblance/core/importers/import-pipeline.js';
import type { ImportParser, ImportResult, ImportedItem } from '@semblance/core/importers/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────────────

function createDb(): Database.Database {
  const db = new Database(':memory:');
  // Premium gate table
  db.exec(`
    CREATE TABLE IF NOT EXISTS license (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      tier TEXT NOT NULL DEFAULT 'free',
      activated_at TEXT NOT NULL,
      expires_at TEXT,
      founding_seat INTEGER
    )
  `);
  return db;
}

function activatePremium(db: Database.Database): void {
  db.prepare(`
    INSERT OR REPLACE INTO license (id, tier, activated_at, expires_at)
    VALUES (1, 'digital-representative', ?, NULL)
  `).run(new Date().toISOString());
}

function makeMockIndexer() {
  let callCount = 0;
  return {
    indexDocument: vi.fn(async () => ({
      documentId: `doc_${++callCount}`,
      chunksCreated: 1,
      durationMs: 5,
      deduplicated: false,
    })),
  };
}

function makeMockPremiumGate(db: Database.Database) {
  // Reuse real PremiumGate behavior via import
  // For simplicity, simulate inline
  return {
    isPremium: () => {
      const row = db.prepare('SELECT tier FROM license WHERE id = 1').get() as { tier: string } | undefined;
      return row?.tier === 'digital-representative' || row?.tier === 'lifetime';
    },
    isFeatureAvailable: (feature: string) => {
      const row = db.prepare('SELECT tier FROM license WHERE id = 1').get() as { tier: string } | undefined;
      return row?.tier === 'digital-representative' || row?.tier === 'lifetime';
    },
  };
}

function makeMockParser(items: ImportedItem[]): ImportParser {
  return {
    sourceType: 'browser_history',
    supportedFormats: ['test_format'],
    canParse: () => true,
    parse: async () => ({
      format: 'test_format',
      items,
      errors: [],
      totalFound: items.length,
    }),
  };
}

function makeTestItems(count: number): ImportedItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `test_item_${i}`,
    sourceType: 'browser_history' as const,
    title: `Item ${i}`,
    content: `Content for item ${i}`,
    timestamp: new Date(2024, 0, 1 + i).toISOString(),
    metadata: { index: i },
  }));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ImportPipeline', () => {
  let db: Database.Database;
  let pipeline: ImportPipeline;
  let mockIndexer: ReturnType<typeof makeMockIndexer>;

  beforeEach(() => {
    db = createDb();
    mockIndexer = makeMockIndexer();
    const premiumGate = makeMockPremiumGate(db);

    pipeline = new ImportPipeline({
      db: db as unknown as DatabaseHandle,
      indexer: mockIndexer as any,
      premiumGate: premiumGate as any,
    });
    pipeline.initSchema();
  });

  it('rejects import when premium gate is inactive', async () => {
    // Do NOT activate premium
    const parser = makeMockParser(makeTestItems(3));
    pipeline.registerParser(parser);

    const result = await pipeline.runImport('/some/path', 'browser_history');
    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain('Digital Representative');
  });

  it('registers and retrieves available parsers', () => {
    const parser = makeMockParser([]);
    pipeline.registerParser(parser);

    const sources = pipeline.getAvailableSources();
    expect(sources).toHaveLength(1);
    expect(sources[0]!.sourceType).toBe('browser_history');
    expect(sources[0]!.formats).toContain('test_format');
  });

  it('runs import and stores items in imported_items table', async () => {
    activatePremium(db);
    const items = makeTestItems(3);
    const parser = makeMockParser(items);
    pipeline.registerParser(parser);

    const result = await pipeline.runImport('/some/path', 'browser_history');
    expect(result.imported).toBe(3);
    expect(result.skippedDuplicates).toBe(0);

    const rows = db.prepare('SELECT * FROM imported_items').all();
    expect(rows).toHaveLength(3);
  });

  it('records import in import_history table', async () => {
    activatePremium(db);
    const parser = makeMockParser(makeTestItems(5));
    pipeline.registerParser(parser);

    await pipeline.runImport('/test/path', 'browser_history');

    const history = pipeline.getImportHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.sourceType).toBe('browser_history');
    expect(history[0]!.itemCount).toBe(5);
    expect(history[0]!.status).toBe('complete');
  });

  it('deduplicates items already in imported_items (by source ID)', async () => {
    activatePremium(db);
    const items = makeTestItems(3);
    const parser = makeMockParser(items);
    pipeline.registerParser(parser);

    // First import
    const result1 = await pipeline.runImport('/path1', 'browser_history');
    expect(result1.imported).toBe(3);

    // Second import with same items
    const result2 = await pipeline.runImport('/path2', 'browser_history');
    expect(result2.imported).toBe(0);
    expect(result2.skippedDuplicates).toBe(3);
  });

  it('calls Indexer.indexDocument for each non-duplicate item', async () => {
    activatePremium(db);
    const parser = makeMockParser(makeTestItems(4));
    pipeline.registerParser(parser);

    await pipeline.runImport('/path', 'browser_history');
    expect(mockIndexer.indexDocument).toHaveBeenCalledTimes(4);

    // Verify the indexer was called with correct DocumentSource
    const firstCall = (mockIndexer.indexDocument.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
    expect(firstCall.source).toBe('browser_history');
    expect(firstCall.title).toBe('Item 0');
  });

  it('fires Knowledge Moment when items > 50', async () => {
    activatePremium(db);
    const mockKmg = { generate: vi.fn(async () => null) };

    const pipelineWithKmg = new ImportPipeline({
      db: db as unknown as DatabaseHandle,
      indexer: mockIndexer as any,
      premiumGate: makeMockPremiumGate(db) as any,
      knowledgeMomentGenerator: mockKmg as any,
    });
    pipelineWithKmg.initSchema();

    const parser = makeMockParser(makeTestItems(55));
    pipelineWithKmg.registerParser(parser);

    const result = await pipelineWithKmg.runImport('/path', 'browser_history');
    expect(result.imported).toBe(55);
    expect(result.knowledgeMomentFired).toBe(true);
    expect(mockKmg.generate).toHaveBeenCalledTimes(1);
  });

  it('returns correct ImportSummary with counts and duration', async () => {
    activatePremium(db);
    const parser = makeMockParser(makeTestItems(7));
    pipeline.registerParser(parser);

    const result = await pipeline.runImport('/path', 'browser_history');
    expect(result.importId).toBeTruthy();
    expect(result.sourceType).toBe('browser_history');
    expect(result.format).toBe('test_format');
    expect(result.totalFound).toBe(7);
    expect(result.imported).toBe(7);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.knowledgeMomentFired).toBe(false); // Only 7 items, < 50
  });
});
