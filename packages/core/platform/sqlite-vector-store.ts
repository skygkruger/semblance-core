// SQLite Vector Store — Brute-force cosine similarity over SQLite BLOBs.
//
// Mobile-compatible vector store using SQLite for storage and in-memory
// cosine similarity search. No native extensions required.
//
// Performance: 10,000 vectors x 768 dims ~= 30MB, <500ms search.
// This is well within acceptable limits for personal-scale data.

import type { DatabaseHandle } from './types.js';
import type { VectorStoreAdapter, VectorEntry, VectorResult, VectorFilter } from './types.js';

/**
 * Compute cosine similarity between two vectors.
 * Returns value in range [-1, 1] where 1 = identical direction.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Encode a number[] as a Buffer (Float32Array → raw bytes).
 */
function encodeVector(v: number[]): Buffer {
  const f32 = new Float32Array(v);
  return Buffer.from(f32.buffer);
}

/**
 * Decode a Buffer back to number[] (raw bytes → Float32Array).
 */
function decodeVector(buf: Buffer): number[] {
  const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return Array.from(f32);
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS vector_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    vector BLOB NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    source_type TEXT NOT NULL DEFAULT '',
    source_id TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_vc_document_id ON vector_chunks(document_id);
  CREATE INDEX IF NOT EXISTS idx_vc_source_type ON vector_chunks(source_type);
`;

export class SQLiteVectorStore implements VectorStoreAdapter {
  private db: DatabaseHandle;
  private initialized = false;

  constructor(db: DatabaseHandle) {
    this.db = db;
  }

  async initialize(_name: string, _dimensions: number): Promise<void> {
    this.db.exec(CREATE_TABLE);
    this.initialized = true;
  }

  async insertChunks(chunks: VectorEntry[]): Promise<void> {
    if (!this.initialized) throw new Error('SQLiteVectorStore not initialized');
    if (chunks.length === 0) return;

    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO vector_chunks (id, document_id, content, chunk_index, vector, metadata, source_type, source_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertAll = this.db.transaction((items: VectorEntry[]) => {
      for (const c of items) {
        insert.run(
          c.id,
          c.documentId,
          c.content,
          c.chunkIndex,
          encodeVector(c.vector),
          c.metadata,
          c.sourceType ?? '',
          c.sourceId ?? '',
        );
      }
    });

    insertAll(chunks);
  }

  async search(queryVector: number[], limit: number = 10, filter?: VectorFilter): Promise<VectorResult[]> {
    if (!this.initialized) return [];

    // Build query — optionally filter by sourceType
    let rows: Array<{
      id: string;
      document_id: string;
      content: string;
      chunk_index: number;
      vector: Buffer;
      metadata: string;
      source_type: string;
      source_id: string;
    }>;

    if (filter?.sourceTypes && filter.sourceTypes.length > 0) {
      const placeholders = filter.sourceTypes.map(() => '?').join(',');
      rows = this.db.prepare(
        `SELECT id, document_id, content, chunk_index, vector, metadata, source_type, source_id
         FROM vector_chunks WHERE source_type IN (${placeholders})`
      ).all(...filter.sourceTypes) as typeof rows;
    } else {
      rows = this.db.prepare(
        `SELECT id, document_id, content, chunk_index, vector, metadata, source_type, source_id
         FROM vector_chunks`
      ).all() as typeof rows;
    }

    // Compute cosine similarity for each row
    const scored: VectorResult[] = rows.map(r => ({
      id: r.id,
      documentId: r.document_id,
      content: r.content,
      chunkIndex: r.chunk_index,
      metadata: r.metadata,
      sourceType: r.source_type,
      sourceId: r.source_id,
      score: cosineSimilarity(queryVector, decodeVector(r.vector)),
    }));

    // Sort by score descending, return top-K
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    if (!this.initialized) return;
    this.db.prepare('DELETE FROM vector_chunks WHERE document_id = ?').run(documentId);
  }

  async count(): Promise<number> {
    if (!this.initialized) return 0;
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM vector_chunks').get() as { cnt: number };
    return row.cnt;
  }

  close(): void {
    // Database handle is managed externally — we don't close it here.
    this.initialized = false;
  }
}
