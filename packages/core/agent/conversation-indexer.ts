// Conversation Indexer — Indexes conversation turns into LanceDB for semantic recall.
// Uses the existing KnowledgeGraph.indexDocument() pipeline with source='conversation'.
// All processing local-only per Sanctuary Protocol.

import { nanoid } from 'nanoid';
import type { KnowledgeGraph } from '../knowledge/index.js';
import type { SearchResult } from '../knowledge/types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConversationSearchResult {
  conversationId: string;
  conversationTitle: string;
  turnId: string;
  role: 'user' | 'assistant';
  excerpt: string;
  score: number;
  timestamp: string;
}

export interface IndexTurnParams {
  conversationId: string;
  turnId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// ─── Database interface (subset of better-sqlite3) ───────────────────────────

interface DatabaseHandle {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
}

// ─── ConversationIndexer ─────────────────────────────────────────────────────

export class ConversationIndexer {
  private db: DatabaseHandle;
  private knowledge: KnowledgeGraph;

  constructor(config: { db: DatabaseHandle; knowledge: KnowledgeGraph }) {
    this.db = config.db;
    this.knowledge = config.knowledge;
  }

  /**
   * Index a conversation turn into the knowledge graph.
   * Only index after assistant response completes (not during streaming).
   * One chunk per turn, max 2000 chars (matching existing chunker limit).
   */
  async indexTurn(params: IndexTurnParams): Promise<void> {
    const { conversationId, turnId, role, content, timestamp } = params;

    // Skip empty content
    if (!content || content.trim().length === 0) return;

    // Truncate to max 2000 chars (matching existing chunker limit)
    const indexContent = content.substring(0, 2000);

    const sourcePath = `conversation://${conversationId}/${turnId}`;

    // Get conversation title for search result enrichment
    const conv = this.db.prepare(
      'SELECT title, auto_title FROM conversations WHERE id = ?'
    ).get(conversationId) as { title: string | null; auto_title: string | null } | undefined;

    const title = conv?.title ?? conv?.auto_title ?? 'Conversation';

    const result = await this.knowledge.indexDocument({
      content: indexContent,
      title: `${title} (${role})`,
      source: 'conversation',
      sourcePath,
      mimeType: 'text/plain',
      metadata: {
        conversationId,
        turnId,
        role,
        timestamp,
      },
    });

    // Record the chunk mapping in conversation_embeddings
    // The indexer creates chunks — we record the document ID as chunk reference
    const embeddingId = nanoid();
    this.db.prepare(
      `INSERT INTO conversation_embeddings (id, conversation_id, turn_id, chunk_id, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(embeddingId, conversationId, turnId, result.documentId, new Date().toISOString());
  }

  /**
   * Semantic search across all conversation turns.
   * Uses LanceDB vector search filtered to source='conversation'.
   * Groups results by conversationId and returns enriched results.
   */
  async searchConversations(query: string, limit = 10): Promise<ConversationSearchResult[]> {
    const results = await this.knowledge.search(query, {
      limit: limit * 2, // Fetch extra to allow for dedup/grouping
      source: 'conversation',
    });

    return this.enrichSearchResults(results, limit);
  }

  /**
   * Remove all indexed chunks for a conversation from the vector store.
   */
  async removeConversation(conversationId: string): Promise<void> {
    // Get all document IDs associated with this conversation
    const embeddings = this.db.prepare(
      'SELECT chunk_id FROM conversation_embeddings WHERE conversation_id = ?'
    ).all(conversationId) as Array<{ chunk_id: string }>;

    // Delete documents from knowledge graph
    for (const emb of embeddings) {
      try {
        await this.knowledge.deleteDocument(emb.chunk_id);
      } catch {
        // Document may already be deleted — ignore
      }
    }

    // Clean up tracking table
    this.db.prepare(
      'DELETE FROM conversation_embeddings WHERE conversation_id = ?'
    ).run(conversationId);
  }

  /**
   * Check if a turn has already been indexed.
   */
  isIndexed(turnId: string): boolean {
    const row = this.db.prepare(
      'SELECT id FROM conversation_embeddings WHERE turn_id = ? LIMIT 1'
    ).get(turnId);
    return !!row;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private enrichSearchResults(results: SearchResult[], limit: number): ConversationSearchResult[] {
    const enriched: ConversationSearchResult[] = [];

    for (const result of results) {
      const metadata = result.chunk.metadata ?? {};
      const conversationId = metadata.conversationId as string | undefined;
      const turnId = metadata.turnId as string | undefined;
      const role = metadata.role as 'user' | 'assistant' | undefined;
      const timestamp = metadata.timestamp as string | undefined;

      if (!conversationId || !turnId) continue;

      // Get conversation title
      const conv = this.db.prepare(
        'SELECT title, auto_title FROM conversations WHERE id = ?'
      ).get(conversationId) as { title: string | null; auto_title: string | null } | undefined;

      const conversationTitle = conv?.title ?? conv?.auto_title ?? 'Conversation';

      // Generate excerpt: 200 char snippet around the match
      const content = result.chunk.content;
      const excerpt = content.length > 200
        ? content.substring(0, 200) + '...'
        : content;

      enriched.push({
        conversationId,
        conversationTitle,
        turnId,
        role: role ?? 'assistant',
        excerpt,
        score: result.score,
        timestamp: timestamp ?? '',
      });

      if (enriched.length >= limit) break;
    }

    return enriched;
  }
}
