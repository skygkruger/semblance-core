// Document Context Manager — Scoped document context for chat-about-document.
//
// When a user drops a file into the chat, this module indexes it and provides
// document-scoped context for subsequent queries. One document at a time.

import type { KnowledgeGraph, SearchResult } from '../knowledge/index.js';
import { readFileContent } from '../knowledge/file-scanner.js';

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
  private activeDocument: DocumentContextInfo | null = null;

  constructor(knowledgeGraph: KnowledgeGraph) {
    this.knowledgeGraph = knowledgeGraph;
  }

  /**
   * Set the active document context.
   * Reads the file, indexes it, and stores the context info.
   * If another document was active, it is replaced (but stays in KG).
   */
  async setDocument(filePath: string): Promise<DocumentContextInfo> {
    // Read and parse file content
    const content = await readFileContent(filePath);

    // Index into knowledge graph
    const result = await this.knowledgeGraph.indexDocument({
      content: content.content,
      title: content.title,
      source: 'local_file',
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

    this.activeDocument = info;
    return info;
  }

  /**
   * Check if a document is currently active.
   */
  hasActiveDocument(): boolean {
    return this.activeDocument !== null;
  }

  /**
   * Get info about the active document (null if none).
   */
  getActiveDocument(): DocumentContextInfo | null {
    return this.activeDocument;
  }

  /**
   * Get document-scoped context for a user query.
   * Searches the knowledge graph and filters results to the active document.
   * Returns empty if no active document.
   */
  async getContextForPrompt(userQuery: string, limit: number = 5): Promise<SearchResult[]> {
    if (!this.activeDocument) return [];

    // Fetch extra results then filter to active document
    const results = await this.knowledgeGraph.search(userQuery, {
      limit: limit * 3,
    });

    const docId = this.activeDocument.documentId;
    const filtered = results.filter(r => r.document.id === docId);

    return filtered.slice(0, limit);
  }

  /**
   * Clear the active document context.
   * The document stays in the knowledge graph — only the active context is cleared.
   */
  clearDocument(): void {
    this.activeDocument = null;
  }
}
