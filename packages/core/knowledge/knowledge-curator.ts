// Knowledge Curator — Backend service for knowledge graph drill-down and curation.
//
// Provides operations for browsing, removing, recategorizing, reindexing,
// and deleting knowledge items. All curation operations are logged to the
// audit trail (pending_actions table) for accountability and undo support.
//
// CRITICAL: suggestCategories() NEVER includes chunk content in LLM prompt.
// Only title and metadata are sent for category inference.
//
// CRITICAL: No network imports. This file is in packages/core/.

import { nanoid } from 'nanoid';
import type { DatabaseHandle } from '../platform/types.js';
import type { LLMProvider } from '../llm/types.js';
import type { Document, DocumentSource } from './types.js';
import { DocumentStore } from './document-store.js';
import { VectorStore } from './vector-store.js';
import { Indexer } from './indexer.js';
import type {
  VisualizationCategory,
} from './connector-category-map.js';
import {
  getCategoryForEntityType,
  getAllCategories,
  CATEGORY_META,
} from './connector-category-map.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single knowledge item for display in the drill-down panel. */
export interface ChunkItem {
  chunkId: string;
  title: string;
  preview: string;             // First 200 characters of content
  fullContent: string;
  source: DocumentSource;
  category: VisualizationCategory;
  filePath?: string;
  indexedAt: string;           // ISO 8601
  fileSize?: number;
  mimeType?: string;
}

/** Result of a curation operation. */
export interface CurationResult {
  success: boolean;
  chunkId: string;
  operation: 'remove' | 'delete' | 'recategorize' | 'reindex';
  detail?: string;
}

/** A category suggestion from the LLM. */
export interface CategorySuggestion {
  category: VisualizationCategory;
  reason: string;
  confidence: number;          // 0–1
  isExisting: boolean;         // Whether this category already has items
}

// ─── Source → Category mapping ──────────────────────────────────────────────

/**
 * Map a DocumentSource to a VisualizationCategory.
 * Uses getCategoryForEntityType under the hood with 'document' entity type.
 */
function sourceToCategory(source: DocumentSource, metadata?: Record<string, unknown>): VisualizationCategory {
  return getCategoryForEntityType('document', { source, ...metadata });
}

// ─── KnowledgeCurator ───────────────────────────────────────────────────────

export class KnowledgeCurator {
  private documentStore: DocumentStore;
  private vectorStore: VectorStore;
  private indexer: Indexer;
  private db: DatabaseHandle;
  private llm: LLMProvider;
  private activeModel: string;

  constructor(config: {
    documentStore: DocumentStore;
    vectorStore: VectorStore;
    indexer: Indexer;
    db: DatabaseHandle;
    llm: LLMProvider;
    activeModel?: string;
  }) {
    this.documentStore = config.documentStore;
    this.vectorStore = config.vectorStore;
    this.indexer = config.indexer;
    this.db = config.db;
    this.llm = config.llm;
    this.activeModel = config.activeModel ?? 'llama3.2:3b';
  }

  // ─── List chunks by category ────────────────────────────────────────────

  /**
   * List knowledge items belonging to a visualization category.
   * Queries documents by source type, maps to category, filters, paginates.
   */
  async listChunksByCategory(
    category: VisualizationCategory,
    options?: {
      limit?: number;
      offset?: number;
      searchQuery?: string;
    },
  ): Promise<{ items: ChunkItem[]; total: number }> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const query = options?.searchQuery?.toLowerCase();

    // Get all documents — we need to filter by category which requires source mapping
    const allDocs = this.documentStore.listDocuments();

    // Filter documents that map to the requested category
    const matchingDocs = allDocs.filter(doc => {
      // Check for explicit category override in metadata first
      const overrideCategory = doc.metadata?.visualizationCategory as VisualizationCategory | undefined;
      const docCategory = overrideCategory ?? sourceToCategory(doc.source, doc.metadata);
      if (docCategory !== category) return false;

      // Apply text search filter if provided
      if (query) {
        const titleMatch = doc.title.toLowerCase().includes(query);
        const pathMatch = doc.sourcePath?.toLowerCase().includes(query) ?? false;
        return titleMatch || pathMatch;
      }

      return true;
    });

    const total = matchingDocs.length;

    // Paginate
    const paged = matchingDocs
      .sort((a, b) => b.indexedAt.localeCompare(a.indexedAt))
      .slice(offset, offset + limit);

    // Map to ChunkItem
    const items: ChunkItem[] = paged.map(doc => ({
      chunkId: doc.id,
      title: doc.title,
      preview: doc.content.slice(0, 200),
      fullContent: doc.content,
      source: doc.source,
      category,
      filePath: doc.sourcePath,
      indexedAt: doc.indexedAt,
      fileSize: typeof doc.metadata?.size === 'number' ? doc.metadata.size : undefined,
      mimeType: doc.mimeType || undefined,
    }));

    return { items, total };
  }

  // ─── Remove from graph (keep on disk) ───────────────────────────────────

  /**
   * Remove a document from the knowledge graph (vector store + metadata).
   * Does NOT delete the source file from disk.
   * Logged to audit trail as 'knowledge.remove'.
   */
  async removeFromGraph(chunkId: string): Promise<CurationResult> {
    const doc = this.documentStore.getDocument(chunkId);
    if (!doc) {
      return { success: false, chunkId, operation: 'remove', detail: 'Document not found' };
    }

    this.logCurationAction('knowledge.remove', chunkId, {
      title: doc.title,
      source: doc.source,
      sourcePath: doc.sourcePath,
    });

    // Delete from vector store (embeddings)
    await this.vectorStore.deleteByDocumentId(chunkId);

    // Delete from document store (SQLite metadata)
    this.documentStore.deleteDocument(chunkId);

    return { success: true, chunkId, operation: 'remove' };
  }

  // ─── Delete from disk ───────────────────────────────────────────────────

  /**
   * Delete a document from the knowledge graph AND from disk.
   * This is a destructive, irreversible operation.
   * CRITICAL: This must ONLY be called from the UI with user confirmation.
   * It must NEVER be an orchestrator tool.
   * Logged to audit trail as 'knowledge.delete'.
   */
  async deleteFromDisk(chunkId: string): Promise<CurationResult> {
    const doc = this.documentStore.getDocument(chunkId);
    if (!doc) {
      return { success: false, chunkId, operation: 'delete', detail: 'Document not found' };
    }

    this.logCurationAction('knowledge.delete', chunkId, {
      title: doc.title,
      source: doc.source,
      sourcePath: doc.sourcePath,
      mimeType: doc.mimeType,
    });

    // Delete from vector store
    await this.vectorStore.deleteByDocumentId(chunkId);

    // Delete from document store
    this.documentStore.deleteDocument(chunkId);

    // Delete the source file from disk if it's a local file
    if (doc.source === 'local_file' && doc.sourcePath) {
      try {
        const { getPlatform } = await import('../platform/index.js');
        const p = getPlatform();
        if (p.fs.existsSync(doc.sourcePath)) {
          p.fs.unlinkSync(doc.sourcePath);
        }
      } catch (err) {
        return {
          success: true,
          chunkId,
          operation: 'delete',
          detail: `Graph entry removed but file deletion failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    return { success: true, chunkId, operation: 'delete' };
  }

  // ─── Recategorize ──────────────────────────────────────────────────────

  /**
   * Change the visualization category of a document by updating its source metadata.
   * The category mapping is derived from the source field and metadata,
   * so recategorization updates the metadata to include a category override.
   * Logged to audit trail as 'knowledge.recategorize'.
   */
  async recategorize(
    chunkId: string,
    newCategory: VisualizationCategory,
  ): Promise<CurationResult> {
    const doc = this.documentStore.getDocument(chunkId);
    if (!doc) {
      return { success: false, chunkId, operation: 'recategorize', detail: 'Document not found' };
    }

    const oldCategory = sourceToCategory(doc.source, doc.metadata);

    this.logCurationAction('knowledge.recategorize', chunkId, {
      title: doc.title,
      fromCategory: oldCategory,
      toCategory: newCategory,
    });

    // Update the document metadata with a category override
    const updatedMetadata = { ...doc.metadata, visualizationCategory: newCategory };
    this.db.prepare(
      'UPDATE documents SET metadata = ?, updated_at = ? WHERE id = ?',
    ).run(JSON.stringify(updatedMetadata), new Date().toISOString(), chunkId);

    return { success: true, chunkId, operation: 'recategorize' };
  }

  // ─── Reindex ───────────────────────────────────────────────────────────

  /**
   * Re-index a document: delete old chunks, re-chunk, re-embed.
   * Useful after the document has been modified on disk.
   * Logged to audit trail as 'knowledge.reindex'.
   */
  async reindex(chunkId: string): Promise<CurationResult> {
    const doc = this.documentStore.getDocument(chunkId);
    if (!doc) {
      return { success: false, chunkId, operation: 'reindex', detail: 'Document not found' };
    }

    this.logCurationAction('knowledge.reindex', chunkId, {
      title: doc.title,
      source: doc.source,
    });

    // Delete old vector chunks
    await this.vectorStore.deleteByDocumentId(chunkId);

    // Re-read content if it's a local file
    let content = doc.content;
    if (doc.source === 'local_file' && doc.sourcePath) {
      try {
        const { readFileContent } = await import('./file-scanner.js');
        const fileContent = await readFileContent(doc.sourcePath);
        content = fileContent.content;
      } catch {
        return {
          success: false,
          chunkId,
          operation: 'reindex',
          detail: 'Could not read file from disk for re-indexing',
        };
      }
    }

    // Re-index the document with updated content
    await this.indexer.indexDocument({
      content,
      title: doc.title,
      source: doc.source,
      sourcePath: doc.sourcePath,
      mimeType: doc.mimeType,
      metadata: doc.metadata,
    });

    // Mark the document as reindexed
    this.documentStore.markReindexed(chunkId);

    return { success: true, chunkId, operation: 'reindex' };
  }

  // ─── Suggest categories ────────────────────────────────────────────────

  /**
   * Use LLM to suggest appropriate categories for a document.
   * CRITICAL: Never include chunk content in the LLM prompt.
   * Only title and metadata are used for category inference.
   */
  async suggestCategories(chunkId: string): Promise<CategorySuggestion[]> {
    const doc = this.documentStore.getDocument(chunkId);
    if (!doc) return [];

    const currentCategory = sourceToCategory(doc.source, doc.metadata);

    // Build the list of available categories with document counts
    const allCategories = getAllCategories();
    const allDocs = this.documentStore.listDocuments();
    const categoryCounts: Record<string, number> = {};
    for (const d of allDocs) {
      const cat = sourceToCategory(d.source, d.metadata);
      categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
    }

    const categoryList = allCategories.map(c => {
      const meta = CATEGORY_META[c];
      const count = categoryCounts[c] ?? 0;
      return `- ${c}: ${meta.displayName} (${count} items)`;
    }).join('\n');

    // CRITICAL: Only title and metadata in prompt — NEVER chunk content
    const prompt = `Given a document with the following properties:
- Title: "${doc.title}"
- Source type: ${doc.source}
- MIME type: ${doc.mimeType}
- File path: ${doc.sourcePath ?? 'N/A'}
- Current category: ${currentCategory}

Available categories:
${categoryList}

Suggest the top 3 most appropriate categories for this document. For each, provide:
1. The category ID (must be one from the list above)
2. A brief reason (1 sentence)
3. A confidence score (0.0 to 1.0)

Respond in JSON format:
[{"category": "...", "reason": "...", "confidence": 0.0}]`;

    try {
      const response = await this.llm.generate({
        model: this.activeModel,
        prompt,
        system: 'You are a document categorization assistant. Respond only with valid JSON.',
        temperature: 0.3,
        format: 'json',
      });

      const parsed = JSON.parse(response.text) as Array<{
        category: string;
        reason: string;
        confidence: number;
      }>;

      // Validate and map results
      const validCategories = new Set<string>(allCategories);
      const suggestions: CategorySuggestion[] = [];

      for (const item of parsed) {
        if (!validCategories.has(item.category)) continue;
        const cat = item.category as VisualizationCategory;
        suggestions.push({
          category: cat,
          reason: item.reason,
          confidence: Math.max(0, Math.min(1, item.confidence)),
          isExisting: (categoryCounts[cat] ?? 0) > 0,
        });
      }

      return suggestions.slice(0, 3);
    } catch {
      // If LLM is unavailable, return the current category as the only suggestion
      return [{
        category: currentCategory,
        reason: 'Current category based on source type',
        confidence: 1.0,
        isExisting: true,
      }];
    }
  }

  // ─── List categories ───────────────────────────────────────────────────

  /**
   * List all visualization categories with their item counts.
   */
  listCategories(): Array<{
    category: VisualizationCategory;
    displayName: string;
    count: number;
    color: string;
  }> {
    const allDocs = this.documentStore.listDocuments();
    const categoryCounts: Record<string, number> = {};

    for (const doc of allDocs) {
      // Check for category override in metadata first
      const overrideCategory = doc.metadata?.visualizationCategory as VisualizationCategory | undefined;
      const cat = overrideCategory ?? sourceToCategory(doc.source, doc.metadata);
      categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
    }

    return getAllCategories().map(cat => ({
      category: cat,
      displayName: CATEGORY_META[cat].displayName,
      count: categoryCounts[cat] ?? 0,
      color: CATEGORY_META[cat].color,
    }));
  }

  // ─── Audit trail logging ──────────────────────────────────────────────

  /**
   * Log a curation action to the pending_actions table.
   * Uses the same schema as the orchestrator for consistency.
   */
  private logCurationAction(
    action: string,
    chunkId: string,
    payload: Record<string, unknown>,
  ): void {
    const id = nanoid();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO pending_actions (id, action, payload, reasoning, domain, tier, status, created_at, executed_at)
      VALUES (?, ?, ?, ?, ?, ?, 'executed', ?, ?)
    `).run(
      id,
      action,
      JSON.stringify({ chunkId, ...payload }),
      `User-initiated curation: ${action}`,
      'knowledge',
      'partner', // Curation actions are always user-initiated, logged at partner tier
      now,
      now,
    );
  }
}
