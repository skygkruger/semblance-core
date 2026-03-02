// Document Context Manager — Scoped document context for chat-about-document.
//
// Supports up to MAX_ATTACHMENTS files simultaneously. Each file is indexed
// into the knowledge graph and searched together for context retrieval.
// Document context is conversation-scoped — clearing removes the active
// reference but leaves the data in the KG.

import type { KnowledgeGraph, SearchResult } from '../knowledge/index.js';
import { readFileContent } from '../knowledge/file-scanner.js';
import { MAX_ATTACHMENTS } from './attachments.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DocumentContextInfo {
  documentId: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  chunksCreated: number;
}

// ─── Manager ────────────────────────────────────────────────────────────────

export class DocumentContextManager {
  private knowledgeGraph: KnowledgeGraph;
  private activeDocuments: Map<string, DocumentContextInfo> = new Map();

  constructor(knowledgeGraph: KnowledgeGraph) {
    this.knowledgeGraph = knowledgeGraph;
  }

  /**
   * Add a document to the active context.
   * Reads the file, indexes it, and stores the context info.
   * Returns the document info. Throws if at capacity.
   */
  async addDocument(filePath: string): Promise<DocumentContextInfo> {
    if (this.activeDocuments.size >= MAX_ATTACHMENTS) {
      throw new Error(`Maximum ${MAX_ATTACHMENTS} documents allowed`);
    }

    // Check for duplicate path
    for (const doc of this.activeDocuments.values()) {
      if (doc.filePath === filePath) return doc;
    }

    const content = await readFileContent(filePath);

    const result = await this.knowledgeGraph.indexDocument({
      content: content.content,
      title: content.title,
      source: 'chat_attachment',
      sourcePath: filePath,
      mimeType: content.mimeType,
    });

    const info: DocumentContextInfo = {
      documentId: result.documentId,
      filePath,
      fileName: content.title,
      mimeType: content.mimeType,
      chunksCreated: result.chunksCreated,
    };

    this.activeDocuments.set(result.documentId, info);
    return info;
  }

  /**
   * Remove a document from the active context by document ID.
   * The document stays in the knowledge graph — only the active reference is removed.
   */
  removeDocument(documentId: string): boolean {
    return this.activeDocuments.delete(documentId);
  }

  /**
   * Set a single document context (backward-compat with single-file flow).
   * Clears all existing documents and sets the new one.
   */
  async setDocument(filePath: string): Promise<DocumentContextInfo> {
    this.activeDocuments.clear();
    return this.addDocument(filePath);
  }

  /**
   * Check if any documents are currently active.
   */
  hasActiveDocument(): boolean {
    return this.activeDocuments.size > 0;
  }

  /**
   * Get info about the first active document (backward-compat).
   * Returns null if none.
   */
  getActiveDocument(): DocumentContextInfo | null {
    if (this.activeDocuments.size === 0) return null;
    return this.activeDocuments.values().next().value ?? null;
  }

  /**
   * Get all active document infos.
   */
  getActiveDocuments(): DocumentContextInfo[] {
    return [...this.activeDocuments.values()];
  }

  /**
   * Get the count of active documents.
   */
  getDocumentCount(): number {
    return this.activeDocuments.size;
  }

  /**
   * Get document-scoped context for a user query.
   * Searches the knowledge graph and filters results to active documents.
   * Returns empty if no active documents.
   */
  async getContextForPrompt(userQuery: string, limit: number = 5): Promise<SearchResult[]> {
    if (this.activeDocuments.size === 0) return [];

    const docIds = new Set(this.activeDocuments.keys());

    // Fetch extra results then filter to active documents
    const results = await this.knowledgeGraph.search(userQuery, {
      limit: limit * 3 * Math.max(1, this.activeDocuments.size),
    });

    const filtered = results.filter(r => docIds.has(r.document.id));
    return filtered.slice(0, limit);
  }

  /**
   * Promote a chat attachment to permanent knowledge by re-indexing
   * with source 'local_file'. Returns true if the document was found
   * and promoted, false if not in active context.
   */
  async addToKnowledge(documentId: string): Promise<boolean> {
    const doc = this.activeDocuments.get(documentId);
    if (!doc) return false;

    const content = await readFileContent(doc.filePath);
    await this.knowledgeGraph.indexDocument({
      content: content.content,
      title: content.title,
      source: 'local_file',
      sourcePath: doc.filePath,
      mimeType: content.mimeType,
      metadata: { promotedFromChat: true },
    });

    return true;
  }

  /**
   * Clear all active document contexts.
   * Documents stay in the knowledge graph — only the active references are cleared.
   */
  clearDocument(): void {
    this.activeDocuments.clear();
  }
}
