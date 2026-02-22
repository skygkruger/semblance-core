// Tests for EmailIndexer — email ingestion, deduplication, search, and schema integrity.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { EmailIndexer } from '@semblance/core/knowledge/email-indexer.js';
import type { KnowledgeGraph, SearchResult } from '@semblance/core/knowledge/index.js';
import type { LLMProvider } from '@semblance/core/llm/types.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';

function createMockKnowledge(): KnowledgeGraph {
  return {
    indexDocument: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([] as SearchResult[]),
    scanDirectory: vi.fn(),
    getDocument: vi.fn(),
    listDocuments: vi.fn(),
    getStats: vi.fn(),
    deleteDocument: vi.fn(),
  };
}

function createMockLLM(): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn(),
    chat: vi.fn(),
    embed: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn(),
  };
}

function makeRawEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'raw-1',
    messageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    threadId: 'thread-1',
    from: { name: 'Alice', address: 'alice@example.com' },
    to: [{ name: 'Bob', address: 'bob@example.com' }],
    cc: [],
    subject: 'Test Subject',
    date: new Date().toISOString(),
    body: { text: 'Hello, this is the body of the email. It has some content for testing purposes.', html: undefined },
    flags: [],
    attachments: [],
    ...overrides,
  };
}

describe('EmailIndexer', () => {
  let db: Database.Database;
  let indexer: EmailIndexer;
  let knowledge: KnowledgeGraph;
  let llm: LLMProvider;

  beforeEach(() => {
    db = new Database(':memory:');
    knowledge = createMockKnowledge();
    llm = createMockLLM();
    indexer = new EmailIndexer({ db: db as unknown as DatabaseHandle, knowledge, llm });
  });

  describe('schema', () => {
    it('creates the indexed_emails table', () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='indexed_emails'").all();
      expect(tables).toHaveLength(1);
    });

    it('creates indexes on key columns', () => {
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_email_%'").all() as { name: string }[];
      const indexNames = indexes.map(i => i.name);
      expect(indexNames).toContain('idx_email_message_id');
      expect(indexNames).toContain('idx_email_received_at');
      expect(indexNames).toContain('idx_email_from');
      expect(indexNames).toContain('idx_email_account');
      expect(indexNames).toContain('idx_email_priority');
    });
  });

  describe('indexMessages', () => {
    it('indexes a single message correctly', async () => {
      const msg = makeRawEmail({ messageId: 'unique-msg-1' });
      const count = await indexer.indexMessages([msg], 'account-1');
      expect(count).toBe(1);
      expect(indexer.getIndexedCount()).toBe(1);
    });

    it('skips duplicate messages based on messageId', async () => {
      const msg = makeRawEmail({ messageId: 'dup-1' });
      await indexer.indexMessages([msg], 'account-1');
      const count = await indexer.indexMessages([msg], 'account-1');
      expect(count).toBe(0);
      expect(indexer.getIndexedCount()).toBe(1);
    });

    it('indexes multiple messages in a batch', async () => {
      const msgs = [
        makeRawEmail({ messageId: 'batch-1' }),
        makeRawEmail({ messageId: 'batch-2' }),
        makeRawEmail({ messageId: 'batch-3' }),
      ];
      const count = await indexer.indexMessages(msgs, 'account-1');
      expect(count).toBe(3);
      expect(indexer.getIndexedCount()).toBe(3);
    });

    it('extracts snippet from body text (max 200 chars)', async () => {
      const longBody = 'A'.repeat(500);
      const msg = makeRawEmail({ messageId: 'snippet-1', body: { text: longBody } });
      await indexer.indexMessages([msg], 'account-1');
      const email = indexer.getByMessageId('snippet-1');
      expect(email).not.toBeNull();
      expect(email!.snippet.length).toBeLessThanOrEqual(200);
    });

    it('parses read flag correctly', async () => {
      const msg = makeRawEmail({ messageId: 'read-1', flags: ['\\Seen'] });
      await indexer.indexMessages([msg], 'account-1');
      const email = indexer.getByMessageId('read-1');
      expect(email!.isRead).toBe(true);
    });

    it('parses starred flag correctly', async () => {
      const msg = makeRawEmail({ messageId: 'star-1', flags: ['\\Flagged'] });
      await indexer.indexMessages([msg], 'account-1');
      const email = indexer.getByMessageId('star-1');
      expect(email!.isStarred).toBe(true);
    });

    it('detects attachments', async () => {
      const msg = makeRawEmail({
        messageId: 'attach-1',
        attachments: [{ filename: 'doc.pdf', contentType: 'application/pdf', size: 1024 }],
      });
      await indexer.indexMessages([msg], 'account-1');
      const email = indexer.getByMessageId('attach-1');
      expect(email!.hasAttachments).toBe(true);
    });

    it('indexes into knowledge graph for semantic search', async () => {
      const msg = makeRawEmail({ messageId: 'kg-1' });
      await indexer.indexMessages([msg], 'account-1');
      expect(knowledge.indexDocument).toHaveBeenCalled();
    });

    it('emits progress events', async () => {
      const handler = vi.fn();
      indexer.onEvent(handler);
      const msgs = [makeRawEmail({ messageId: 'prog-1' }), makeRawEmail({ messageId: 'prog-2' })];
      await indexer.indexMessages(msgs, 'account-1');
      expect(handler).toHaveBeenCalled();
    });

    it('handles errors in individual messages gracefully', async () => {
      const msgs = [
        makeRawEmail({ messageId: 'ok-1' }),
        makeRawEmail({ messageId: 'bad-1', from: null as unknown }), // malformed
        makeRawEmail({ messageId: 'ok-2' }),
      ];
      // Should not throw — graceful degradation per message
      const count = await indexer.indexMessages(msgs, 'account-1');
      // At least 1 message should succeed
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getIndexedEmails', () => {
    beforeEach(async () => {
      const msgs = [
        makeRawEmail({ messageId: 'list-1', subject: 'First' }),
        makeRawEmail({ messageId: 'list-2', subject: 'Second' }),
        makeRawEmail({ messageId: 'list-3', subject: 'Third' }),
      ];
      await indexer.indexMessages(msgs, 'account-1');
    });

    it('returns all indexed emails with default limit', () => {
      const emails = indexer.getIndexedEmails();
      expect(emails.length).toBe(3);
    });

    it('respects limit parameter', () => {
      const emails = indexer.getIndexedEmails({ limit: 2 });
      expect(emails.length).toBe(2);
    });

    it('respects offset parameter', () => {
      const all = indexer.getIndexedEmails();
      const page2 = indexer.getIndexedEmails({ limit: 2, offset: 2 });
      expect(page2.length).toBe(1);
    });

    it('filters by account', async () => {
      await indexer.indexMessages([makeRawEmail({ messageId: 'other-acct' })], 'account-2');
      const account1 = indexer.getIndexedEmails({ accountId: 'account-1' });
      expect(account1.length).toBe(3);
    });
  });

  describe('getLatestIndexedDate', () => {
    it('returns null when no messages indexed', () => {
      expect(indexer.getLatestIndexedDate()).toBeNull();
    });

    it('returns most recent receivedAt after indexing', async () => {
      const past = new Date('2025-01-01').toISOString();
      const recent = new Date('2025-06-15').toISOString();
      await indexer.indexMessages([
        makeRawEmail({ messageId: 'date-1', date: past }),
        makeRawEmail({ messageId: 'date-2', date: recent }),
      ], 'account-1');

      const latest = indexer.getLatestIndexedDate();
      expect(latest).toBe(recent);
    });
  });

  describe('updateCategorization', () => {
    it('updates labels and priority on an indexed email', async () => {
      await indexer.indexMessages([makeRawEmail({ messageId: 'cat-1' })], 'account-1');
      indexer.updateCategorization('cat-1', ['actionable', 'personal'], 'high');
      const email = indexer.getByMessageId('cat-1');
      expect(email!.priority).toBe('high');
      const labels = JSON.parse(email!.labels);
      expect(labels).toContain('actionable');
      expect(labels).toContain('personal');
    });
  });

  describe('searchEmails', () => {
    it('finds emails by subject keyword', async () => {
      await indexer.indexMessages([
        makeRawEmail({ messageId: 'search-1', subject: 'Meeting tomorrow' }),
        makeRawEmail({ messageId: 'search-2', subject: 'Lunch plans' }),
      ], 'account-1');
      const results = indexer.searchEmails('meeting');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]!.subject).toContain('Meeting');
    });
  });

  describe('removeIndexedEmail', () => {
    it('removes an email from the index', async () => {
      await indexer.indexMessages([makeRawEmail({ messageId: 'remove-1' })], 'account-1');
      expect(indexer.getByMessageId('remove-1')).not.toBeNull();
      indexer.removeIndexedEmail('remove-1');
      expect(indexer.getByMessageId('remove-1')).toBeNull();
    });
  });
});
