// Conversation Manager — Multi-conversation CRUD with SQLite backend.
// Manages conversation lifecycle: create, list, switch, rename, pin, delete, expiry.
// All data local-only per Sanctuary Protocol.

import { nanoid } from 'nanoid';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConversationSummary {
  id: string;
  title: string | null;
  autoTitle: string | null;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  pinnedAt: string | null;
  turnCount: number;
  lastMessagePreview: string | null;
  expiresAt: string | null;
}

export interface ConversationTurnRow {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ListConversationsOptions {
  limit?: number;
  offset?: number;
  pinnedOnly?: boolean;
  search?: string;
}

export interface ConversationWithTurns extends ConversationSummary {
  turns: ConversationTurnRow[];
}

// ─── Database interface (subset of better-sqlite3) ───────────────────────────

interface DatabaseHandle {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  exec(sql: string): void;
}

// ─── ConversationManager ─────────────────────────────────────────────────────

export class ConversationManager {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
  }

  /** Idempotent schema migration — safe to call multiple times. */
  migrate(): void {
    // Add columns with ALTER TABLE, ignoring "duplicate column" errors
    const alterStatements = [
      "ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE conversations ADD COLUMN pinned_at TEXT",
      "ALTER TABLE conversations ADD COLUMN auto_title TEXT",
      "ALTER TABLE conversations ADD COLUMN turn_count INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE conversations ADD COLUMN last_message_preview TEXT",
      "ALTER TABLE conversations ADD COLUMN expires_at TEXT",
    ];

    for (const sql of alterStatements) {
      try {
        this.db.exec(sql);
      } catch (err: unknown) {
        // Ignore "duplicate column name" errors — means migration already ran
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('duplicate column name')) {
          throw err;
        }
      }
    }

    // Create conversation_embeddings tracking table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_embeddings (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        chunk_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conv_embed_conv ON conversation_embeddings(conversation_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conv_embed_turn ON conversation_embeddings(turn_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversations_expires ON conversations(expires_at) WHERE expires_at IS NOT NULL
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversations_pinned ON conversations(pinned) WHERE pinned = 1
    `);
  }

  /** Create a new conversation. Optionally auto-title from first user message. */
  create(firstUserMessage?: string): ConversationSummary {
    const id = nanoid();
    const now = new Date().toISOString();
    const autoTitle = firstUserMessage
      ? firstUserMessage.split(/\s+/).slice(0, 6).join(' ').substring(0, 50)
      : null;

    this.db.prepare(
      `INSERT INTO conversations (id, created_at, updated_at, title, pinned, pinned_at, auto_title, turn_count, last_message_preview, expires_at)
       VALUES (?, ?, ?, NULL, 0, NULL, ?, 0, NULL, NULL)`
    ).run(id, now, now, autoTitle);

    return {
      id,
      title: null,
      autoTitle,
      createdAt: now,
      updatedAt: now,
      pinned: false,
      pinnedAt: null,
      turnCount: 0,
      lastMessagePreview: null,
      expiresAt: null,
    };
  }

  /** List conversations — pinned first (by pinned_at DESC), then by updated_at DESC. */
  list(opts?: ListConversationsOptions): ConversationSummary[] {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    let sql: string;
    const params: unknown[] = [];

    if (opts?.pinnedOnly) {
      sql = `SELECT id, title, auto_title, created_at, updated_at, pinned, pinned_at, turn_count, last_message_preview, expires_at
             FROM conversations WHERE pinned = 1
             ORDER BY pinned_at DESC
             LIMIT ? OFFSET ?`;
      params.push(limit, offset);
    } else if (opts?.search) {
      sql = `SELECT id, title, auto_title, created_at, updated_at, pinned, pinned_at, turn_count, last_message_preview, expires_at
             FROM conversations
             WHERE title LIKE ? OR auto_title LIKE ? OR last_message_preview LIKE ?
             ORDER BY pinned DESC, CASE WHEN pinned = 1 THEN pinned_at END DESC, updated_at DESC
             LIMIT ? OFFSET ?`;
      const pattern = `%${opts.search}%`;
      params.push(pattern, pattern, pattern, limit, offset);
    } else {
      sql = `SELECT id, title, auto_title, created_at, updated_at, pinned, pinned_at, turn_count, last_message_preview, expires_at
             FROM conversations
             ORDER BY pinned DESC, CASE WHEN pinned = 1 THEN pinned_at END DESC, updated_at DESC
             LIMIT ? OFFSET ?`;
      params.push(limit, offset);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map(this.rowToSummary);
  }

  /** Get a full conversation with its turns. */
  get(id: string): ConversationWithTurns | null {
    const row = this.db.prepare(
      `SELECT id, title, auto_title, created_at, updated_at, pinned, pinned_at, turn_count, last_message_preview, expires_at
       FROM conversations WHERE id = ?`
    ).get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    const turns = this.getTurns(id);
    return { ...this.rowToSummary(row), turns };
  }

  /** Get paginated turns for a conversation. */
  getTurns(id: string, limit = 100, offset = 0): ConversationTurnRow[] {
    const rows = this.db.prepare(
      `SELECT id, conversation_id, role, content, timestamp
       FROM conversation_turns
       WHERE conversation_id = ?
       ORDER BY timestamp ASC
       LIMIT ? OFFSET ?`
    ).all(id, limit, offset) as Array<Record<string, unknown>>;

    return rows.map(r => ({
      id: r.id as string,
      conversationId: r.conversation_id as string,
      role: r.role as 'user' | 'assistant',
      content: r.content as string,
      timestamp: r.timestamp as string,
    }));
  }

  /** Rename a conversation (user-set title). */
  rename(id: string, title: string): void {
    this.db.prepare(
      "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?"
    ).run(title, new Date().toISOString(), id);
  }

  /** Delete a conversation and cascade to turns + embeddings. */
  delete(id: string): void {
    this.db.prepare('DELETE FROM conversation_embeddings WHERE conversation_id = ?').run(id);
    this.db.prepare('DELETE FROM conversation_turns WHERE conversation_id = ?').run(id);
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  /** Pin a conversation. */
  pin(id: string): void {
    const now = new Date().toISOString();
    this.db.prepare(
      'UPDATE conversations SET pinned = 1, pinned_at = ?, updated_at = ? WHERE id = ?'
    ).run(now, now, id);
  }

  /** Unpin a conversation. */
  unpin(id: string): void {
    this.db.prepare(
      'UPDATE conversations SET pinned = 0, pinned_at = NULL, updated_at = ? WHERE id = ?'
    ).run(new Date().toISOString(), id);
  }

  /** Search conversations by title/autoTitle/preview using LIKE. */
  searchByTitle(query: string, limit = 20): ConversationSummary[] {
    const pattern = `%${query}%`;
    const rows = this.db.prepare(
      `SELECT id, title, auto_title, created_at, updated_at, pinned, pinned_at, turn_count, last_message_preview, expires_at
       FROM conversations
       WHERE title LIKE ? OR auto_title LIKE ? OR last_message_preview LIKE ?
       ORDER BY updated_at DESC
       LIMIT ?`
    ).all(pattern, pattern, pattern, limit) as Array<Record<string, unknown>>;

    return rows.map(this.rowToSummary);
  }

  /** Delete expired conversations (where expires_at < now AND not pinned). Returns count deleted. */
  pruneExpired(): number {
    const now = new Date().toISOString();

    // Get IDs of expired conversations
    const expired = this.db.prepare(
      `SELECT id FROM conversations WHERE expires_at IS NOT NULL AND expires_at < ? AND pinned = 0`
    ).all(now) as Array<{ id: string }>;

    for (const row of expired) {
      this.delete(row.id);
    }

    return expired.length;
  }

  /** Set expiry on a conversation. */
  setExpiry(id: string, expiresAt: string | null): void {
    this.db.prepare(
      'UPDATE conversations SET expires_at = ?, updated_at = ? WHERE id = ?'
    ).run(expiresAt, new Date().toISOString(), id);
  }

  /** Update conversation metadata after a turn is added. */
  updateAfterTurn(id: string, content: string, role: 'user' | 'assistant'): void {
    const now = new Date().toISOString();
    const preview = content.substring(0, 120);

    // Auto-title on first user turn
    if (role === 'user') {
      const conv = this.db.prepare(
        'SELECT turn_count, auto_title FROM conversations WHERE id = ?'
      ).get(id) as { turn_count: number; auto_title: string | null } | undefined;

      if (conv && !conv.auto_title) {
        const autoTitle = content.split(/\s+/).slice(0, 6).join(' ').substring(0, 50);
        this.db.prepare(
          'UPDATE conversations SET auto_title = ?, turn_count = turn_count + 1, last_message_preview = ?, updated_at = ? WHERE id = ?'
        ).run(autoTitle, preview, now, id);
        return;
      }
    }

    this.db.prepare(
      'UPDATE conversations SET turn_count = turn_count + 1, last_message_preview = ?, updated_at = ? WHERE id = ?'
    ).run(preview, now, id);
  }

  /** Bulk delete all conversations. Optionally preserve pinned. Returns count deleted. */
  clearAll(opts?: { preservePinned?: boolean }): number {
    let ids: Array<{ id: string }>;
    if (opts?.preservePinned) {
      ids = this.db.prepare(
        'SELECT id FROM conversations WHERE pinned = 0'
      ).all() as Array<{ id: string }>;
    } else {
      ids = this.db.prepare(
        'SELECT id FROM conversations'
      ).all() as Array<{ id: string }>;
    }

    for (const row of ids) {
      this.delete(row.id);
    }

    return ids.length;
  }

  /** Get conversation counts. */
  getCount(): { total: number; pinned: number } {
    const total = this.db.prepare(
      'SELECT COUNT(*) as count FROM conversations'
    ).get() as { count: number };

    const pinned = this.db.prepare(
      'SELECT COUNT(*) as count FROM conversations WHERE pinned = 1'
    ).get() as { count: number };

    return { total: total.count, pinned: pinned.count };
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private rowToSummary(row: Record<string, unknown>): ConversationSummary {
    return {
      id: row.id as string,
      title: (row.title as string) ?? null,
      autoTitle: (row.auto_title as string) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      pinned: (row.pinned as number) === 1,
      pinnedAt: (row.pinned_at as string) ?? null,
      turnCount: (row.turn_count as number) ?? 0,
      lastMessagePreview: (row.last_message_preview as string) ?? null,
      expiresAt: (row.expires_at as string) ?? null,
    };
  }
}
