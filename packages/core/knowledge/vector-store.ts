// Vector Store — Delegates to PlatformAdapter's VectorStoreAdapter.
//
// This wrapper maintains the existing VectorStore API used by Indexer and
// SemanticSearch, but delegates all operations to the platform-specific
// VectorStoreAdapter (LanceDB on desktop, SQLite on mobile).
//
// CRITICAL: No direct LanceDB import. That lives only in
// packages/core/platform/desktop-vector-store.ts.

import { getPlatform } from '../platform/index.js';
import type { VectorStoreAdapter, VectorEntry } from '../platform/types.js';

const TABLE_NAME = 'document_chunks';

export interface VectorChunk {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  embedding: number[];
  metadata: string;          // JSON string
  sourceType?: string;       // DocumentSource type for cross-source filtering
  sourceId?: string;         // External source identifier (email ID, file path, etc.)
}

export class VectorStore {
  private adapter: VectorStoreAdapter | null = null;
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
    const p = getPlatform();
    if (!p.vectorStore) {
      throw new Error(
        '[VectorStore] Platform does not have a vectorStore configured. ' +
        'Ensure the platform adapter includes a VectorStoreAdapter.'
      );
    }
    this.adapter = p.vectorStore;
    await this.adapter.initialize(TABLE_NAME, this.dimensions);
  }

  /**
   * Initialize with an explicit adapter (for testing or custom setups).
   */
  async initializeWithAdapter(adapter: VectorStoreAdapter): Promise<void> {
    this.adapter = adapter;
    await this.adapter.initialize(TABLE_NAME, this.dimensions);
  }

  /**
   * Insert chunks with embeddings into the vector store.
   */
  async insertChunks(chunks: VectorChunk[]): Promise<void> {
    if (!this.adapter) throw new Error('VectorStore not initialized');
    if (chunks.length === 0) return;

    const entries: VectorEntry[] = chunks.map(c => ({
      id: c.id,
      documentId: c.documentId,
      content: c.content,
      chunkIndex: c.chunkIndex,
      vector: c.embedding,
      metadata: c.metadata,
      sourceType: c.sourceType,
      sourceId: c.sourceId,
    }));

    await this.adapter.insertChunks(entries);
  }

  /**
   * Search for nearest neighbors by embedding vector.
   * Optionally filter by source types.
   */
  async search(queryEmbedding: number[], limit: number = 10, options?: {
    sourceTypes?: string[];
  }): Promise<Array<{
    id: string;
    documentId: string;
    content: string;
    chunkIndex: number;
    metadata: string;
    sourceType: string;
    sourceId: string;
    score: number;
  }>> {
    if (!this.adapter) return [];
    return this.adapter.search(queryEmbedding, limit, {
      sourceTypes: options?.sourceTypes,
    });
  }

  /**
   * Delete all chunks for a given document ID.
   */
  async deleteByDocumentId(documentId: string): Promise<void> {
    if (!this.adapter) return;
    await this.adapter.deleteByDocumentId(documentId);
  }

  /**
   * Get total chunk count.
   */
  async count(): Promise<number> {
    if (!this.adapter) return 0;
    return this.adapter.count();
  }

  /**
   * Close the vector store.
   */
  close(): void {
    if (this.adapter) {
      this.adapter.close();
      this.adapter = null;
    }
  }
}
