// Tests for Knowledge Graph Delta Sync — document metadata export/import for cross-device sync.
// Tests documentToSyncEntry, buildKGDelta, applyKGDelta, and KG_SYNC_MAX_BYTES.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  documentToSyncEntry,
  buildKGDelta,
  applyKGDelta,
  KG_SYNC_MAX_BYTES,
} from '@semblance/core/knowledge/kg-sync.js';
import type { KGSyncEntry, KGSyncDelta } from '@semblance/core/knowledge/kg-sync.js';
import type { Document } from '@semblance/core/knowledge/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createDoc(overrides?: Partial<Document>): Document {
  return {
    id: 'doc-1',
    source: 'email',
    title: 'Test Doc',
    content: 'Full content here',
    contentHash: 'hash-abc',
    mimeType: 'text/plain',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    indexedAt: '2026-01-01T00:00:00Z',
    metadata: {},
    ...overrides,
  };
}

// ─── documentToSyncEntry ────────────────────────────────────────────────────

describe('documentToSyncEntry', () => {
  it('strips the content field', () => {
    const doc = createDoc({ content: 'This should be stripped out entirely' });
    const entry = documentToSyncEntry(doc);

    expect(entry).not.toHaveProperty('content');
  });

  it('preserves all metadata fields', () => {
    const doc = createDoc({
      id: 'doc-42',
      source: 'calendar',
      title: 'Meeting Notes',
      contentHash: 'hash-xyz',
      mimeType: 'text/markdown',
      createdAt: '2026-02-15T10:00:00Z',
      updatedAt: '2026-02-15T12:00:00Z',
      indexedAt: '2026-02-15T12:30:00Z',
      metadata: { sender: 'alice@example.com', threadId: 'thread-1' },
    });
    const entry = documentToSyncEntry(doc);

    expect(entry.id).toBe('doc-42');
    expect(entry.source).toBe('calendar');
    expect(entry.title).toBe('Meeting Notes');
    expect(entry.contentHash).toBe('hash-xyz');
    expect(entry.mimeType).toBe('text/markdown');
    expect(entry.createdAt).toBe('2026-02-15T10:00:00Z');
    expect(entry.updatedAt).toBe('2026-02-15T12:00:00Z');
    expect(entry.indexedAt).toBe('2026-02-15T12:30:00Z');
    expect(entry.metadata).toEqual({ sender: 'alice@example.com', threadId: 'thread-1' });
  });

  it('handles optional sourcePath', () => {
    // With sourcePath
    const docWithPath = createDoc({ sourcePath: '/home/user/notes/meeting.md' });
    const entryWithPath = documentToSyncEntry(docWithPath);
    expect(entryWithPath.sourcePath).toBe('/home/user/notes/meeting.md');

    // Without sourcePath
    const docWithoutPath = createDoc();
    delete docWithoutPath.sourcePath;
    const entryWithoutPath = documentToSyncEntry(docWithoutPath);
    expect(entryWithoutPath.sourcePath).toBeUndefined();
  });
});

// ─── buildKGDelta ───────────────────────────────────────────────────────────

describe('buildKGDelta', () => {
  it('returns all documents when since is null (first sync)', () => {
    const docs = [
      createDoc({ id: 'doc-1', contentHash: 'h1' }),
      createDoc({ id: 'doc-2', contentHash: 'h2' }),
      createDoc({ id: 'doc-3', contentHash: 'h3' }),
    ];

    const delta = buildKGDelta(docs, [], null);

    expect(delta.upserts).toHaveLength(3);
    expect(delta.deletions).toHaveLength(0);
  });

  it('returns only changed documents when since is set (by updatedAt)', () => {
    const docs = [
      createDoc({ id: 'doc-old', updatedAt: '2026-01-01T00:00:00Z', indexedAt: '2026-01-01T00:00:00Z' }),
      createDoc({ id: 'doc-new', updatedAt: '2026-02-01T00:00:00Z', indexedAt: '2026-01-01T00:00:00Z' }),
    ];

    const delta = buildKGDelta(docs, [], '2026-01-15T00:00:00Z');

    expect(delta.upserts).toHaveLength(1);
    expect(delta.upserts[0]!.id).toBe('doc-new');
  });

  it('sorts newest-first', () => {
    const docs = [
      createDoc({ id: 'doc-oldest', updatedAt: '2026-01-01T00:00:00Z', contentHash: 'h1' }),
      createDoc({ id: 'doc-newest', updatedAt: '2026-03-01T00:00:00Z', contentHash: 'h2' }),
      createDoc({ id: 'doc-middle', updatedAt: '2026-02-01T00:00:00Z', contentHash: 'h3' }),
    ];

    const delta = buildKGDelta(docs, [], null);

    expect(delta.upserts[0]!.id).toBe('doc-newest');
    expect(delta.upserts[1]!.id).toBe('doc-middle');
    expect(delta.upserts[2]!.id).toBe('doc-oldest');
  });

  it('filters by updatedAt when since is provided', () => {
    const docs = [
      createDoc({ id: 'doc-before', updatedAt: '2026-01-01T00:00:00Z', indexedAt: '2026-01-01T00:00:00Z' }),
      createDoc({ id: 'doc-after', updatedAt: '2026-02-20T00:00:00Z', indexedAt: '2026-01-01T00:00:00Z' }),
    ];

    const since = '2026-02-01T00:00:00Z';
    const delta = buildKGDelta(docs, [], since);

    const ids = delta.upserts.map(e => e.id);
    expect(ids).toContain('doc-after');
    expect(ids).not.toContain('doc-before');
  });

  it('filters by indexedAt when since is provided', () => {
    // Document was NOT updated after since, but WAS re-indexed after since
    const docs = [
      createDoc({
        id: 'doc-reindexed',
        updatedAt: '2026-01-01T00:00:00Z',
        indexedAt: '2026-02-20T00:00:00Z',
      }),
      createDoc({
        id: 'doc-stale',
        updatedAt: '2026-01-01T00:00:00Z',
        indexedAt: '2026-01-01T00:00:00Z',
      }),
    ];

    const since = '2026-02-01T00:00:00Z';
    const delta = buildKGDelta(docs, [], since);

    const ids = delta.upserts.map(e => e.id);
    expect(ids).toContain('doc-reindexed');
    expect(ids).not.toContain('doc-stale');
  });

  it('includes deletions', () => {
    const deletedIds = ['deleted-1', 'deleted-2', 'deleted-3'];
    const delta = buildKGDelta([], deletedIds, null);

    expect(delta.deletions).toEqual(['deleted-1', 'deleted-2', 'deleted-3']);
    expect(delta.deletions).toHaveLength(3);
  });

  it('sets truncated=false when under size cap', () => {
    const docs = [
      createDoc({ id: 'doc-1', contentHash: 'h1' }),
      createDoc({ id: 'doc-2', contentHash: 'h2' }),
    ];

    const delta = buildKGDelta(docs, [], null);

    expect(delta.truncated).toBe(false);
  });

  it('truncates oldest entries when over 10MB cap', () => {
    // Create documents with large metadata to exceed the 10MB cap
    const largeDocs: Document[] = [];
    const hugeMetadata = { blob: 'x'.repeat(100_000) }; // ~100KB per doc

    for (let i = 0; i < 150; i++) {
      largeDocs.push(
        createDoc({
          id: `doc-${i}`,
          contentHash: `hash-${i}`,
          // Stagger updatedAt so we know which ones get dropped (oldest)
          updatedAt: new Date(Date.UTC(2026, 0, 1) + i * 3600_000).toISOString(),
          metadata: hugeMetadata,
        }),
      );
    }

    const delta = buildKGDelta(largeDocs, [], null);

    expect(delta.truncated).toBe(true);
    // Not all 150 documents should be present
    expect(delta.upserts.length).toBeLessThan(150);
    expect(delta.upserts.length).toBeGreaterThan(0);

    // The first entry should be the newest (sorted newest-first)
    // and the oldest documents should have been truncated
    const firstUpdatedAt = delta.upserts[0]!.updatedAt;
    const lastUpdatedAt = delta.upserts[delta.upserts.length - 1]!.updatedAt;
    expect(firstUpdatedAt > lastUpdatedAt).toBe(true);
  });

  it('sets generatedAt timestamp', () => {
    const before = new Date().toISOString();
    const delta = buildKGDelta([], [], null);
    const after = new Date().toISOString();

    expect(delta.generatedAt).toBeDefined();
    expect(delta.generatedAt >= before).toBe(true);
    expect(delta.generatedAt <= after).toBe(true);
  });
});

// ─── applyKGDelta ───────────────────────────────────────────────────────────

describe('applyKGDelta', () => {
  let localHashes: Set<string>;
  let onNewDocument: (entry: KGSyncEntry) => void;
  let onDelete: (id: string) => void;

  beforeEach(() => {
    localHashes = new Set<string>();
    onNewDocument = vi.fn();
    onDelete = vi.fn();
  });

  function makeDelta(overrides?: Partial<KGSyncDelta>): KGSyncDelta {
    return {
      upserts: [],
      deletions: [],
      generatedAt: new Date().toISOString(),
      truncated: false,
      ...overrides,
    };
  }

  function makeEntry(overrides?: Partial<KGSyncEntry>): KGSyncEntry {
    return {
      id: 'doc-1',
      source: 'email',
      title: 'Test Doc',
      contentHash: 'hash-abc',
      mimeType: 'text/plain',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      indexedAt: '2026-01-01T00:00:00Z',
      metadata: {},
      ...overrides,
    };
  }

  it('calls onNewDocument for unknown contentHash', () => {
    const entry = makeEntry({ id: 'doc-new', contentHash: 'hash-new' });
    const delta = makeDelta({ upserts: [entry] });

    applyKGDelta(delta, localHashes, onNewDocument, onDelete);

    expect(onNewDocument).toHaveBeenCalledTimes(1);
    expect(onNewDocument).toHaveBeenCalledWith(entry);
  });

  it('skips duplicates with same contentHash', () => {
    localHashes.add('hash-existing');

    const entry = makeEntry({ id: 'doc-dup', contentHash: 'hash-existing' });
    const delta = makeDelta({ upserts: [entry] });

    const result = applyKGDelta(delta, localHashes, onNewDocument, onDelete);

    expect(onNewDocument).not.toHaveBeenCalled();
    expect(result.duplicates).toBe(1);
  });

  it('calls onDelete for deletions', () => {
    const delta = makeDelta({ deletions: ['del-1', 'del-2'] });

    applyKGDelta(delta, localHashes, onNewDocument, onDelete);

    expect(onDelete).toHaveBeenCalledTimes(2);
    expect(onDelete).toHaveBeenCalledWith('del-1');
    expect(onDelete).toHaveBeenCalledWith('del-2');
  });

  it('returns correct counts (newDocuments, duplicates, deleted)', () => {
    localHashes.add('hash-existing-1');
    localHashes.add('hash-existing-2');

    const delta = makeDelta({
      upserts: [
        makeEntry({ id: 'new-1', contentHash: 'hash-new-1' }),
        makeEntry({ id: 'new-2', contentHash: 'hash-new-2' }),
        makeEntry({ id: 'dup-1', contentHash: 'hash-existing-1' }),
        makeEntry({ id: 'dup-2', contentHash: 'hash-existing-2' }),
        makeEntry({ id: 'new-3', contentHash: 'hash-new-3' }),
      ],
      deletions: ['del-1', 'del-2', 'del-3'],
    });

    const result = applyKGDelta(delta, localHashes, onNewDocument, onDelete);

    expect(result.newDocuments).toBe(3);
    expect(result.duplicates).toBe(2);
    expect(result.deleted).toBe(3);
  });

  it('adds new hashes to localHashes set', () => {
    expect(localHashes.size).toBe(0);

    const delta = makeDelta({
      upserts: [
        makeEntry({ id: 'doc-a', contentHash: 'hash-a' }),
        makeEntry({ id: 'doc-b', contentHash: 'hash-b' }),
      ],
    });

    applyKGDelta(delta, localHashes, onNewDocument, onDelete);

    expect(localHashes.has('hash-a')).toBe(true);
    expect(localHashes.has('hash-b')).toBe(true);
    expect(localHashes.size).toBe(2);
  });

  it('handles empty delta gracefully', () => {
    const delta = makeDelta();

    const result = applyKGDelta(delta, localHashes, onNewDocument, onDelete);

    expect(result.newDocuments).toBe(0);
    expect(result.duplicates).toBe(0);
    expect(result.deleted).toBe(0);
    expect(onNewDocument).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('does not call onNewDocument for second entry with same hash in same delta', () => {
    // Two entries with the same contentHash in the same delta:
    // the first should be accepted, the second should be a duplicate
    const delta = makeDelta({
      upserts: [
        makeEntry({ id: 'doc-first', contentHash: 'hash-same' }),
        makeEntry({ id: 'doc-second', contentHash: 'hash-same' }),
      ],
    });

    const result = applyKGDelta(delta, localHashes, onNewDocument, onDelete);

    expect(result.newDocuments).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(onNewDocument).toHaveBeenCalledTimes(1);
  });
});

// ─── KG_SYNC_MAX_BYTES ─────────────────────────────────────────────────────

describe('KG_SYNC_MAX_BYTES', () => {
  it('is defined as 10MB', () => {
    expect(KG_SYNC_MAX_BYTES).toBe(10 * 1024 * 1024);
  });
});
