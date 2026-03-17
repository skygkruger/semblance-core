// Named Session Manager — Persistent conversation contexts per purpose/channel.
//
// Each session has: unique key, conversation history, per-session autonomy overrides,
// model selection, and optional channel binding. Session keys are normalized.
// CRITICAL: No network imports. SQLite-backed, local-only.

import { nanoid } from 'nanoid';

interface DatabaseHandle {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  exec(sql: string): void;
}

export type AutonomyTier = 'guardian' | 'partner' | 'alter_ego';

export interface NamedSession {
  key: string;
  label: string;
  conversationId: string;
  autonomyOverrides: Record<string, AutonomyTier>;
  modelOverride: string | null;
  channelBinding: string | null;
  messageCount: number;
  lastActiveAt: string;
  createdAt: string;
}

interface SessionRow {
  session_key: string;
  label: string;
  conversation_id: string;
  autonomy_override_json: string | null;
  model_override: string | null;
  channel_binding: string | null;
  message_count: number;
  last_active_at: string;
  created_at: string;
}

/**
 * NamedSessionManager manages persistent conversation contexts.
 * Session keys: {context}:{channel}:{identifier} — e.g., work:email:main
 */
export class NamedSessionManager {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.initSchema();
  }

  /**
   * Create a new named session.
   */
  async createSession(params: {
    key: string;
    label: string;
    autonomyOverrides?: Record<string, AutonomyTier>;
    modelOverride?: string;
    channelBinding?: string;
  }): Promise<string> {
    const normalizedKey = this.normalizeKey(params.key);
    const conversationId = nanoid();
    const now = new Date().toISOString();

    // Create the conversation row first (FK reference)
    this.db.prepare(
      'INSERT OR IGNORE INTO conversations (id, created_at, updated_at) VALUES (?, ?, ?)'
    ).run(conversationId, now, now);

    this.db.prepare(`
      INSERT OR REPLACE INTO named_sessions
        (session_key, label, conversation_id, autonomy_override_json, model_override, channel_binding, message_count, last_active_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      normalizedKey,
      params.label,
      conversationId,
      params.autonomyOverrides ? JSON.stringify(params.autonomyOverrides) : null,
      params.modelOverride ?? null,
      params.channelBinding ?? null,
      now,
      now,
    );

    return conversationId;
  }

  /**
   * Get a session by key.
   */
  async getSession(key: string): Promise<NamedSession | null> {
    const row = this.db.prepare(
      'SELECT * FROM named_sessions WHERE session_key = ?'
    ).get(this.normalizeKey(key)) as SessionRow | undefined;
    return row ? this.rowToSession(row) : null;
  }

  /**
   * List all named sessions.
   */
  async listSessions(): Promise<NamedSession[]> {
    const rows = this.db.prepare(
      'SELECT * FROM named_sessions ORDER BY last_active_at DESC'
    ).all() as SessionRow[];
    return rows.map(r => this.rowToSession(r));
  }

  /**
   * Delete a session and its conversation history.
   */
  async deleteSession(key: string): Promise<void> {
    const normalizedKey = this.normalizeKey(key);
    const session = this.db.prepare(
      'SELECT conversation_id FROM named_sessions WHERE session_key = ?'
    ).get(normalizedKey) as { conversation_id: string } | undefined;

    if (session) {
      this.db.prepare('DELETE FROM conversation_turns WHERE conversation_id = ?').run(session.conversation_id);
      this.db.prepare('DELETE FROM conversations WHERE id = ?').run(session.conversation_id);
    }
    this.db.prepare('DELETE FROM named_sessions WHERE session_key = ?').run(normalizedKey);
  }

  /**
   * Resolve a session key to a conversation ID. Creates the session if it doesn't exist.
   */
  async resolveSession(key: string): Promise<string> {
    const existing = await this.getSession(key);
    if (existing) {
      // Update last active time
      this.db.prepare(
        'UPDATE named_sessions SET last_active_at = ? WHERE session_key = ?'
      ).run(new Date().toISOString(), this.normalizeKey(key));
      return existing.conversationId;
    }

    // Auto-create with defaults
    const label = key.split(':').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
    return this.createSession({ key, label });
  }

  /**
   * Get effective autonomy tier for an action in a session context.
   * Falls back to the provided global tier if no session override exists.
   */
  async getEffectiveTier(
    sessionKey: string,
    domain: string,
    globalTier: AutonomyTier,
  ): Promise<AutonomyTier> {
    const session = await this.getSession(sessionKey);
    if (!session) return globalTier;
    return session.autonomyOverrides[domain] ?? globalTier;
  }

  /**
   * Increment message count for a session.
   */
  incrementMessageCount(key: string): void {
    this.db.prepare(
      'UPDATE named_sessions SET message_count = message_count + 1, last_active_at = ? WHERE session_key = ?'
    ).run(new Date().toISOString(), this.normalizeKey(key));
  }

  /**
   * Get session by channel binding.
   */
  async getSessionByChannel(channelBinding: string): Promise<NamedSession | null> {
    const row = this.db.prepare(
      'SELECT * FROM named_sessions WHERE channel_binding = ?'
    ).get(channelBinding) as SessionRow | undefined;
    return row ? this.rowToSession(row) : null;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS named_sessions (
        session_key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        autonomy_override_json TEXT,
        model_override TEXT,
        channel_binding TEXT,
        message_count INTEGER NOT NULL DEFAULT 0,
        last_active_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_named_sessions_channel ON named_sessions(channel_binding) WHERE channel_binding IS NOT NULL
    `);
  }

  private normalizeKey(key: string): string {
    return key.toLowerCase().replace(/\s+/g, '-').trim();
  }

  private rowToSession(row: SessionRow): NamedSession {
    return {
      key: row.session_key,
      label: row.label,
      conversationId: row.conversation_id,
      autonomyOverrides: row.autonomy_override_json
        ? (JSON.parse(row.autonomy_override_json) as Record<string, AutonomyTier>)
        : {},
      modelOverride: row.model_override,
      channelBinding: row.channel_binding,
      messageCount: row.message_count,
      lastActiveAt: row.last_active_at,
      createdAt: row.created_at,
    };
  }
}
