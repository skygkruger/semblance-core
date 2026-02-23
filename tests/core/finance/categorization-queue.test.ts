/**
 * Step 19 — Categorization Queue tests.
 * Verifies enqueue → process → categorized flow, pending count, and failure handling.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { TransactionStore, type Transaction } from '@semblance/core/finance/transaction-store';
import { LLMCategorizer } from '@semblance/core/finance/llm-categorizer';
import { CategorizationQueue } from '@semblance/core/finance/categorization-queue';
import type { LLMProvider } from '@semblance/core/llm/types';

let db: InstanceType<typeof Database>;
let store: TransactionStore;

function makeTxn(id: string): Transaction {
  const now = new Date().toISOString();
  return {
    id,
    source: 'csv',
    accountId: 'acc-1',
    date: '2026-01-15',
    merchantRaw: 'NETFLIX INC',
    merchantNormalized: 'Netflix',
    amount: -1499,
    currency: 'USD',
    category: '',
    subcategory: '',
    isRecurring: false,
    isSubscription: false,
    plaidTransactionId: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

function makeMockLLM(fail = false): LLMProvider {
  return {
    isAvailable: async () => true,
    generate: async () => { throw new Error('not used'); },
    chat: async () => {
      if (fail) throw new Error('LLM unavailable');
      return {
        message: {
          role: 'assistant' as const,
          content: JSON.stringify([
            { category: 'Entertainment', subcategory: 'Streaming', confidence: 0.9 },
          ]),
        },
        model: 'test-model',
        tokensUsed: { prompt: 100, completion: 50, total: 150 },
        durationMs: 10,
      };
    },
    embed: async () => ({ embeddings: [[]], model: 'test', durationMs: 0 }),
    listModels: async () => [],
    getModel: async () => null,
  };
}

beforeEach(() => {
  db = new Database(':memory:');
  store = new TransactionStore(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('CategorizationQueue (Step 19)', () => {
  it('enqueues, processes, and updates transaction category', async () => {
    store.addTransactions([makeTxn('txn-1')]);
    const categorizer = new LLMCategorizer({ llm: makeMockLLM() });
    const queue = new CategorizationQueue({ db: db as unknown as DatabaseHandle, categorizer, store });

    await queue.enqueue(['txn-1']);
    expect(queue.getPendingCount()).toBe(1);

    const processed = await queue.processNext();
    expect(processed).toBe(1);
    expect(queue.getPendingCount()).toBe(0);

    const txn = store.getTransaction('txn-1');
    expect(txn!.category).toBe('Entertainment');
  });

  it('decreases pending count after processing', async () => {
    store.addTransactions([makeTxn('txn-a'), makeTxn('txn-b')]);
    const categorizer = new LLMCategorizer({
      llm: {
        isAvailable: async () => true,
        generate: async () => { throw new Error('not used'); },
        chat: async () => ({
          message: {
            role: 'assistant' as const,
            content: JSON.stringify([
              { category: 'Entertainment', subcategory: 'Streaming', confidence: 0.9 },
              { category: 'Entertainment', subcategory: 'Streaming', confidence: 0.9 },
            ]),
          },
          model: 'test-model',
          tokensUsed: { prompt: 100, completion: 50, total: 150 },
          durationMs: 10,
        }),
        embed: async () => ({ embeddings: [[]], model: 'test', durationMs: 0 }),
        listModels: async () => [],
        getModel: async () => null,
      },
    });
    const queue = new CategorizationQueue({ db: db as unknown as DatabaseHandle, categorizer, store });

    await queue.enqueue(['txn-a', 'txn-b']);
    expect(queue.getPendingCount()).toBe(2);

    await queue.processNext();
    expect(queue.getPendingCount()).toBe(0);
  });

  it('marks as Other/Uncategorized after 3 failures', async () => {
    store.addTransactions([makeTxn('txn-fail')]);
    // Use a categorizer whose categorizeBatch throws (simulates a complete failure,
    // e.g., database corruption, unlike LLM errors which fall back to keywords).
    const throwingCategorizer = {
      categorizeBatch: async () => { throw new Error('Categorizer crash'); },
      categorize: async () => { throw new Error('Categorizer crash'); },
      fallbackCategorize: () => { throw new Error('Categorizer crash'); },
    } as unknown as LLMCategorizer;
    const queue = new CategorizationQueue({ db: db as unknown as DatabaseHandle, categorizer: throwingCategorizer, store });

    await queue.enqueue(['txn-fail']);

    // Fail 3 times
    await queue.processNext();
    await queue.processNext();
    await queue.processNext();

    // After 3 failures, should be marked as failed with 'Other' category
    const txn = store.getTransaction('txn-fail');
    expect(txn!.category).toBe('Other');
    expect(txn!.subcategory).toBe('Uncategorized');
    expect(queue.getPendingCount()).toBe(0);
  });
});
