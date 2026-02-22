// Indexer — Pipeline that chunks documents, generates embeddings, and stores them.

import { nanoid } from 'nanoid';
import { sha256 } from '../types/signing.js';
import type { LLMProvider } from '../llm/types.js';
import type { EmbeddingPipeline } from './embedding-pipeline.js';
import type { DocumentSource, DocumentChunk } from './types.js';
import type { DocumentStore } from './document-store.js';
import type { VectorStore } from './vector-store.js';
import { chunkText } from './chunker.js';

export interface IndexResult {
  documentId: string;
  chunksCreated: number;
  durationMs: number;
  deduplicated: boolean;
}

export class Indexer {
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
   * Index a document: chunk → embed → store.
   * Handles re-indexing if a document with the same source path exists.
   */
  async indexDocument(params: {
    content: string;
    title: string;
    source: DocumentSource;
    sourcePath?: string;
    mimeType: string;
    metadata?: Record<string, unknown>;
  }): Promise<IndexResult> {
    const startMs = Date.now();
    const contentHash = sha256(params.content);

    // Check for re-indexing by source path
    if (params.sourcePath) {
      const existing = this.documentStore.getDocumentBySourcePath(params.sourcePath);
      if (existing) {
        if (existing.contentHash === contentHash) {
          // Content unchanged — skip
          return {
            documentId: existing.id,
            chunksCreated: 0,
            durationMs: Date.now() - startMs,
            deduplicated: true,
          };
        }
        // Content changed — delete old chunks and re-index
        await this.vectorStore.deleteByDocumentId(existing.id);
        this.documentStore.deleteDocument(existing.id);
      }
    }

    // Insert document metadata
    const { id: documentId, deduplicated } = this.documentStore.insertDocument({
      source: params.source,
      sourcePath: params.sourcePath,
      title: params.title,
      contentHash,
      mimeType: params.mimeType,
      metadata: params.metadata,
    });

    if (deduplicated) {
      return {
        documentId,
        chunksCreated: 0,
        durationMs: Date.now() - startMs,
        deduplicated: true,
      };
    }

    // Chunk the content
    const textChunks = chunkText(params.content);
    if (textChunks.length === 0) {
      return {
        documentId,
        chunksCreated: 0,
        durationMs: Date.now() - startMs,
        deduplicated: false,
      };
    }

    // Generate embeddings in batch (prefer pipeline if available)
    const chunkTexts = textChunks.map(c => c.content);
    let embeddings: number[][];
    if (this.embeddingPipeline) {
      const pipelineResult = await this.embeddingPipeline.embedBatch(chunkTexts);
      embeddings = pipelineResult.embeddings;
    } else {
      const embedResponse = await this.llm.embed({
        model: this.embeddingModel,
        input: chunkTexts,
      });
      embeddings = embedResponse.embeddings;
    }

    // Build vector chunks
    const vectorChunks = textChunks.map((chunk, i) => ({
      id: nanoid(),
      documentId,
      content: chunk.content,
      chunkIndex: chunk.chunkIndex,
      embedding: embeddings[i]!,
      metadata: JSON.stringify(params.metadata ?? {}),
      sourceType: params.source,
      sourceId: params.sourcePath ?? '',
    }));

    // Store in vector database
    await this.vectorStore.insertChunks(vectorChunks);

    return {
      documentId,
      chunksCreated: vectorChunks.length,
      durationMs: Date.now() - startMs,
      deduplicated: false,
    };
  }
}
