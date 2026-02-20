// Document Store — SQLite storage for document metadata and entities.
// The actual content is chunked and stored in the vector store (LanceDB).
// This store handles metadata, deduplication, and entity resolution.

import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type {
  Document,
  DocumentSource,
  Entity,
  EntityType,
  EntityMention,
} from './types.js';

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_path TEXT,
    title TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    indexed_at TEXT NOT NULL,
    metadata TEXT
  );

  CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    aliases TEXT,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    metadata TEXT
  );

  CREATE TABLE IF NOT EXISTS entity_mentions (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES entities(id),
    document_id TEXT NOT NULL REFERENCES documents(id),
    chunk_id TEXT NOT NULL,
    context TEXT,
    mentioned_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_docs_source ON documents(source);
  CREATE INDEX IF NOT EXISTS idx_docs_hash ON documents(content_hash);
  CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
  CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
  CREATE INDEX IF NOT EXISTS idx_mentions_entity ON entity_mentions(entity_id);
  CREATE INDEX IF NOT EXISTS idx_mentions_doc ON entity_mentions(document_id);
`;

interface DocumentRow {
  id: string;
  source: string;
  source_path: string | null;
  title: string;
  content_hash: string;
  mime_type: string;
  created_at: string;
  updated_at: string;
  indexed_at: string;
  metadata: string | null;
}

interface EntityRow {
  id: string;
  name: string;
  type: string;
  aliases: string | null;
  first_seen: string;
  last_seen: string;
  metadata: string | null;
}

function rowToDocument(row: DocumentRow, content: string = ''): Document {
  return {
    id: row.id,
    source: row.source as DocumentSource,
    sourcePath: row.source_path ?? undefined,
    title: row.title,
    content,
    contentHash: row.content_hash,
    mimeType: row.mime_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    indexedAt: row.indexed_at,
    metadata: row.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : {},
  };
}

function rowToEntity(row: EntityRow): Entity {
  return {
    id: row.id,
    name: row.name,
    type: row.type as EntityType,
    aliases: row.aliases ? JSON.parse(row.aliases) as string[] : [],
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    metadata: row.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : {},
  };
}

export class DocumentStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_TABLES);
  }

  // --- Document operations ---

  /**
   * Insert a document. Returns the document ID.
   * If a document with the same content_hash already exists, returns its ID (dedup).
   */
  insertDocument(params: {
    source: DocumentSource;
    sourcePath?: string;
    title: string;
    contentHash: string;
    mimeType: string;
    metadata?: Record<string, unknown>;
  }): { id: string; deduplicated: boolean } {
    // Check for duplicate by content hash
    const existing = this.db.prepare(
      'SELECT id FROM documents WHERE content_hash = ?'
    ).get(params.contentHash) as { id: string } | undefined;

    if (existing) {
      return { id: existing.id, deduplicated: true };
    }

    const id = nanoid();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO documents (id, source, source_path, title, content_hash, mime_type, created_at, updated_at, indexed_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.source,
      params.sourcePath ?? null,
      params.title,
      params.contentHash,
      params.mimeType,
      now,
      now,
      now,
      params.metadata ? JSON.stringify(params.metadata) : null,
    );

    return { id, deduplicated: false };
  }

  /**
   * Get a document by ID.
   */
  getDocument(id: string): Document | null {
    const row = this.db.prepare(
      'SELECT * FROM documents WHERE id = ?'
    ).get(id) as DocumentRow | undefined;
    return row ? rowToDocument(row) : null;
  }

  /**
   * Get a document by source path (for re-indexing checks).
   */
  getDocumentBySourcePath(sourcePath: string): Document | null {
    const row = this.db.prepare(
      'SELECT * FROM documents WHERE source_path = ?'
    ).get(sourcePath) as DocumentRow | undefined;
    return row ? rowToDocument(row) : null;
  }

  /**
   * List documents with optional filtering.
   */
  listDocuments(options?: {
    source?: DocumentSource;
    limit?: number;
    offset?: number;
  }): Document[] {
    let query = 'SELECT * FROM documents';
    const params: unknown[] = [];

    if (options?.source) {
      query += ' WHERE source = ?';
      params.push(options.source);
    }

    query += ' ORDER BY indexed_at DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = this.db.prepare(query).all(...params) as DocumentRow[];
    return rows.map(r => rowToDocument(r));
  }

  /**
   * Delete a document and its entity mentions.
   */
  deleteDocument(id: string): boolean {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM entity_mentions WHERE document_id = ?').run(id);
      const result = this.db.prepare('DELETE FROM documents WHERE id = ?').run(id);
      return result.changes > 0;
    });
    return transaction();
  }

  /**
   * Update indexed_at timestamp (for re-indexing).
   */
  markReindexed(id: string): void {
    const now = new Date().toISOString();
    this.db.prepare(
      'UPDATE documents SET indexed_at = ?, updated_at = ? WHERE id = ?'
    ).run(now, now, id);
  }

  /**
   * Get source statistics.
   */
  getStats(): { totalDocuments: number; sources: Record<string, number> } {
    const total = this.db.prepare(
      'SELECT COUNT(*) as count FROM documents'
    ).get() as { count: number };

    const sourceCounts = this.db.prepare(
      'SELECT source, COUNT(*) as count FROM documents GROUP BY source'
    ).all() as { source: string; count: number }[];

    const sources: Record<string, number> = {};
    for (const row of sourceCounts) {
      sources[row.source] = row.count;
    }

    return { totalDocuments: total.count, sources };
  }

  // --- Entity operations ---

  insertEntity(params: {
    name: string;
    type: EntityType;
    aliases?: string[];
    metadata?: Record<string, unknown>;
  }): string {
    const id = nanoid();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO entities (id, name, type, aliases, first_seen, last_seen, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.name,
      params.type,
      params.aliases ? JSON.stringify(params.aliases) : null,
      now,
      now,
      params.metadata ? JSON.stringify(params.metadata) : null,
    );

    return id;
  }

  getEntity(id: string): Entity | null {
    const row = this.db.prepare(
      'SELECT * FROM entities WHERE id = ?'
    ).get(id) as EntityRow | undefined;
    return row ? rowToEntity(row) : null;
  }

  findEntitiesByName(name: string): Entity[] {
    const rows = this.db.prepare(
      'SELECT * FROM entities WHERE name LIKE ? OR aliases LIKE ?'
    ).all(`%${name}%`, `%${name}%`) as EntityRow[];
    return rows.map(rowToEntity);
  }

  insertMention(params: {
    entityId: string;
    documentId: string;
    chunkId: string;
    context?: string;
  }): string {
    const id = nanoid();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO entity_mentions (id, entity_id, document_id, chunk_id, context, mentioned_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, params.entityId, params.documentId, params.chunkId, params.context ?? null, now);

    // Update entity's last_seen
    this.db.prepare(
      'UPDATE entities SET last_seen = ? WHERE id = ?'
    ).run(now, params.entityId);

    return id;
  }

  getMentionsForDocument(documentId: string): EntityMention[] {
    const rows = this.db.prepare(
      'SELECT * FROM entity_mentions WHERE document_id = ?'
    ).all(documentId) as {
      id: string;
      entity_id: string;
      document_id: string;
      chunk_id: string;
      context: string | null;
      mentioned_at: string;
    }[];

    return rows.map(r => ({
      entityId: r.entity_id,
      documentId: r.document_id,
      chunkId: r.chunk_id,
      context: r.context ?? '',
      mentionedAt: r.mentioned_at,
    }));
  }
}
