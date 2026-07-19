// Indexer — Pipeline that chunks documents, generates embeddings, and stores them.

import { nanoid } from 'nanoid';
import { sha256 } from '../types/signing.js';
import { getPlatform } from '../platform/index.js';
import type { LLMProvider } from '../llm/types.js';
import type { EmbeddingPipeline } from './embedding-pipeline.js';
import type { DocumentSource, DocumentChunk } from './types.js';
import type { DocumentStore } from './document-store.js';
import type { VectorStore } from './vector-store.js';
import { chunkText } from './chunker.js';
import type { VaultFileIngestHooks } from './vault-file-ingest.js';

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
  private vaultIngest?: VaultFileIngestHooks;

  constructor(config: {
    llm: LLMProvider;
    documentStore: DocumentStore;
    vectorStore: VectorStore;
    embeddingModel: string;
    embeddingPipeline?: EmbeddingPipeline;
    vaultIngest?: VaultFileIngestHooks;
  }) {
    this.llm = config.llm;
    this.embeddingPipeline = config.embeddingPipeline ?? null;
    this.documentStore = config.documentStore;
    this.vectorStore = config.vectorStore;
    this.embeddingModel = config.embeddingModel;
    this.vaultIngest = config.vaultIngest;
  }

  private async maybeNotifyVaultIngest(
    params: {
      sourcePath?: string;
      source: DocumentSource;
      mimeType: string;
      contentHash: string;
      metadata?: Record<string, unknown>;
    },
    result: { documentId: string; deduplicated: boolean },
  ): Promise<void> {
    if (!this.vaultIngest || !params.sourcePath || params.source !== 'local_file') {
      return;
    }

    const p = getPlatform();
    await this.vaultIngest.onFileIndexed({
      file: {
        absolutePath: params.sourcePath,
        basename: p.path.basename(params.sourcePath),
        mimeType: params.mimeType,
        contentHash: params.contentHash,
        byteLength: typeof params.metadata?.size === 'number' ? params.metadata.size : undefined,
        lastModified: typeof params.metadata?.lastModified === 'string'
          ? params.metadata.lastModified
          : undefined,
        extension: typeof params.metadata?.extension === 'string' ? params.metadata.extension : undefined,
      },
      documentId: result.documentId,
      deduplicated: result.deduplicated,
    });
  }

  /**
   * Remove an indexed local file by absolute source path and notify vault ingest hooks.
   */
  async removeDocumentBySourcePath(sourcePath: string): Promise<boolean> {
    const existing = this.documentStore.getDocumentBySourcePath(sourcePath);
    if (!existing) {
      return false;
    }

    await this.vectorStore.deleteByDocumentId(existing.id);
    this.documentStore.deleteDocument(existing.id);

    if (this.vaultIngest) {
      await this.vaultIngest.onFileDeleted({
        absolutePath: sourcePath,
        documentId: existing.id,
      });
    }

    return true;
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
          const unchanged = {
            documentId: existing.id,
            chunksCreated: 0,
            durationMs: Date.now() - startMs,
            deduplicated: true,
          };
          await this.maybeNotifyVaultIngest(
            {
              sourcePath: params.sourcePath,
              source: params.source,
              mimeType: params.mimeType,
              contentHash,
              metadata: params.metadata,
            },
            { documentId: unchanged.documentId, deduplicated: true },
          );
          return unchanged;
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
      const deduped = {
        documentId,
        chunksCreated: 0,
        durationMs: Date.now() - startMs,
        deduplicated: true,
      };
      await this.maybeNotifyVaultIngest(
        {
          sourcePath: params.sourcePath,
          source: params.source,
          mimeType: params.mimeType,
          contentHash,
          metadata: params.metadata,
        },
        { documentId: deduped.documentId, deduplicated: true },
      );
      return deduped;
    }

    // Chunk the content
    const textChunks = chunkText(params.content);
    if (textChunks.length === 0) {
      const empty = {
        documentId,
        chunksCreated: 0,
        durationMs: Date.now() - startMs,
        deduplicated: false,
      };
      await this.maybeNotifyVaultIngest(
        {
          sourcePath: params.sourcePath,
          source: params.source,
          mimeType: params.mimeType,
          contentHash,
          metadata: params.metadata,
        },
        { documentId: empty.documentId, deduplicated: false },
      );
      return empty;
    }

    // Generate embeddings in batch (prefer pipeline if available)
    const chunkTexts = textChunks.map(c => c.content);
    let embeddings: number[][];
    try {
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
    } catch (embedErr) {
      // Embedding failed — store document metadata without vectors
      // The document will be searchable by title/source but not by semantic similarity
      console.error(`[indexer] Embedding failed for "${params.title}", storing metadata only:`, embedErr);
      const failed = {
        documentId,
        chunksCreated: 0,
        durationMs: Date.now() - startMs,
        deduplicated: false,
      };
      await this.maybeNotifyVaultIngest(
        {
          sourcePath: params.sourcePath,
          source: params.source,
          mimeType: params.mimeType,
          contentHash,
          metadata: params.metadata,
        },
        { documentId: failed.documentId, deduplicated: false },
      );
      return failed;
    }

    // Build vector chunks — skip any chunks where embedding is missing
    const vectorChunks = textChunks
      .map((chunk, i) => {
        const embedding = embeddings[i];
        if (!embedding || embedding.length === 0) return null;
        return {
          id: nanoid(),
          documentId,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          embedding,
          metadata: JSON.stringify(params.metadata ?? {}),
          sourceType: params.source,
          sourceId: params.sourcePath ?? '',
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    // Store in vector database
    try {
      await this.vectorStore.insertChunks(vectorChunks);
    } catch (lanceErr) {
      // LanceDB insert failed — document metadata is already saved in SQLite,
      // so the document is searchable by title/source but not by semantic similarity.
      console.error(`[indexer] LanceDB insert failed for "${params.title}":`, lanceErr);
      const failed = {
        documentId,
        chunksCreated: 0,
        durationMs: Date.now() - startMs,
        deduplicated: false,
      };
      await this.maybeNotifyVaultIngest(
        {
          sourcePath: params.sourcePath,
          source: params.source,
          mimeType: params.mimeType,
          contentHash,
          metadata: params.metadata,
        },
        { documentId: failed.documentId, deduplicated: false },
      );
      return failed;
    }

    const success = {
      documentId,
      chunksCreated: vectorChunks.length,
      durationMs: Date.now() - startMs,
      deduplicated: false,
    };
    await this.maybeNotifyVaultIngest(
      {
        sourcePath: params.sourcePath,
        source: params.source,
        mimeType: params.mimeType,
        contentHash,
        metadata: params.metadata,
      },
      { documentId: success.documentId, deduplicated: false },
    );
    return success;
  }
}
