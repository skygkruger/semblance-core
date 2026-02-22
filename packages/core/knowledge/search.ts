// Semantic Search — Query the knowledge graph using natural language.

import type { LLMProvider } from '../llm/types.js';
import type { EmbeddingPipeline } from './embedding-pipeline.js';
import type { DocumentSource, SearchResult, DocumentChunk } from './types.js';
import type { DocumentStore } from './document-store.js';
import type { VectorStore } from './vector-store.js';

export interface SearchOptions {
  /** Maximum results to return. Default: 10 */
  limit?: number;
  /** Filter by document source type (legacy single source) */
  source?: DocumentSource;
  /** Filter by multiple source types */
  sourceTypes?: DocumentSource[];
  /** Minimum similarity score (0–1). Default: 0 */
  minScore?: number;
  /** Filter by date range (ISO 8601 strings) */
  dateRange?: {
    from?: string;
    to?: string;
  };
}

export class SemanticSearch {
  private llm: LLMProvider;
  private embeddingPipeline: EmbeddingPipeline | null;
  private documentStore: DocumentStore;
  private vectorStore: VectorStore;
  private embeddingModel: string;

  constructor(config: {
    llm: LLMProvider;
    documentStore: DocumentStore;
    vectorStore: VectorStore;
    embeddingModel: string;
    embeddingPipeline?: EmbeddingPipeline;
  }) {
    this.llm = config.llm;
    this.embeddingPipeline = config.embeddingPipeline ?? null;
    this.documentStore = config.documentStore;
    this.vectorStore = config.vectorStore;
    this.embeddingModel = config.embeddingModel;
  }

  /**
   * Search the knowledge graph with a natural language query.
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const limit = options?.limit ?? 10;
    const minScore = options?.minScore ?? 0;

    // Generate query embedding (prefer pipeline if available)
    let queryEmbedding: number[];
    if (this.embeddingPipeline) {
      queryEmbedding = await this.embeddingPipeline.embedSingle(query);
    } else {
      const embedResponse = await this.llm.embed({
        model: this.embeddingModel,
        input: query,
      });
      const first = embedResponse.embeddings[0];
      if (!first) return [];
      queryEmbedding = first;
    }

    // Build source type filter for vector search
    const sourceTypes: string[] | undefined =
      options?.sourceTypes ??
      (options?.source ? [options.source] : undefined);

    // Search for nearest neighbors (fetch extra to allow for score/date filtering)
    const fetchLimit = (sourceTypes || minScore > 0 || options?.dateRange) ? limit * 3 : limit;
    const vectorResults = await this.vectorStore.search(queryEmbedding, fetchLimit, {
      sourceTypes,
    });

    // Enrich with document metadata and apply filters
    const results: SearchResult[] = [];

    for (const vr of vectorResults) {
      if (results.length >= limit) break;

      // Score filter
      if (vr.score < minScore) continue;

      const document = this.documentStore.getDocument(vr.documentId);
      if (!document) continue;

      // Source type filter (document-level, ensures correctness even if vector store didn't filter)
      if (sourceTypes && sourceTypes.length > 0 && !sourceTypes.includes(document.source)) continue;

      // Date range filter
      if (options?.dateRange) {
        const docDate = document.createdAt;
        if (options.dateRange.from && docDate < options.dateRange.from) continue;
        if (options.dateRange.to && docDate > options.dateRange.to) continue;
      }

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
