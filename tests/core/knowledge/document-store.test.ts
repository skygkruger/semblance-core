// Tests for DocumentStore — CRUD, deduplication, listing, stats.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { DocumentStore } from '@semblance/core/knowledge/document-store.js';

describe('DocumentStore', () => {
  let db: Database.Database;
  let store: DocumentStore;

  beforeEach(() => {
    db = new Database(':memory:');
    store = new DocumentStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('inserts a document and retrieves it by ID', () => {
    const result = store.insertDocument({
      source: 'local_file',
      sourcePath: '/home/user/notes.txt',
      title: 'My Notes',
      contentHash: 'abc123',
      mimeType: 'text/plain',
      metadata: { size: 42 },
    });

    expect(result.id).toBeDefined();
    expect(result.deduplicated).toBe(false);

    const retrieved = store.getDocument(result.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(result.id);
    expect(retrieved!.title).toBe('My Notes');
    expect(retrieved!.source).toBe('local_file');
    expect(retrieved!.metadata).toEqual({ size: 42 });
  });

  it('returns null for non-existent document', () => {
    const result = store.getDocument('nonexistent');
    expect(result).toBeNull();
  });

  it('deduplicates by content hash', () => {
    const hash = 'same_hash_123';
    const first = store.insertDocument({
      source: 'local_file',
      title: 'First',
      contentHash: hash,
      mimeType: 'text/plain',
    });
    expect(first.deduplicated).toBe(false);

    const second = store.insertDocument({
      source: 'local_file',
      title: 'Second',
      contentHash: hash,
      mimeType: 'text/plain',
    });
    expect(second.deduplicated).toBe(true);
    expect(second.id).toBe(first.id);
  });

  it('lists documents with filtering by source', () => {
    store.insertDocument({ source: 'local_file', title: 'File 1', contentHash: 'h1', mimeType: 'text/plain' });
    store.insertDocument({ source: 'email', title: 'Email 1', contentHash: 'h2', mimeType: 'text/plain' });
    store.insertDocument({ source: 'local_file', title: 'File 2', contentHash: 'h3', mimeType: 'text/plain' });

    const files = store.listDocuments({ source: 'local_file' });
    expect(files).toHaveLength(2);
    expect(files.every(d => d.source === 'local_file')).toBe(true);

    const emails = store.listDocuments({ source: 'email' });
    expect(emails).toHaveLength(1);
  });

  it('lists documents with limit and offset', () => {
    for (let i = 0; i < 5; i++) {
      store.insertDocument({ source: 'local_file', title: `Doc ${i}`, contentHash: `h${i}`, mimeType: 'text/plain' });
    }

    const page1 = store.listDocuments({ limit: 2 });
    expect(page1).toHaveLength(2);

    const page2 = store.listDocuments({ limit: 2, offset: 2 });
    expect(page2).toHaveLength(2);
  });

  it('deletes a document', () => {
    const result = store.insertDocument({
      source: 'local_file',
      title: 'Deletable',
      contentHash: 'delhash',
      mimeType: 'text/plain',
    });

    const deleted = store.deleteDocument(result.id);
    expect(deleted).toBe(true);
    expect(store.getDocument(result.id)).toBeNull();
  });

  it('returns correct stats', () => {
    store.insertDocument({ source: 'local_file', title: 'F1', contentHash: 'a', mimeType: 'text/plain' });
    store.insertDocument({ source: 'local_file', title: 'F2', contentHash: 'b', mimeType: 'text/plain' });
    store.insertDocument({ source: 'email', title: 'E1', contentHash: 'c', mimeType: 'text/plain' });

    const stats = store.getStats();
    expect(stats.totalDocuments).toBe(3);
    expect(stats.sources['local_file']).toBe(2);
    expect(stats.sources['email']).toBe(1);
  });

  it('inserts and retrieves entities', () => {
    const entityId = store.insertEntity({
      name: 'John Doe',
      type: 'person',
      aliases: ['Johnny', 'J.D.'],
      metadata: { role: 'developer' },
    });

    expect(entityId).toBeDefined();

    const retrieved = store.getEntity(entityId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('John Doe');
    expect(retrieved!.aliases).toEqual(['Johnny', 'J.D.']);
    expect(retrieved!.metadata).toEqual({ role: 'developer' });
  });

  it('finds entities by name', () => {
    store.insertEntity({ name: 'John Doe', type: 'person' });
    store.insertEntity({ name: 'Jane Smith', type: 'person' });

    const results = store.findEntitiesByName('John');
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('John Doe');
  });

  it('retrieves document by source path', () => {
    store.insertDocument({
      source: 'local_file',
      sourcePath: '/docs/readme.md',
      title: 'README',
      contentHash: 'readmehash',
      mimeType: 'text/markdown',
    });

    const doc = store.getDocumentBySourcePath('/docs/readme.md');
    expect(doc).toBeDefined();
    expect(doc!.title).toBe('README');

    const missing = store.getDocumentBySourcePath('/nonexistent');
    expect(missing).toBeNull();
  });
});
