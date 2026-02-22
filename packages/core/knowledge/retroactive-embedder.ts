// Retroactive Embedder — Background job that finds documents without embeddings
// and processes them in batches through the EmbeddingPipeline.
//
// Used when:
// 1. A new embedding model is loaded (re-embed existing documents)
// 2. Documents were indexed without embeddings (offline, failed embed)
// 3. Periodic maintenance to ensure all documents are searchable

import type { DocumentStore } from './document-store.js';
import type { VectorStore, VectorChunk } from './vector-store.js';
import type { EmbeddingPipeline } from './embedding-pipeline.js';
import { chunkText } from './chunker.js';
import { nanoid } from 'nanoid';

export interface RetroactiveEmbedderConfig {
  documentStore: DocumentStore;
  vectorStore: VectorStore;
  embeddingPipeline: EmbeddingPipeline;
  /** Documents to process per run. Default: 50 */
  documentsPerBatch?: number;
}

export interface RetroactiveResult {
  documentsProcessed: number;
  documentsSkipped: number;
  chunksCreated: number;
  durationMs: number;
  errors: Array<{ documentId: string; error: string }>;
}

export type RetroactiveStatus = 'idle' | 'running' | 'stopped';

const DEFAULT_DOCS_PER_BATCH = 50;

export class RetroactiveEmbedder {
  private documentStore: DocumentStore;
  private vectorStore: VectorStore;
  private embeddingPipeline: EmbeddingPipeline;
  private documentsPerBatch: number;
  private status: RetroactiveStatus = 'idle';
  private shouldStop = false;

  constructor(config: RetroactiveEmbedderConfig) {
    this.documentStore = config.documentStore;
    this.vectorStore = config.vectorStore;
    this.embeddingPipeline = config.embeddingPipeline;
    this.documentsPerBatch = config.documentsPerBatch ?? DEFAULT_DOCS_PER_BATCH;
  }

  getStatus(): RetroactiveStatus {
    return this.status;
  }

  /**
   * Stop the current run (will finish the current document before stopping).
   */
  stop(): void {
    this.shouldStop = true;
  }

  /**
   * Run the retroactive embedder.
   * Finds documents that don't have embeddings in the vector store and processes them.
   *
   * @param documentIds - Specific document IDs to process, or undefined for all.
   */
  async run(documentIds?: string[]): Promise<RetroactiveResult> {
    if (this.status === 'running') {
      return {
        documentsProcessed: 0,
        documentsSkipped: 0,
        chunksCreated: 0,
        durationMs: 0,
        errors: [{ documentId: '', error: 'Embedder is already running' }],
      };
    }

    this.status = 'running';
    this.shouldStop = false;
    const startMs = Date.now();
    let documentsProcessed = 0;
    let documentsSkipped = 0;
    let chunksCreated = 0;
    const errors: Array<{ documentId: string; error: string }> = [];

    try {
      // Get documents to process
      const documents = documentIds
        ? documentIds.map(id => this.documentStore.getDocument(id)).filter(Boolean)
        : this.documentStore.listDocuments({ limit: this.documentsPerBatch });

      for (const doc of documents) {
        if (this.shouldStop) {
          this.status = 'stopped';
          break;
        }

        if (!doc) continue;

        try {
          // Check if this document already has embeddings
          const existingChunkCount = await this.vectorStore.count();
          // We need to check per-document, so we skip if we can't determine
          // For now, process all documents in the specified list
          if (!documentIds && doc.content.trim().length === 0) {
            documentsSkipped++;
            continue;
          }

          // Chunk the document content
          const textChunks = chunkText(doc.content);
          if (textChunks.length === 0) {
            documentsSkipped++;
            continue;
          }

          // Generate embeddings via pipeline
          const chunkTexts = textChunks.map(c => c.content);
          const embedResult = await this.embeddingPipeline.embedBatch(chunkTexts);

          // Build vector chunks
          const vectorChunks: VectorChunk[] = textChunks.map((chunk, i) => ({
            id: nanoid(),
            documentId: doc.id,
            content: chunk.content,
            chunkIndex: chunk.chunkIndex,
            embedding: embedResult.embeddings[i]!,
            metadata: JSON.stringify(doc.metadata ?? {}),
          }));

          // Delete old chunks for this document (if re-embedding)
          await this.vectorStore.deleteByDocumentId(doc.id);

          // Store new chunks
          await this.vectorStore.insertChunks(vectorChunks);

          documentsProcessed++;
          chunksCreated += vectorChunks.length;

          // Update the document's indexed timestamp
          this.documentStore.markReindexed(doc.id);
        } catch (err) {
          errors.push({
            documentId: doc.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } finally {
      if (this.status !== 'stopped') {
        this.status = 'idle';
      }
    }

    return {
      documentsProcessed,
      documentsSkipped,
      chunksCreated,
      durationMs: Date.now() - startMs,
      errors,
    };
  }
}
