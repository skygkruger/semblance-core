// Knowledge Graph — Unified interface for document indexing, search, and management.

import { getPlatform } from '../platform/index.js';
import type { LLMProvider } from '../llm/types.js';
import type {
  Document,
  DocumentSource,
  SearchResult,
} from './types.js';
import { DocumentStore } from './document-store.js';
import { VectorStore } from './vector-store.js';
import { Indexer } from './indexer.js';
import { SemanticSearch } from './search.js';
import { EmbeddingPipeline } from './embedding-pipeline.js';
import { scanDirectory, readFileContent } from './file-scanner.js';

export type {
  Document,
  DocumentSource,
  DocumentChunk,
  SearchResult,
  Entity,
  EntityType,
  EntityMention,
} from './types.js';

export { DocumentStore } from './document-store.js';
export { VectorStore } from './vector-store.js';
export type { VectorChunk } from './vector-store.js';
export { Indexer } from './indexer.js';
export { SemanticSearch } from './search.js';
export type { SearchOptions } from './search.js';
export { EmbeddingPipeline } from './embedding-pipeline.js';
export type { EmbeddingPipelineConfig, EmbeddingResult, EmbeddingProgress } from './embedding-pipeline.js';
export { RetroactiveEmbedder } from './retroactive-embedder.js';
export type { RetroactiveEmbedderConfig, RetroactiveResult, RetroactiveStatus } from './retroactive-embedder.js';
export { scanDirectory, readFileContent } from './file-scanner.js';
export type { ScannedFile, FileContent } from './file-scanner.js';
export { chunkText } from './chunker.js';
export type { ChunkerConfig, Chunk } from './chunker.js';

export interface KnowledgeGraph {
  /** Index a document into the knowledge graph */
  indexDocument(doc: {
    content: string;
    title: string;
    source: DocumentSource;
    sourcePath?: string;
    mimeType: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ documentId: string; chunksCreated: number; durationMs: number }>;

  /** Search the knowledge graph */
  search(query: string, options?: {
    limit?: number;
    source?: DocumentSource;
  }): Promise<SearchResult[]>;

  /** Scan and index files from a directory */
  scanDirectory(dirPath: string): Promise<{
    filesFound: number;
    filesIndexed: number;
    errors: string[];
  }>;

  /** Get document by ID */
  getDocument(id: string): Promise<Document | null>;

  /** Get all documents with optional filtering */
  listDocuments(options?: {
    source?: DocumentSource;
    limit?: number;
    offset?: number;
  }): Promise<Document[]>;

  /** Get indexing statistics */
  getStats(): Promise<{
    totalDocuments: number;
    totalChunks: number;
    sources: Record<string, number>;
  }>;

  /** Delete a document and its chunks */
  deleteDocument(id: string): Promise<void>;

  /** Access the underlying SemanticSearch instance (used by extensions) */
  readonly semanticSearch: SemanticSearch;
}

class KnowledgeGraphImpl implements KnowledgeGraph {
  private documentStore: DocumentStore;
  private vectorStore: VectorStore;
  private indexer: Indexer;
  readonly semanticSearch: SemanticSearch;

  constructor(
    documentStore: DocumentStore,
    vectorStore: VectorStore,
    indexer: Indexer,
    semanticSearch: SemanticSearch,
  ) {
    this.documentStore = documentStore;
    this.vectorStore = vectorStore;
    this.indexer = indexer;
    this.semanticSearch = semanticSearch;
  }

  async indexDocument(doc: {
    content: string;
    title: string;
    source: DocumentSource;
    sourcePath?: string;
    mimeType: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ documentId: string; chunksCreated: number; durationMs: number }> {
    const result = await this.indexer.indexDocument(doc);
    return {
      documentId: result.documentId,
      chunksCreated: result.chunksCreated,
      durationMs: result.durationMs,
    };
  }

  async search(query: string, options?: {
    limit?: number;
    source?: DocumentSource;
  }): Promise<SearchResult[]> {
    return this.semanticSearch.search(query, options);
  }

  async scanDirectory(dirPath: string): Promise<{
    filesFound: number;
    filesIndexed: number;
    errors: string[];
  }> {
    const files = await scanDirectory(dirPath);
    const errors: string[] = [];
    let filesIndexed = 0;

    for (const file of files) {
      try {
        const content = await readFileContent(file.path);
        await this.indexer.indexDocument({
          content: content.content,
          title: content.title,
          source: 'local_file',
          sourcePath: file.path,
          mimeType: content.mimeType,
          metadata: {
            size: file.size,
            lastModified: file.lastModified,
            extension: file.extension,
          },
        });
        filesIndexed++;
      } catch (err) {
        errors.push(`${file.path}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { filesFound: files.length, filesIndexed, errors };
  }

  async getDocument(id: string): Promise<Document | null> {
    return this.documentStore.getDocument(id);
  }

  async listDocuments(options?: {
    source?: DocumentSource;
    limit?: number;
    offset?: number;
  }): Promise<Document[]> {
    return this.documentStore.listDocuments(options);
  }

  async getStats(): Promise<{
    totalDocuments: number;
    totalChunks: number;
    sources: Record<string, number>;
  }> {
    const docStats = this.documentStore.getStats();
    const totalChunks = await this.vectorStore.count();
    return {
      totalDocuments: docStats.totalDocuments,
      totalChunks,
      sources: docStats.sources,
    };
  }

  async deleteDocument(id: string): Promise<void> {
    await this.vectorStore.deleteByDocumentId(id);
    this.documentStore.deleteDocument(id);
  }
}

/**
 * Create a KnowledgeGraph instance.
 */
export async function createKnowledgeGraph(config: {
  dataDir: string;
  llmProvider: LLMProvider;
  embeddingModel?: string;
  embeddingDimensions?: number;
}): Promise<KnowledgeGraph> {
  const p = getPlatform();
  const dataDir = config.dataDir;
  if (!p.fs.existsSync(dataDir)) {
    p.fs.mkdirSync(dataDir, { recursive: true });
  }

  // Initialize SQLite for document metadata
  const db = p.sqlite.openDatabase(p.path.join(dataDir, 'documents.db'));
  const documentStore = new DocumentStore(db);

  // Initialize LanceDB for vector storage
  const vectorDir = p.path.join(dataDir, 'vectors');
  if (!p.fs.existsSync(vectorDir)) {
    p.fs.mkdirSync(vectorDir, { recursive: true });
  }
  const vectorStore = new VectorStore(vectorDir);
  await vectorStore.initialize();

  const embeddingModel = config.embeddingModel ?? 'nomic-embed-text';
  const dimensions = config.embeddingDimensions ?? 768;

  // Create EmbeddingPipeline for batched, retried embedding operations
  const embeddingPipeline = new EmbeddingPipeline({
    llm: config.llmProvider,
    model: embeddingModel,
    dimensions,
  });

  const indexer = new Indexer({
    llm: config.llmProvider,
    documentStore,
    vectorStore,
    embeddingModel,
    embeddingPipeline,
  });

  const semanticSearch = new SemanticSearch({
    llm: config.llmProvider,
    documentStore,
    vectorStore,
    embeddingModel,
    embeddingPipeline,
  });

  return new KnowledgeGraphImpl(documentStore, vectorStore, indexer, semanticSearch);
}
