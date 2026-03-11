// SQLite Vector Store — Mobile vector storage using SQLite with brute-force
// cosine similarity. Replaces LanceDB (which requires native Rust bindings
// not available on React Native).
//
// Performance: Adequate for mobile knowledge bases (< 50k chunks).
// Desktop uses LanceDB for large-scale vector search.
//
// CRITICAL: No network imports. All vector operations are local.

import type {
  VectorStoreAdapter,
  VectorEntry,
  VectorResult,
  VectorFilter,
  DatabaseHandle,
} from '@semblance/core/platform/types';

/**
 * Cosine similarity between two vectors.
 * Returns value between -1 and 1 (1 = identical).
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dotProduct / denom;
}

/**
 * Create a SQLite-based vector store for mobile.
 * Stores vectors as JSON arrays in SQLite and performs brute-force
 * cosine similarity search.
 */
export function createSQLiteVectorStore(db: DatabaseHandle): VectorStoreAdapter {
  let tableName: string = 'vectors';
  let dimensions: number = 384;

  return {
    async initialize(name: string, dims: number): Promise<void> {
      tableName = `vectors_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      dimensions = dims;

      db.exec(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          content TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          vector TEXT NOT NULL,
          metadata TEXT DEFAULT '{}',
          source_type TEXT DEFAULT '',
          source_id TEXT DEFAULT '',
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_${tableName}_doc ON ${tableName}(document_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_${tableName}_source ON ${tableName}(source_type)`);
    },

    async insertChunks(chunks: VectorEntry[]): Promise<void> {
      if (chunks.length === 0) return;

      const insert = db.prepare(
        `INSERT OR REPLACE INTO ${tableName} (id, document_id, content, chunk_index, vector, metadata, source_type, source_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      const insertAll = db.transaction(() => {
        for (const chunk of chunks) {
          insert.run(
            chunk.id,
            chunk.documentId,
            chunk.content,
            chunk.chunkIndex,
            JSON.stringify(chunk.vector),
            chunk.metadata,
            chunk.sourceType ?? '',
            chunk.sourceId ?? '',
          );
        }
      });

      insertAll();
    },

    async search(queryVector: number[], limit: number, filter?: VectorFilter): Promise<VectorResult[]> {
      // Brute-force: load all vectors, compute cosine similarity, sort, take top N.
      // For mobile knowledge bases (< 50k chunks), this is fast enough.
      let sql = `SELECT id, document_id, content, chunk_index, vector, metadata, source_type, source_id FROM ${tableName}`;
      const params: unknown[] = [];

      if (filter?.sourceTypes && filter.sourceTypes.length > 0) {
        const placeholders = filter.sourceTypes.map(() => '?').join(',');
        sql += ` WHERE source_type IN (${placeholders})`;
        params.push(...filter.sourceTypes);
      }

      const rows = db.prepare(sql).all(...params) as Array<{
        id: string;
        document_id: string;
        content: string;
        chunk_index: number;
        vector: string;
        metadata: string;
        source_type: string;
        source_id: string;
      }>;

      // Compute cosine similarity for each row
      const scored: VectorResult[] = [];
      for (const row of rows) {
        let vector: number[];
        try {
          vector = JSON.parse(row.vector);
        } catch {
          continue;
        }
        const score = cosineSimilarity(queryVector, vector);
        scored.push({
          id: row.id,
          documentId: row.document_id,
          content: row.content,
          chunkIndex: row.chunk_index,
          metadata: row.metadata,
          sourceType: row.source_type,
          sourceId: row.source_id,
          score,
        });
      }

      // Sort by score descending, take top N
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit);
    },

    async deleteByDocumentId(documentId: string): Promise<void> {
      db.prepare(`DELETE FROM ${tableName} WHERE document_id = ?`).run(documentId);
    },

    async count(): Promise<number> {
      const result = db.prepare(`SELECT COUNT(*) as cnt FROM ${tableName}`).get() as { cnt: number } | undefined;
      return result?.cnt ?? 0;
    },

    close(): void {
      // The underlying database handle is managed by the platform adapter.
      // We don't close it here — the caller is responsible.
    },
  };
}
