// Vector Store Integration Tests — Cross-adapter consistency and wiring.
//
// Verifies that the refactored VectorStore wrapper works correctly with
// both LanceDB (desktop) and SQLite (mobile) adapters, and that the
// knowledge graph factory, Indexer, and SemanticSearch use the adapter.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { LanceDBVectorStore } from '../../../packages/core/platform/desktop-vector-store.js';
import { SQLiteVectorStore } from '../../../packages/core/platform/sqlite-vector-store.js';
import { VectorStore } from '../../../packages/core/knowledge/vector-store.js';
import type { VectorStoreAdapter, VectorEntry, DatabaseHandle } from '../../../packages/core/platform/types.js';

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

function randomVector(dims: number): number[] {
  const v = Array.from({ length: dims }, () => Math.random() - 0.5);
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  return v.map(x => x / norm);
}

const DIMS = 16;

function makeChunks(): VectorEntry[] {
  // Create 5 deterministic entries with known vectors
  const base = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  return [
    {
      id: 'alpha', documentId: 'doc-1', content: 'alpha content',
      chunkIndex: 0, vector: base, metadata: '{}', sourceType: 'email',
    },
    {
      id: 'beta', documentId: 'doc-1', content: 'beta content',
      chunkIndex: 1, vector: base.map((v, i) => i === 0 ? 0.9 : i === 1 ? 0.1 : 0),
      metadata: '{}', sourceType: 'email',
    },
    {
      id: 'gamma', documentId: 'doc-2', content: 'gamma content',
      chunkIndex: 0, vector: base.map((v, i) => i === 0 ? 0.5 : i === 1 ? 0.5 : 0),
      metadata: '{}', sourceType: 'local_file',
    },
    {
      id: 'delta', documentId: 'doc-2', content: 'delta content',
      chunkIndex: 1, vector: base.map((v, i) => i === 0 ? -1 : 0),
      metadata: '{}', sourceType: 'local_file',
    },
    {
      id: 'epsilon', documentId: 'doc-3', content: 'epsilon content',
      chunkIndex: 0, vector: base.map((v, i) => i === 1 ? 1 : 0),
      metadata: '{}', sourceType: 'calendar',
    },
  ];
}

describe('Cross-adapter consistency', () => {
  let lanceStore: VectorStoreAdapter;
  let sqliteStore: VectorStoreAdapter;
  let tempDir: string;
  let dbHandle: DatabaseHandle;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'semblance-cross-'));
    const lanceDir = join(tempDir, 'lance');
    mkdirSync(lanceDir, { recursive: true });

    lanceStore = new LanceDBVectorStore(lanceDir);
    await lanceStore.initialize('cross_test', DIMS);

    dbHandle = wrapDatabase(join(tempDir, 'sqlite.db'));
    sqliteStore = new SQLiteVectorStore(dbHandle);
    await sqliteStore.initialize('cross_test', DIMS);

    // Insert same data into both
    const chunks = makeChunks();
    await lanceStore.insertChunks(chunks);
    await sqliteStore.insertChunks(chunks);
  });

  afterEach(() => {
    lanceStore.close();
    sqliteStore.close();
    dbHandle.close();
    try { rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
  });

  it('both adapters return same count', async () => {
    expect(await lanceStore.count()).toBe(5);
    expect(await sqliteStore.count()).toBe(5);
  });

  it('both adapters return same top result for a query', async () => {
    const query = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const lanceResults = await lanceStore.search(query, 1);
    const sqliteResults = await sqliteStore.search(query, 1);

    expect(lanceResults[0]!.id).toBe('alpha');
    expect(sqliteResults[0]!.id).toBe('alpha');
  });

  it('both adapters agree on relative ordering', async () => {
    const query = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const lanceResults = await lanceStore.search(query, 5);
    const sqliteResults = await sqliteStore.search(query, 5);

    // Both should rank alpha first and delta last (opposite direction)
    expect(lanceResults[0]!.id).toBe('alpha');
    expect(sqliteResults[0]!.id).toBe('alpha');

    const lanceIds = lanceResults.map(r => r.id);
    const sqliteIds = sqliteResults.map(r => r.id);
    // delta (opposite direction) should be last in both
    expect(lanceIds[lanceIds.length - 1]).toBe('delta');
    expect(sqliteIds[sqliteIds.length - 1]).toBe('delta');
  });

  it('both adapters filter by sourceType consistently', async () => {
    const query = randomVector(DIMS);
    const lanceResults = await lanceStore.search(query, 10, { sourceTypes: ['email'] });
    const sqliteResults = await sqliteStore.search(query, 10, { sourceTypes: ['email'] });

    expect(lanceResults.length).toBe(2);
    expect(sqliteResults.length).toBe(2);
    expect(lanceResults.every(r => r.sourceType === 'email')).toBe(true);
    expect(sqliteResults.every(r => r.sourceType === 'email')).toBe(true);
  });

  it('both adapters delete by documentId consistently', async () => {
    await lanceStore.deleteByDocumentId('doc-1');
    await sqliteStore.deleteByDocumentId('doc-1');

    expect(await lanceStore.count()).toBe(3);
    expect(await sqliteStore.count()).toBe(3);
  });
});

describe('VectorStore wrapper uses adapter', () => {
  let tempDir: string;
  let dbHandle: DatabaseHandle;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'semblance-wrapper-'));
  });

  afterEach(() => {
    try { dbHandle?.close(); } catch { /* ignore */ }
    try { rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
  });

  it('initializeWithAdapter sets up the underlying adapter', async () => {
    dbHandle = wrapDatabase(join(tempDir, 'wrapper.db'));
    const adapter = new SQLiteVectorStore(dbHandle);
    const wrapper = new VectorStore(tempDir, DIMS);
    await wrapper.initializeWithAdapter(adapter);

    await wrapper.insertChunks([{
      id: 'w1', documentId: 'doc-1', content: 'test',
      chunkIndex: 0, embedding: randomVector(DIMS), metadata: '{}',
      sourceType: 'local_file',
    }]);

    expect(await wrapper.count()).toBe(1);
    wrapper.close();
  });

  it('search returns results from underlying adapter', async () => {
    dbHandle = wrapDatabase(join(tempDir, 'wrapper-search.db'));
    const adapter = new SQLiteVectorStore(dbHandle);
    const wrapper = new VectorStore(tempDir, DIMS);
    await wrapper.initializeWithAdapter(adapter);

    const vec = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    await wrapper.insertChunks([{
      id: 'w1', documentId: 'doc-1', content: 'test content',
      chunkIndex: 0, embedding: vec, metadata: '{}', sourceType: 'email',
    }]);

    const results = await wrapper.search(vec, 5);
    expect(results.length).toBe(1);
    expect(results[0]!.content).toBe('test content');
    expect(results[0]!.score).toBeGreaterThan(0.9);
    wrapper.close();
  });

  it('throws when not initialized', async () => {
    const wrapper = new VectorStore(tempDir, DIMS);
    await expect(wrapper.insertChunks([{
      id: 'x', documentId: 'd', content: 'c',
      chunkIndex: 0, embedding: randomVector(DIMS), metadata: '{}',
    }])).rejects.toThrow('not initialized');
  });
});
