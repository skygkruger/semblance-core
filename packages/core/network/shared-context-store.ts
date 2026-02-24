// Shared Context Store — Stores/retrieves/deletes received peer context.
//
// CRITICAL: This store is completely separate from the user's knowledge graph.
// Zero imports from packages/core/knowledge/.
// Received peer context lives in the shared_context_cache table,
// which is created by NetworkConfigStore.
//
// Revocation = DELETE from this table. Hard delete, not soft.
//
// CRITICAL: No networking imports. Pure SQLite operations.

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';
import type { SharedContext, SharingCategory } from './types.js';

interface SharedContextRow {
  id: string;
  peer_id: string;
  category: string;
  summary_text: string;
  structured_data: string | null;
  received_at: string;
  updated_at: string;
}

function rowToSharedContext(row: SharedContextRow): SharedContext {
  return {
    id: row.id,
    peerId: row.peer_id,
    category: row.category as SharingCategory,
    summaryText: row.summary_text,
    structuredData: row.structured_data ? JSON.parse(row.structured_data) as Record<string, unknown> : null,
    receivedAt: row.received_at,
    updatedAt: row.updated_at,
  };
}

/**
 * SharedContextStore — Manages received peer context in the shared_context_cache table.
 *
 * Key properties:
 * - Completely separate from the knowledge graph (zero KG imports)
 * - Upsert semantics: one entry per (peer_id, category)
 * - Hard delete on revocation: data is gone, not soft-deleted
 */
export class SharedContextStore {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
  }

  /**
   * Store or update received peer context.
   * Uses UPSERT: one entry per (peer_id, category).
   */
  storeContext(params: {
    peerId: string;
    category: SharingCategory;
    summaryText: string;
    structuredData?: Record<string, unknown> | null;
  }): SharedContext {
    const now = new Date().toISOString();
    const id = `sc_${nanoid()}`;

    // Use INSERT OR REPLACE on the unique index (peer_id, category)
    this.db.prepare(`
      INSERT INTO shared_context_cache (id, peer_id, category, summary_text, structured_data, received_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(peer_id, category) DO UPDATE SET
        summary_text = excluded.summary_text,
        structured_data = excluded.structured_data,
        updated_at = excluded.updated_at
    `).run(
      id,
      params.peerId,
      params.category,
      params.summaryText,
      params.structuredData ? JSON.stringify(params.structuredData) : null,
      now,
      now,
    );

    return this.getContext(params.peerId, params.category)!;
  }

  /**
   * Get context for a specific peer and category.
   */
  getContext(peerId: string, category: SharingCategory): SharedContext | null {
    const row = this.db.prepare(
      'SELECT * FROM shared_context_cache WHERE peer_id = ? AND category = ?'
    ).get(peerId, category) as SharedContextRow | undefined;
    return row ? rowToSharedContext(row) : null;
  }

  /**
   * Get all context from a specific peer.
   */
  getContextFromPeer(peerId: string): SharedContext[] {
    const rows = this.db.prepare(
      'SELECT * FROM shared_context_cache WHERE peer_id = ? ORDER BY category ASC'
    ).all(peerId) as SharedContextRow[];
    return rows.map(rowToSharedContext);
  }

  /**
   * Get all stored shared context across all peers.
   */
  getAllContext(): SharedContext[] {
    const rows = this.db.prepare(
      'SELECT * FROM shared_context_cache ORDER BY peer_id, category'
    ).all() as SharedContextRow[];
    return rows.map(rowToSharedContext);
  }

  /**
   * Delete context for a specific category from a peer.
   * Used when a specific category is revoked.
   * This is a HARD DELETE — data is gone.
   */
  deleteContextCategory(peerId: string, category: SharingCategory): boolean {
    const result = this.db.prepare(
      'DELETE FROM shared_context_cache WHERE peer_id = ? AND category = ?'
    ).run(peerId, category);
    return result.changes > 0;
  }

  /**
   * Delete ALL context from a peer.
   * Used when the entire relationship is revoked.
   * This is a HARD DELETE — all data from this peer is gone.
   */
  deleteContextFromPeer(peerId: string): number {
    const result = this.db.prepare(
      'DELETE FROM shared_context_cache WHERE peer_id = ?'
    ).run(peerId);
    return result.changes;
  }
}
