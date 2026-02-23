/**
 * Step 19 — LLM Categorizer tests.
 * Tests batch categorization, JSON parsing, and keyword fallback.
 */

import { describe, it, expect } from 'vitest';
import { LLMCategorizer } from '@semblance/core/finance/llm-categorizer';
import type { LLMProvider } from '@semblance/core/llm/types';

function makeMockLLM(responseContent: string, available = true): LLMProvider {
  return {
    isAvailable: async () => available,
    generate: async () => { throw new Error('not used'); },
    chat: async () => ({
      message: { role: 'assistant' as const, content: responseContent },
      model: 'test-model',
      tokensUsed: { prompt: 100, completion: 50, total: 150 },
      durationMs: 10,
    }),
    embed: async () => ({ embeddings: [[]], model: 'test', durationMs: 0 }),
    listModels: async () => [],
    getModel: async () => null,
  };
}

describe('LLMCategorizer (Step 19)', () => {
  it('categorizes a batch and returns correct results from LLM response', async () => {
    const llm = makeMockLLM(JSON.stringify([
      { category: 'Entertainment', subcategory: 'Streaming', confidence: 0.95 },
      { category: 'Food & Dining', subcategory: 'Coffee', confidence: 0.9 },
    ]));
    const categorizer = new LLMCategorizer({ llm });

    const results = await categorizer.categorizeBatch([
      { id: 'txn-1', merchantNormalized: 'Netflix', merchantRaw: 'NETFLIX INC', amount: -1499 },
      { id: 'txn-2', merchantNormalized: 'Starbucks', merchantRaw: 'STARBUCKS', amount: -550 },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]!.category).toBe('Entertainment');
    expect(results[0]!.method).toBe('llm');
    expect(results[1]!.category).toBe('Food & Dining');
  });

  it('parses JSON from code blocks (triple-layer parsing)', async () => {
    const wrapped = '```json\n[{"category": "Shopping", "subcategory": "Online", "confidence": 0.8}]\n```';
    const llm = makeMockLLM(wrapped);
    const categorizer = new LLMCategorizer({ llm });

    const results = await categorizer.categorizeBatch([
      { id: 'txn-1', merchantNormalized: 'Amazon', merchantRaw: 'AMAZON', amount: -5000 },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]!.category).toBe('Shopping');
  });

  it('falls back to keyword categorization when LLM returns invalid JSON', async () => {
    const llm = makeMockLLM('This is not JSON at all, sorry!');
    const categorizer = new LLMCategorizer({ llm });

    const results = await categorizer.categorizeBatch([
      { id: 'txn-1', merchantNormalized: 'Netflix', merchantRaw: 'NETFLIX', amount: -1499 },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]!.method).toBe('keyword');
    expect(results[0]!.category).toBe('Entertainment'); // keyword match on 'netflix'
  });

  it('keyword fallback correctly matches taxonomy keywords', () => {
    const llm = makeMockLLM(''); // won't be used
    const categorizer = new LLMCategorizer({ llm });

    const result = categorizer.fallbackCategorize('Starbucks Coffee', -550, 'txn-1');
    expect(result.category).toBe('Food & Dining');
    expect(result.method).toBe('keyword');

    const income = categorizer.fallbackCategorize('Payroll Deposit', 500000, 'txn-2');
    expect(income.category).toBe('Income');

    const unknown = categorizer.fallbackCategorize('XYZUNKNOWN MERCHANT', -1000, 'txn-3');
    expect(unknown.category).toBe('Other');
    expect(unknown.method).toBe('fallback');
  });
});
