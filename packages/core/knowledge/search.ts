// Semantic Search — Query the knowledge graph using natural language.

import type { LLMProvider } from '../llm/types.js';
import type { DocumentSource, SearchResult, DocumentChunk } from './types.js';
import type { DocumentStore } from './document-store.js';
import type { VectorStore } from './vector-store.js';

export class SemanticSearch {
  private llm: LLMProvider;
  private documentStore: DocumentStore;
  private vectorStore: VectorStore;
  private embeddingModel: string;

  constructor(config: {
    llm: LLMProvider;
    documentStore: DocumentStore;
    vectorStore: VectorStore;
    embeddingModel: string;
  }) {
    this.llm = config.llm;
    this.documentStore = config.documentStore;
    this.vectorStore = config.vectorStore;
    this.embeddingModel = config.embeddingModel;
  }

  /**
   * Search the knowledge graph with a natural language query.
   */
  async search(query: string, options?: {
    limit?: number;
    source?: DocumentSource;
  }): Promise<SearchResult[]> {
    const limit = options?.limit ?? 10;

    // Generate query embedding
    const embedResponse = await this.llm.embed({
      model: this.embeddingModel,
      input: query,
    });

    const queryEmbedding = embedResponse.embeddings[0];
    if (!queryEmbedding) {
      return [];
    }

    // Search for nearest neighbors (fetch extra to allow for filtering)
    const fetchLimit = options?.source ? limit * 3 : limit;
    const vectorResults = await this.vectorStore.search(queryEmbedding, fetchLimit);

    // Enrich with document metadata and filter by source
    const results: SearchResult[] = [];

    for (const vr of vectorResults) {
      if (results.length >= limit) break;

      const document = this.documentStore.getDocument(vr.documentId);
      if (!document) continue;

      // Filter by source if requested
      if (options?.source && document.source !== options.source) continue;

      const chunk: DocumentChunk = {
        id: vr.id,
        documentId: vr.documentId,
        content: vr.content,
        chunkIndex: vr.chunkIndex,
        metadata: vr.metadata ? JSON.parse(vr.metadata) as Record<string, unknown> : {},
      };

      results.push({
        chunk,
        document,
        score: vr.score,
      });
    }

    return results;
  }
}
