// Desktop Vector Store — LanceDB wrapper implementing VectorStoreAdapter.
//
// This is the ONLY file in packages/core/ that imports @lancedb/lancedb.
// All other code accesses vector storage through VectorStoreAdapter.

import * as lancedb from '@lancedb/lancedb';
import type { Table as LanceTable } from '@lancedb/lancedb';
import type { VectorStoreAdapter, VectorEntry, VectorResult, VectorFilter } from './types.js';

export class LanceDBVectorStore implements VectorStoreAdapter {
  private dataDir: string;
  private db: lancedb.Connection | null = null;
  private table: LanceTable | null = null;
  private tableName: string = 'document_chunks';
  private dimensions: number = 768;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  async initialize(name: string, dimensions: number): Promise<void> {
    this.tableName = name;
    this.dimensions = dimensions;
    this.db = await lancedb.connect(this.dataDir);

    const tableNames = await this.db.tableNames();
    if (tableNames.includes(this.tableName)) {
      this.table = await this.db.openTable(this.tableName);
    }
  }

  async insertChunks(chunks: VectorEntry[]): Promise<void> {
    if (!this.db) throw new Error('LanceDBVectorStore not initialized');
    if (chunks.length === 0) return;

    const records = chunks.map(c => ({
      id: c.id,
      documentId: c.documentId,
      content: c.content,
      chunkIndex: c.chunkIndex,
      embedding: c.vector,
      metadata: c.metadata,
      sourceType: c.sourceType ?? '',
      sourceId: c.sourceId ?? '',
    }));

    if (!this.table) {
      this.table = await this.db.createTable(this.tableName, records, {
        mode: 'create',
        existOk: true,
      });
    } else {
      await this.table.add(records);
    }
  }

  async search(queryVector: number[], limit: number = 10, filter?: VectorFilter): Promise<VectorResult[]> {
    if (!this.table) return [];

    const fetchLimit = filter?.sourceTypes ? limit * 3 : limit;

    const results = await this.table
      .query()
      .nearestTo(queryVector)
      .distanceType('cosine')
      .limit(fetchLimit)
      .toArray();

    let mapped: VectorResult[] = results.map(r => ({
      id: r['id'] as string,
      documentId: r['documentId'] as string,
      content: r['content'] as string,
      chunkIndex: r['chunkIndex'] as number,
      metadata: (r['metadata'] as string) ?? '',
      sourceType: (r['sourceType'] as string) ?? '',
      sourceId: (r['sourceId'] as string) ?? '',
      // LanceDB cosine distance: 0 = identical, 2 = opposite
      // Convert to similarity score: 1 - (distance / 2)
      score: 1 - ((r['_distance'] as number) / 2),
    }));

    if (filter?.sourceTypes && filter.sourceTypes.length > 0) {
      mapped = mapped.filter(r => filter.sourceTypes!.includes(r.sourceType));
    }

    return mapped.slice(0, limit);
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    if (!this.table) return;
    await this.table.delete(`documentId = '${documentId}'`);
  }

  async count(): Promise<number> {
    if (!this.table) return 0;
    return await this.table.countRows();
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.table = null;
    }
  }
}
