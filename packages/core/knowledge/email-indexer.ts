// Email Indexer — Indexes email content into the knowledge graph for LLM reasoning.
//
// AUTONOMOUS DECISION: Email bodies are NOT stored in full. Only first 500 chars for
// embedding and 200-char snippet for display. Full body fetched on demand via Gateway.
// Reasoning: Keeps the local index lean, avoids multi-GB email dumps in knowledge graph.
// Escalation check: Build prompt explicitly specifies this approach.
//
// CRITICAL: This file is in packages/core/. No network imports. All email data arrives
// via IPC responses from the Gateway.

import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { KnowledgeGraph } from './index.js';
import type { LLMProvider } from '../llm/types.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface IndexedEmail {
  id: string;
  messageId: string;
  threadId: string;
  folder: string;
  from: string;
  fromName: string;
  to: string;           // JSON array of recipient emails
  subject: string;
  snippet: string;       // first 200 chars of body, plaintext
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  labels: string;        // JSON array of AI-assigned categories
  priority: 'high' | 'normal' | 'low';
  accountId: string;
  indexedAt: string;
}

export interface EmailIndexProgress {
  indexed: number;
  total: number;
  currentSubject?: string;
}

export type EmailIndexEventHandler = (event: string, data: unknown) => void;

// ─── Raw email shape from Gateway (via IPC email.fetch response) ───────────────

export interface RawEmailMessage {
  id: string;
  messageId: string;
  threadId?: string;
  from: { name: string; address: string };
  to: Array<{ name: string; address: string }>;
  cc: Array<{ name: string; address: string }>;
  subject: string;
  date: string;
  body: { text: string; html?: string };
  flags: string[];
  attachments: Array<{ filename: string; contentType: string; size: number }>;
}

// ─── SQLite Schema ─────────────────────────────────────────────────────────────

const CREATE_EMAIL_INDEX_TABLE = `
  CREATE TABLE IF NOT EXISTS indexed_emails (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL UNIQUE,
    thread_id TEXT NOT NULL DEFAULT '',
    folder TEXT NOT NULL DEFAULT 'INBOX',
    "from" TEXT NOT NULL,
    from_name TEXT NOT NULL DEFAULT '',
    "to" TEXT NOT NULL DEFAULT '[]',
    subject TEXT NOT NULL DEFAULT '',
    snippet TEXT NOT NULL DEFAULT '',
    received_at TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    is_starred INTEGER NOT NULL DEFAULT 0,
    has_attachments INTEGER NOT NULL DEFAULT 0,
    labels TEXT NOT NULL DEFAULT '[]',
    priority TEXT NOT NULL DEFAULT 'normal',
    account_id TEXT NOT NULL DEFAULT '',
    indexed_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_email_message_id ON indexed_emails(message_id);
  CREATE INDEX IF NOT EXISTS idx_email_received_at ON indexed_emails(received_at);
  CREATE INDEX IF NOT EXISTS idx_email_from ON indexed_emails("from");
  CREATE INDEX IF NOT EXISTS idx_email_account ON indexed_emails(account_id);
  CREATE INDEX IF NOT EXISTS idx_email_priority ON indexed_emails(priority);
  CREATE INDEX IF NOT EXISTS idx_email_thread ON indexed_emails(thread_id);
`;

// ─── Email Indexer ─────────────────────────────────────────────────────────────

export class EmailIndexer {
  private db: Database.Database;
  private knowledge: KnowledgeGraph;
  private llm: LLMProvider;
  private embeddingModel: string;
  private eventHandler: EmailIndexEventHandler | null = null;
  private syncIntervalMs: number;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: {
    db: Database.Database;
    knowledge: KnowledgeGraph;
    llm: LLMProvider;
    embeddingModel?: string;
    syncIntervalMs?: number;
  }) {
    this.db = config.db;
    this.knowledge = config.knowledge;
    this.llm = config.llm;
    this.embeddingModel = config.embeddingModel ?? 'nomic-embed-text';
    this.syncIntervalMs = config.syncIntervalMs ?? 5 * 60 * 1000; // default 5 minutes
    this.db.exec(CREATE_EMAIL_INDEX_TABLE);
  }

  /**
   * Set a handler for index events (progress, completion).
   */
  onEvent(handler: EmailIndexEventHandler): void {
    this.eventHandler = handler;
  }

  private emit(event: string, data: unknown): void {
    if (this.eventHandler) {
      this.eventHandler(event, data);
    }
  }

  /**
   * Index a batch of raw email messages from a Gateway IPC response.
   * This is the core indexing pipeline: extract → embed → store.
   */
  async indexMessages(messages: RawEmailMessage[], accountId: string): Promise<number> {
    let indexed = 0;
    const total = messages.length;

    for (const msg of messages) {
      try {
        // Skip if already indexed
        const existing = this.db.prepare(
          'SELECT id FROM indexed_emails WHERE message_id = ?'
        ).get(msg.messageId) as { id: string } | undefined;

        if (existing) continue;

        // Extract plaintext body
        const bodyText = msg.body.text || '';
        const snippet = bodyText.substring(0, 200).replace(/\s+/g, ' ').trim();
        const embeddingContent = `${msg.subject} ${bodyText.substring(0, 500)}`;

        // Derive thread ID from the raw message
        const threadId = msg.threadId ?? msg.messageId;

        // Build the IndexedEmail row
        const id = nanoid();
        const now = new Date().toISOString();
        const toEmails = msg.to.map(t => t.address);
        const flags = msg.flags ?? [];

        this.db.prepare(`
          INSERT INTO indexed_emails (
            id, message_id, thread_id, folder, "from", from_name, "to",
            subject, snippet, received_at, is_read, is_starred,
            has_attachments, labels, priority, account_id, indexed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          msg.messageId,
          threadId,
          'INBOX',
          msg.from.address,
          msg.from.name,
          JSON.stringify(toEmails),
          msg.subject,
          snippet,
          msg.date,
          flags.includes('\\Seen') ? 1 : 0,
          flags.includes('\\Flagged') ? 1 : 0,
          msg.attachments.length > 0 ? 1 : 0,
          '[]',  // Labels assigned later by categorizer
          'normal',  // Priority assigned later by categorizer
          accountId,
          now,
        );

        // Index into knowledge graph for semantic search
        await this.knowledge.indexDocument({
          content: embeddingContent,
          title: `Email: ${msg.subject}`,
          source: 'email',
          sourcePath: msg.messageId,
          mimeType: 'message/rfc822',
          metadata: {
            from: msg.from.address,
            fromName: msg.from.name,
            to: toEmails,
            date: msg.date,
            threadId,
            indexedEmailId: id,
          },
        });

        indexed++;

        this.emit('semblance://email-index-progress', {
          indexed,
          total,
          currentSubject: msg.subject,
        });
      } catch (err) {
        // Gracefully skip individual message failures
        console.error(`[EmailIndexer] Failed to index message ${msg.messageId}:`, err);
      }
    }

    return indexed;
  }

  /**
   * Get the most recent indexed email date for incremental sync.
   */
  getLatestIndexedDate(accountId?: string): string | null {
    const query = accountId
      ? 'SELECT received_at FROM indexed_emails WHERE account_id = ? ORDER BY received_at DESC LIMIT 1'
      : 'SELECT received_at FROM indexed_emails ORDER BY received_at DESC LIMIT 1';

    const row = accountId
      ? this.db.prepare(query).get(accountId) as { received_at: string } | undefined
      : this.db.prepare(query).get() as { received_at: string } | undefined;

    return row?.received_at ?? null;
  }

  /**
   * Get indexed email count.
   */
  getIndexedCount(accountId?: string): number {
    if (accountId) {
      const row = this.db.prepare(
        'SELECT COUNT(*) as count FROM indexed_emails WHERE account_id = ?'
      ).get(accountId) as { count: number };
      return row.count;
    }
    const row = this.db.prepare('SELECT COUNT(*) as count FROM indexed_emails').get() as { count: number };
    return row.count;
  }

  /**
   * Get indexed emails with filtering and pagination.
   */
  getIndexedEmails(options?: {
    accountId?: string;
    folder?: string;
    priority?: string;
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  }): IndexedEmail[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.accountId) {
      conditions.push('account_id = ?');
      params.push(options.accountId);
    }
    if (options?.folder) {
      conditions.push('folder = ?');
      params.push(options.folder);
    }
    if (options?.priority) {
      conditions.push('priority = ?');
      params.push(options.priority);
    }
    if (options?.unreadOnly) {
      conditions.push('is_read = 0');
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const rows = this.db.prepare(
      `SELECT * FROM indexed_emails ${where} ORDER BY received_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as Array<{
      id: string;
      message_id: string;
      thread_id: string;
      folder: string;
      from: string;
      from_name: string;
      to: string;
      subject: string;
      snippet: string;
      received_at: string;
      is_read: number;
      is_starred: number;
      has_attachments: number;
      labels: string;
      priority: string;
      account_id: string;
      indexed_at: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      messageId: r.message_id,
      threadId: r.thread_id,
      folder: r.folder,
      from: r.from,
      fromName: r.from_name,
      to: r.to,
      subject: r.subject,
      snippet: r.snippet,
      receivedAt: r.received_at,
      isRead: r.is_read === 1,
      isStarred: r.is_starred === 1,
      hasAttachments: r.has_attachments === 1,
      labels: r.labels,
      priority: r.priority as 'high' | 'normal' | 'low',
      accountId: r.account_id,
      indexedAt: r.indexed_at,
    }));
  }

  /**
   * Update email labels and priority (called by email categorizer).
   */
  updateCategorization(messageId: string, labels: string[], priority: 'high' | 'normal' | 'low'): void {
    this.db.prepare(
      'UPDATE indexed_emails SET labels = ?, priority = ? WHERE message_id = ?'
    ).run(JSON.stringify(labels), priority, messageId);
  }

  /**
   * Get an indexed email by message ID.
   */
  getByMessageId(messageId: string): IndexedEmail | null {
    const row = this.db.prepare(
      'SELECT * FROM indexed_emails WHERE message_id = ?'
    ).get(messageId) as {
      id: string;
      message_id: string;
      thread_id: string;
      folder: string;
      from: string;
      from_name: string;
      to: string;
      subject: string;
      snippet: string;
      received_at: string;
      is_read: number;
      is_starred: number;
      has_attachments: number;
      labels: string;
      priority: string;
      account_id: string;
      indexed_at: string;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      messageId: row.message_id,
      threadId: row.thread_id,
      folder: row.folder,
      from: row.from,
      fromName: row.from_name,
      to: row.to,
      subject: row.subject,
      snippet: row.snippet,
      receivedAt: row.received_at,
      isRead: row.is_read === 1,
      isStarred: row.is_starred === 1,
      hasAttachments: row.has_attachments === 1,
      labels: row.labels,
      priority: row.priority as 'high' | 'normal' | 'low',
      accountId: row.account_id,
      indexedAt: row.indexed_at,
    };
  }

  /**
   * Search indexed emails by keyword in subject and snippet.
   */
  searchEmails(query: string, options?: {
    from?: string;
    dateAfter?: string;
    dateBefore?: string;
    limit?: number;
  }): IndexedEmail[] {
    const conditions: string[] = ['(subject LIKE ? OR snippet LIKE ?)'];
    const params: unknown[] = [`%${query}%`, `%${query}%`];

    if (options?.from) {
      conditions.push('("from" LIKE ? OR from_name LIKE ?)');
      params.push(`%${options.from}%`, `%${options.from}%`);
    }
    if (options?.dateAfter) {
      conditions.push('received_at >= ?');
      params.push(options.dateAfter);
    }
    if (options?.dateBefore) {
      conditions.push('received_at <= ?');
      params.push(options.dateBefore);
    }

    const limit = options?.limit ?? 20;

    const rows = this.db.prepare(
      `SELECT * FROM indexed_emails WHERE ${conditions.join(' AND ')} ORDER BY received_at DESC LIMIT ?`
    ).all(...params, limit) as Array<{
      id: string;
      message_id: string;
      thread_id: string;
      folder: string;
      from: string;
      from_name: string;
      to: string;
      subject: string;
      snippet: string;
      received_at: string;
      is_read: number;
      is_starred: number;
      has_attachments: number;
      labels: string;
      priority: string;
      account_id: string;
      indexed_at: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      messageId: r.message_id,
      threadId: r.thread_id,
      folder: r.folder,
      from: r.from,
      fromName: r.from_name,
      to: r.to,
      subject: r.subject,
      snippet: r.snippet,
      receivedAt: r.received_at,
      isRead: r.is_read === 1,
      isStarred: r.is_starred === 1,
      hasAttachments: r.has_attachments === 1,
      labels: r.labels,
      priority: r.priority as 'high' | 'normal' | 'low',
      accountId: r.account_id,
      indexedAt: r.indexed_at,
    }));
  }

  /**
   * Remove an indexed email (for undo support).
   */
  removeIndexedEmail(messageId: string): void {
    this.db.prepare('DELETE FROM indexed_emails WHERE message_id = ?').run(messageId);
  }

  /**
   * Start periodic incremental sync. Returns a cleanup function.
   */
  startPeriodicSync(fetchNewMessages: (since: string | null) => Promise<RawEmailMessage[]>, accountId: string): () => void {
    this.syncTimer = setInterval(async () => {
      try {
        const since = this.getLatestIndexedDate(accountId);
        const messages = await fetchNewMessages(since);
        if (messages.length > 0) {
          await this.indexMessages(messages, accountId);
        }
      } catch (err) {
        console.error('[EmailIndexer] Incremental sync failed:', err);
      }
    }, this.syncIntervalMs);

    return () => {
      if (this.syncTimer) {
        clearInterval(this.syncTimer);
        this.syncTimer = null;
      }
    };
  }

  /**
   * Stop periodic sync.
   */
  stopSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }
}
