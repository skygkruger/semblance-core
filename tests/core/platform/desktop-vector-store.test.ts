// Desktop Vector Store — LanceDBVectorStore compliance tests.
//
// Tests the VectorStoreAdapter contract using the LanceDB implementation.
// Uses a temporary directory for each test to ensure isolation.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LanceDBVectorStore } from '../../../packages/core/platform/desktop-vector-store.js';
import type { VectorEntry, VectorStoreAdapter } from '../../../packages/core/platform/types.js';

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

// Generate a random unit vector of given dimensions
function randomVector(dims: number): number[] {
  const v = Array.from({ length: dims }, () => Math.random() - 0.5);
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  return v.map(x => x / norm);
}

describe('LanceDBVectorStore (Desktop)', () => {
  let store: VectorStoreAdapter;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'semblance-lance-'));
    store = new LanceDBVectorStore(tempDir);
    await store.initialize('test_chunks', 16); // Use small dimensions for tests
  });

  afterEach(() => {
    store.close();
    try { rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
  });

  it('should start with zero count', async () => {
    expect(await store.count()).toBe(0);
  });

  it('should insert chunks and increase count', async () => {
    const entries = [
      makeEntry({ id: 'c1', vector: randomVector(16) }),
      makeEntry({ id: 'c2', vector: randomVector(16) }),
      makeEntry({ id: 'c3', vector: randomVector(16) }),
    ];
    await store.insertChunks(entries);
    expect(await store.count()).toBe(3);
  });

  it('should return empty results for search on empty store', async () => {
    const results = await store.search(randomVector(16), 5);
    expect(results).toEqual([]);
  });

  it('should find nearest neighbors', async () => {
    // Insert a known vector and a distant vector
    const target = Array.from({ length: 16 }, () => 1.0);
    const similar = Array.from({ length: 16 }, (_, i) => i === 0 ? 0.9 : 1.0);
    const distant = Array.from({ length: 16 }, () => -1.0);

    await store.insertChunks([
      makeEntry({ id: 'similar', content: 'similar content', vector: similar }),
      makeEntry({ id: 'distant', content: 'distant content', vector: distant }),
    ]);

    const results = await store.search(target, 2);
    expect(results.length).toBe(2);
    expect(results[0]!.id).toBe('similar');
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it('should filter by sourceType', async () => {
    await store.insertChunks([
      makeEntry({ id: 'email-1', sourceType: 'email', vector: randomVector(16) }),
      makeEntry({ id: 'file-1', sourceType: 'local_file', vector: randomVector(16) }),
      makeEntry({ id: 'email-2', sourceType: 'email', vector: randomVector(16) }),
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
    const uninitStore = new LanceDBVectorStore(tempDir);
    await expect(
      uninitStore.insertChunks([makeEntry({ vector: randomVector(16) })])
    ).rejects.toThrow();
  });
});
