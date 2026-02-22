// Tests for EmailCategorizer — AI email categorization, caching, batch, fallback.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { EmailCategorizer } from '@semblance/core/agent/email-categorizer.js';
import { EmailIndexer } from '@semblance/core/knowledge/email-indexer.js';
import type { KnowledgeGraph, SearchResult } from '@semblance/core/knowledge/index.js';
import type { LLMProvider, ChatResponse } from '@semblance/core/llm/types.js';
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

function createMockLLM(overrides?: Partial<LLMProvider>): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn(),
    chat: vi.fn().mockResolvedValue({
      message: {
        role: 'assistant',
        content: JSON.stringify({
          categories: ['actionable'],
          priority: 'high',
        }),
      },
      model: 'llama3.2:8b',
      tokensUsed: { prompt: 100, completion: 20, total: 120 },
      durationMs: 200,
    } satisfies ChatResponse),
    embed: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn(),
    ...overrides,
  };
}

function makeIndexedEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'idx-1',
    messageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    threadId: 'thread-1',
    folder: 'INBOX',
    from: 'alice@example.com',
    fromName: 'Alice',
    to: '["bob@example.com"]',
    subject: 'Quarterly report review needed',
    snippet: 'Please review the attached quarterly report and provide feedback by Friday.',
    receivedAt: new Date().toISOString(),
    isRead: false,
    isStarred: false,
    hasAttachments: true,
    labels: '[]',
    priority: 'normal' as const,
    accountId: 'account-1',
    indexedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('EmailCategorizer', () => {
  let db: Database.Database;
  let categorizer: EmailCategorizer;
  let emailIndexer: EmailIndexer;
  let llm: LLMProvider;

  beforeEach(() => {
    db = new Database(':memory:');
    const knowledge = createMockKnowledge();
    llm = createMockLLM();
    emailIndexer = new EmailIndexer({ db: db as unknown as DatabaseHandle, knowledge, llm });
    categorizer = new EmailCategorizer({ llm, emailIndexer, model: 'llama3.2:8b' });
  });

  describe('categorizeEmail', () => {
    it('categorizes a single email using the LLM', async () => {
      const email = makeIndexedEmail({ messageId: 'cat-single' });
      const result = await categorizer.categorizeEmail(email);
      expect(result.messageId).toBe('cat-single');
      expect(result.categories).toContain('actionable');
      expect(result.priority).toBe('high');
    });

    it('returns cached result on repeated calls', async () => {
      const email = makeIndexedEmail({ messageId: 'cache-1' });
      await categorizer.categorizeEmail(email);
      const chatFn = llm.chat as ReturnType<typeof vi.fn>;
      const callsBefore = chatFn.mock.calls.length;

      await categorizer.categorizeEmail(email);
      expect(chatFn.mock.calls.length).toBe(callsBefore); // No new LLM call
    });

    it('clearCache forces re-categorization', async () => {
      const email = makeIndexedEmail({ messageId: 'clear-1' });
      await categorizer.categorizeEmail(email);
      categorizer.clearCache();
      const chatFn = llm.chat as ReturnType<typeof vi.fn>;
      const callsBefore = chatFn.mock.calls.length;

      await categorizer.categorizeEmail(email);
      expect(chatFn.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  describe('categorizeBatch', () => {
    it('categorizes multiple emails in one call', async () => {
      const batchLlm = createMockLLM({
        chat: vi.fn().mockResolvedValue({
          message: {
            role: 'assistant',
            content: JSON.stringify([
              { messageId: 'b1', categories: ['newsletter'], priority: 'low' },
              { messageId: 'b2', categories: ['actionable'], priority: 'high' },
              { messageId: 'b3', categories: ['routine'], priority: 'normal' },
            ]),
          },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 200, completion: 50, total: 250 },
          durationMs: 400,
        } satisfies ChatResponse),
      });
      const batchCategorizer = new EmailCategorizer({ llm: batchLlm, emailIndexer, model: 'llama3.2:8b' });

      const emails = [
        makeIndexedEmail({ messageId: 'b1', subject: 'Newsletter: Weekly digest' }),
        makeIndexedEmail({ messageId: 'b2', subject: 'Action required: deploy approval' }),
        makeIndexedEmail({ messageId: 'b3', subject: 'Meeting confirmation' }),
      ];
      const results = await batchCategorizer.categorizeBatch(emails);
      expect(results).toHaveLength(3);
      expect(results.find(r => r.messageId === 'b1')?.categories).toContain('newsletter');
    });

    it('skips already-categorized emails', async () => {
      const email = makeIndexedEmail({ messageId: 'skip-1' });
      await categorizer.categorizeEmail(email);

      const chatFn = llm.chat as ReturnType<typeof vi.fn>;
      const callsBefore = chatFn.mock.calls.length;
      await categorizer.categorizeBatch([email]);
      // Batch should not make additional LLM calls for already-cached emails
      expect(chatFn.mock.calls.length).toBe(callsBefore);
    });

    it('handles empty batch', async () => {
      const results = await categorizer.categorizeBatch([]);
      expect(results).toHaveLength(0);
    });
  });

  describe('graceful degradation', () => {
    it('falls back to normal priority when LLM is unavailable', async () => {
      const unavailableLlm = createMockLLM({
        isAvailable: vi.fn().mockResolvedValue(false),
        chat: vi.fn().mockRejectedValue(new Error('Ollama not running')),
      });
      const fallbackCategorizer = new EmailCategorizer({ llm: unavailableLlm, emailIndexer, model: 'llama3.2:8b' });
      const email = makeIndexedEmail({ messageId: 'fallback-1' });
      const result = await fallbackCategorizer.categorizeEmail(email);
      expect(result.priority).toBe('normal');
      expect(result.categories).toEqual([]);
    });

    it('handles malformed LLM response gracefully', async () => {
      const badLlm = createMockLLM({
        chat: vi.fn().mockResolvedValue({
          message: { role: 'assistant', content: 'not valid json at all' },
          model: 'test',
          tokensUsed: { prompt: 10, completion: 5, total: 15 },
          durationMs: 100,
        } satisfies ChatResponse),
      });
      const badCategorizer = new EmailCategorizer({ llm: badLlm, emailIndexer, model: 'test' });
      const email = makeIndexedEmail({ messageId: 'bad-response-1' });
      const result = await badCategorizer.categorizeEmail(email);
      // Should not throw — falls back gracefully
      expect(result.priority).toBe('normal');
    });
  });

  describe('indexer integration', () => {
    it('updates the email indexer with categorization results', async () => {
      // First index a real email so the indexer has it
      const raw = {
        id: 'raw-1',
        messageId: 'update-1',
        threadId: 'thread-1',
        from: { name: 'Alice', address: 'alice@test.com' },
        to: [{ name: 'Bob', address: 'bob@test.com' }],
        cc: [],
        subject: 'Test',
        date: new Date().toISOString(),
        body: { text: 'Test body' },
        flags: [],
        attachments: [],
      };
      await emailIndexer.indexMessages([raw], 'account-1');

      const email = emailIndexer.getByMessageId('update-1')!;
      await categorizer.categorizeEmail(email);

      const updated = emailIndexer.getByMessageId('update-1');
      expect(updated!.priority).toBe('high');
    });
  });
});
