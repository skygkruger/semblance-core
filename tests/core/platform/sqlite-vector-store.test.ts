// SQLite Vector Store — Compliance tests for brute-force cosine similarity.
//
// Uses better-sqlite3 (desktop) to test the SQLiteVectorStore which is
// designed for mobile but uses the platform-agnostic DatabaseHandle interface.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLiteVectorStore, cosineSimilarity } from '../../../packages/core/platform/sqlite-vector-store.js';
import type { VectorEntry, VectorStoreAdapter, DatabaseHandle } from '../../../packages/core/platform/types.js';

function wrapDatabase(dbPath: string): DatabaseHandle {
  const db = new Database(dbPath);
  return {
    pragma: (s: string) => db.pragma(s),
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      return {
        get: (...params: unknown[]) => stmt.get(...params),
        all: (...params: unknown[]) => stmt.all(...params),
        run: (...params: unknown[]) => stmt.run(...params),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transaction: <T extends (...args: any[]) => any>(fn: T): T => {
      return db.transaction(fn as Parameters<typeof db.transaction>[0]) as unknown as T;
    },
    exec: (sql: string) => db.exec(sql),
    close: () => db.close(),
  };
}

function makeEntry(overrides: Partial<VectorEntry> & { vector: number[] }): VectorEntry {
  return {
    id: overrides.id ?? `chunk-${Math.random().toString(36).slice(2)}`,
    documentId: overrides.documentId ?? 'doc-1',
    content: overrides.content ?? 'test content',
    chunkIndex: overrides.chunkIndex ?? 0,
    vector: overrides.vector,
    metadata: overrides.metadata ?? '{}',
    sourceType: overrides.sourceType ?? 'local_file',
    sourceId: overrides.sourceId ?? '/test/file.txt',
  };
}

function randomVector(dims: number): number[] {
  const v = Array.from({ length: dims }, () => Math.random() - 0.5);
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  return v.map(x => x / norm);
}

describe('SQLiteVectorStore (Mobile)', () => {
  let store: VectorStoreAdapter;
  let dbHandle: DatabaseHandle;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'semblance-sqlite-vec-'));
    dbHandle = wrapDatabase(join(tempDir, 'vectors.db'));
    store = new SQLiteVectorStore(dbHandle);
    await store.initialize('test_chunks', 16);
  });

  afterEach(() => {
    store.close();
    dbHandle.close();
    try { rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
  });

  it('should start with zero count', async () => {
    expect(await store.count()).toBe(0);
  });

  it('should insert chunks and increase count', async () => {
    await store.insertChunks([
      makeEntry({ id: 'c1', vector: randomVector(16) }),
      makeEntry({ id: 'c2', vector: randomVector(16) }),
      makeEntry({ id: 'c3', vector: randomVector(16) }),
    ]);
    expect(await store.count()).toBe(3);
  });

  it('should return empty results for search on empty store', async () => {
    const results = await store.search(randomVector(16), 5);
    expect(results).toEqual([]);
  });

  it('should find nearest neighbors with cosine similarity', async () => {
    const target = Array.from({ length: 16 }, () => 1.0);
    const similar = Array.from({ length: 16 }, (_, i) => i === 0 ? 0.9 : 1.0);
    const distant = Array.from({ length: 16 }, () => -1.0);

    await store.insertChunks([
      makeEntry({ id: 'similar', content: 'similar', vector: similar }),
      makeEntry({ id: 'distant', content: 'distant', vector: distant }),
    ]);

    const results = await store.search(target, 2);
    expect(results.length).toBe(2);
    expect(results[0]!.id).toBe('similar');
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it('should filter by sourceType', async () => {
    await store.insertChunks([
      makeEntry({ id: 'e1', sourceType: 'email', vector: randomVector(16) }),
      makeEntry({ id: 'f1', sourceType: 'local_file', vector: randomVector(16) }),
      makeEntry({ id: 'e2', sourceType: 'email', vector: randomVector(16) }),
    ]);

    const results = await store.search(randomVector(16), 10, { sourceTypes: ['email'] });
    expect(results.every(r => r.sourceType === 'email')).toBe(true);
    expect(results.length).toBe(2);
  });

  it('should delete by documentId', async () => {
    await store.insertChunks([
      makeEntry({ id: 'c1', documentId: 'doc-A', vector: randomVector(16) }),
      makeEntry({ id: 'c2', documentId: 'doc-A', vector: randomVector(16) }),
      makeEntry({ id: 'c3', documentId: 'doc-B', vector: randomVector(16) }),
    ]);
    expect(await store.count()).toBe(3);

    await store.deleteByDocumentId('doc-A');
    expect(await store.count()).toBe(1);
  });

  it('should handle inserting empty array', async () => {
    await store.insertChunks([]);
    expect(await store.count()).toBe(0);
  });

  it('should respect limit parameter in search', async () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ id: `c${i}`, vector: randomVector(16) })
    );
    await store.insertChunks(entries);

    const results = await store.search(randomVector(16), 3);
    expect(results.length).toBe(3);
  });

  it('should return results with all required fields', async () => {
    await store.insertChunks([
      makeEntry({
        id: 'full-entry',
        documentId: 'doc-full',
        content: 'full content here',
        chunkIndex: 5,
        metadata: '{"key": "value"}',
        sourceType: 'email',
        sourceId: 'msg-123',
        vector: randomVector(16),
      }),
    ]);

    const results = await store.search(randomVector(16), 1);
    expect(results.length).toBe(1);
    const r = results[0]!;
    expect(r.id).toBe('full-entry');
    expect(r.documentId).toBe('doc-full');
    expect(r.content).toBe('full content here');
    expect(r.chunkIndex).toBe(5);
    expect(r.metadata).toBe('{"key": "value"}');
    expect(r.sourceType).toBe('email');
    expect(r.sourceId).toBe('msg-123');
    expect(typeof r.score).toBe('number');
  });

  it('should close without error', () => {
    expect(() => store.close()).not.toThrow();
  });

  it('should throw when inserting before initialize', async () => {
    const uninitStore = new SQLiteVectorStore(dbHandle);
    await expect(
      uninitStore.insertChunks([makeEntry({ vector: randomVector(16) })])
    ).rejects.toThrow();
  });
});

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const v = [1, 2, 3, 4];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('should return -1 for opposite vectors', () => {
    const v = [1, 2, 3, 4];
    const neg = [-1, -2, -3, -4];
    expect(cosineSimilarity(v, neg)).toBeCloseTo(-1.0, 5);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0, 0, 0];
    const b = [0, 1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it('should return higher score for more similar vectors', () => {
    const query = [1, 1, 1, 1];
    const similar = [1, 1, 1, 0.5];
    const distant = [1, -1, 0, 0];
    expect(cosineSimilarity(query, similar)).toBeGreaterThan(cosineSimilarity(query, distant));
  });

  it('should return 0 for zero vectors', () => {
    const zero = [0, 0, 0, 0];
    const v = [1, 2, 3, 4];
    expect(cosineSimilarity(zero, v)).toBe(0);
  });

  it('should handle high-dimensional vectors (768d)', () => {
    const a = randomVector(768);
    const b = randomVector(768);
    const score = cosineSimilarity(a, a);
    expect(score).toBeCloseTo(1.0, 4);
    expect(cosineSimilarity(a, b)).toBeLessThan(1.0);
  });
});

describe('SQLiteVectorStore performance', () => {
  it('should search 10,000 vectors in under 1 second', async () => {
    const tempDir2 = mkdtempSync(join(tmpdir(), 'semblance-sqlite-perf-'));
    const db = wrapDatabase(join(tempDir2, 'perf.db'));
    const store = new SQLiteVectorStore(db);
    await store.initialize('perf_test', 64); // Use 64 dims for perf test

    // Insert 10K vectors in batches
    const batchSize = 1000;
    for (let batch = 0; batch < 10; batch++) {
      const entries = Array.from({ length: batchSize }, (_, i) =>
        makeEntry({
          id: `perf-${batch}-${i}`,
          vector: randomVector(64),
        })
      );
      await store.insertChunks(entries);
    }

    expect(await store.count()).toBe(10_000);

    // Measure search time
    const start = performance.now();
    const results = await store.search(randomVector(64), 10);
    const elapsed = performance.now() - start;

    expect(results.length).toBe(10);
    expect(elapsed).toBeLessThan(1000); // <1s

    store.close();
    db.close();
    try { rmSync(tempDir2, { recursive: true }); } catch { /* ignore */ }
  });
});

describe('Guard: @lancedb/lancedb banned from core (except desktop-vector-store.ts)', () => {
  it('vector-store.ts should not import @lancedb/lancedb', async () => {
    const { readFileSync } = await import('node:fs');
    const { join: pjoin } = await import('node:path');
    const content = readFileSync(
      pjoin(import.meta.dirname, '..', '..', '..', 'packages', 'core', 'knowledge', 'vector-store.ts'),
      'utf-8',
    );
    expect(content).not.toMatch(/@lancedb\/lancedb/);
  });

  it('knowledge/index.ts should not import @lancedb/lancedb', async () => {
    const { readFileSync } = await import('node:fs');
    const { join: pjoin } = await import('node:path');
    const content = readFileSync(
      pjoin(import.meta.dirname, '..', '..', '..', 'packages', 'core', 'knowledge', 'index.ts'),
      'utf-8',
    );
    expect(content).not.toMatch(/@lancedb\/lancedb/);
  });
});
