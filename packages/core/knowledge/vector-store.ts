// Vector Store — LanceDB-backed vector storage for document chunk embeddings.
// LanceDB is embedded (Rust-native, no server process). No network access.
// Data stored as local Arrow/Parquet files.

import * as lancedb from '@lancedb/lancedb';
import type { Table as LanceTable } from '@lancedb/lancedb';

const TABLE_NAME = 'document_chunks';

export interface VectorChunk {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  embedding: number[];
  metadata: string;          // JSON string
}

export class VectorStore {
  private db: lancedb.Connection | null = null;
  private table: LanceTable | null = null;
  private dataDir: string;
  private dimensions: number;

  constructor(dataDir: string, dimensions: number = 768) {
    this.dataDir = dataDir;
    this.dimensions = dimensions;
  }

  /**
   * Initialize the vector store. Must be called before any operations.
   */
  async initialize(): Promise<void> {
    this.db = await lancedb.connect(this.dataDir);

    const tableNames = await this.db.tableNames();
    if (tableNames.includes(TABLE_NAME)) {
      this.table = await this.db.openTable(TABLE_NAME);
    }
  }

  /**
   * Insert chunks with embeddings into the vector store.
   */
  async insertChunks(chunks: VectorChunk[]): Promise<void> {
    if (!this.db) throw new Error('VectorStore not initialized');
    if (chunks.length === 0) return;

    const records = chunks.map(c => ({
      id: c.id,
      documentId: c.documentId,
      content: c.content,
      chunkIndex: c.chunkIndex,
      embedding: c.embedding,
      metadata: c.metadata,
    }));

    if (!this.table) {
      // Create the table with first batch of data
      this.table = await this.db.createTable(TABLE_NAME, records, {
        mode: 'create',
        existOk: true,
      });
    } else {
      await this.table.add(records);
    }
  }

  /**
   * Search for nearest neighbors by embedding vector.
   */
  async search(queryEmbedding: number[], limit: number = 10): Promise<Array<{
    id: string;
    documentId: string;
    content: string;
    chunkIndex: number;
    metadata: string;
    score: number;
  }>> {
    if (!this.table) return [];

    const results = await this.table
      .query()
      .nearestTo(queryEmbedding)
      .distanceType('cosine')
      .limit(limit)
      .toArray();

    return results.map(r => ({
      id: r['id'] as string,
      documentId: r['documentId'] as string,
      content: r['content'] as string,
      chunkIndex: r['chunkIndex'] as number,
      metadata: r['metadata'] as string,
      // LanceDB cosine distance: 0 = identical, 2 = opposite
      // Convert to similarity score: 1 - (distance / 2)
      score: 1 - ((r['_distance'] as number) / 2),
    }));
  }

  /**
   * Delete all chunks for a given document ID.
   */
  async deleteByDocumentId(documentId: string): Promise<void> {
    if (!this.table) return;
    await this.table.delete(`documentId = '${documentId}'`);
  }

  /**
   * Get total chunk count.
   */
  async count(): Promise<number> {
    if (!this.table) return 0;
    return await this.table.countRows();
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.table = null;
    }
  }
}
