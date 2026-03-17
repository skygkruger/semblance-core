// Tests for AdaptiveContextBudget — budget allocation, token estimation, truncation, history.

import { describe, it, expect, beforeEach } from 'vitest';
import { AdaptiveContextBudget } from '@semblance/core/agent/context-budget.js';

describe('AdaptiveContextBudget', () => {
  let budget: AdaptiveContextBudget;

  beforeEach(() => {
    budget = new AdaptiveContextBudget();
  });

  describe('context window lookup', () => {
    it('returns correct window for exact model ID', () => {
      expect(budget.getContextWindow('smollm2-1.7b')).toBe(8192);
      expect(budget.getContextWindow('qwen3-8b')).toBe(32768);
      expect(budget.getContextWindow('falcon-e-1b')).toBe(2048);
    });

    it('returns correct window for prefix match', () => {
      expect(budget.getContextWindow('qwen3-4b-instruct-q4_k_m')).toBe(32768);
      expect(budget.getContextWindow('falcon3-7b-instruct-1.58bit')).toBe(8192);
    });

    it('returns default for unknown model', () => {
      expect(budget.getContextWindow('unknown-model-xyz')).toBe(4096);
    });

    it('covers all Qwen3 models', () => {
      expect(budget.getContextWindow('qwen3-1.7b')).toBe(32768);
      expect(budget.getContextWindow('qwen3-4b')).toBe(32768);
      expect(budget.getContextWindow('qwen3-8b')).toBe(32768);
      expect(budget.getContextWindow('qwen3-30b-a3b')).toBe(32768);
    });

    it('covers all BitNet models', () => {
      expect(budget.getContextWindow('bitnet-b1.58-2b')).toBe(4096);
      expect(budget.getContextWindow('falcon-e-3b')).toBe(2048);
      expect(budget.getContextWindow('falcon3-1b')).toBe(8192);
      expect(budget.getContextWindow('falcon3-10b')).toBe(8192);
    });

    it('covers vision models', () => {
      expect(budget.getContextWindow('moondream2')).toBe(2048);
      expect(budget.getContextWindow('qwen2.5-vl-3b')).toBe(32768);
    });
  });

  describe('budget allocation', () => {
    it('allocates budgets that sum to total', () => {
      const alloc = budget.allocate('qwen3-8b');
      const sum = alloc.systemPromptTokens + alloc.intentContextTokens +
        alloc.documentContextTokens + alloc.knowledgeGraphTokens +
        alloc.conversationHistoryTokens + alloc.headroomTokens;
      // Allow 1-token rounding error per category (6 categories)
      expect(Math.abs(alloc.totalTokens - sum)).toBeLessThanOrEqual(6);
    });

    it('allocates proportionally for different models', () => {
      const small = budget.allocate('falcon-e-1b'); // 2048
      const large = budget.allocate('qwen3-8b'); // 32768

      expect(large.conversationHistoryTokens).toBeGreaterThan(small.conversationHistoryTokens);
      expect(large.documentContextTokens).toBeGreaterThan(small.documentContextTokens);
    });

    it('system prompt gets 15% of context window', () => {
      const alloc = budget.allocate('qwen3-8b');
      expect(alloc.systemPromptTokens).toBe(Math.floor(32768 * 0.15));
    });

    it('conversation history gets 20% of context window', () => {
      const alloc = budget.allocate('qwen3-8b');
      expect(alloc.conversationHistoryTokens).toBe(Math.floor(32768 * 0.20));
    });
  });

  describe('token estimation', () => {
    it('estimates tokens from character count', () => {
      // Default: 3.5 chars per token
      expect(budget.estimateTokens('1234567')).toBe(2); // 7 / 3.5 = 2
      expect(budget.estimateTokens('')).toBe(0);
    });

    it('converts tokens to character budget', () => {
      const chars = budget.tokensToChars(100);
      expect(chars).toBe(350); // 100 * 3.5
    });
  });

  describe('truncation', () => {
    it('does not truncate content within budget', () => {
      const result = budget.truncateToFit('short text', 100);
      expect(result.wasTruncated).toBe(false);
      expect(result.content).toBe('short text');
    });

    it('truncates content exceeding budget', () => {
      const longText = 'x'.repeat(10000);
      const result = budget.truncateToFit(longText, 10); // ~35 chars budget
      expect(result.wasTruncated).toBe(true);
      expect(result.content.length).toBeLessThan(longText.length);
      expect(result.content).toContain('[result truncated');
      expect(result.originalChars).toBe(10000);
    });

    it('truncation marker includes original and kept char counts', () => {
      const longText = 'x'.repeat(5000);
      const result = budget.truncateToFit(longText, 50);
      expect(result.content).toContain('5000 chars total');
      expect(result.content).toContain('chars]');
    });
  });

  describe('history management', () => {
    it('calculateHistoryTurns fits turns within budget', () => {
      const turns = Array.from({ length: 20 }, (_, i) => ({
        content: `Turn ${i}: ${'x'.repeat(200)}`,
      }));

      // For a 4096-token model, history budget = 20% = ~819 tokens = ~2867 chars
      // Each turn is ~207 chars, so ~13 turns should fit
      const count = budget.calculateHistoryTurns(turns, 'bitnet-b1.58-2b');
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(turns.length);
    });

    it('calculateHistoryTurns returns all turns when budget is large', () => {
      const turns = Array.from({ length: 3 }, (_, i) => ({
        content: `Turn ${i}: short`,
      }));

      // 32k model should easily fit 3 short turns
      const count = budget.calculateHistoryTurns(turns, 'qwen3-8b');
      expect(count).toBe(3);
    });

    it('needsSummarization returns false for short history', () => {
      const turns = [{ content: 'Hello' }, { content: 'Hi there!' }];
      expect(budget.needsSummarization(turns, 'qwen3-8b')).toBe(false);
    });

    it('needsSummarization returns true for long history', () => {
      const turns = Array.from({ length: 50 }, (_, i) => ({
        content: `Turn ${i}: ${'x'.repeat(500)}`,
      }));
      // 50 turns * ~505 chars = ~25k chars — exceeds 20% of any reasonable model
      expect(budget.needsSummarization(turns, 'falcon-e-1b')).toBe(true);
    });
  });

  describe('knowledge limit calculation', () => {
    it('calculateKnowledgeLimit adapts to model size', () => {
      const smallLimit = budget.calculateKnowledgeLimit('falcon-e-1b'); // 2048 tokens
      const largeLimit = budget.calculateKnowledgeLimit('qwen3-8b'); // 32768 tokens

      expect(largeLimit).toBeGreaterThan(smallLimit);
    });

    it('calculateKnowledgeLimit returns at least 1', () => {
      expect(budget.calculateKnowledgeLimit('falcon-e-1b')).toBeGreaterThanOrEqual(1);
    });

    it('calculateDocChunkSize distributes budget across chunks', () => {
      const single = budget.calculateDocChunkSize('qwen3-8b', 1);
      const multi = budget.calculateDocChunkSize('qwen3-8b', 5);

      expect(single).toBeGreaterThan(multi);
      expect(multi * 5).toBeLessThanOrEqual(single * 1.1); // roughly equal total budget
    });
  });

  describe('token write-back', () => {
    it('recordActualTokens updates chars-per-token estimate', () => {
      const initialCpt = budget.getCharsPerToken();

      // Record actual: 1000 chars = 250 tokens → 4.0 chars/token
      budget.recordActualTokens('qwen3-8b', 1000, 250);

      const newCpt = budget.getCharsPerToken();
      // Should have moved toward 4.0 from the default 3.5
      expect(newCpt).toBeGreaterThan(initialCpt);
    });

    it('ignores zero token counts', () => {
      const initialCpt = budget.getCharsPerToken();
      budget.recordActualTokens('qwen3-8b', 0, 0);
      expect(budget.getCharsPerToken()).toBe(initialCpt);
    });

    it('running average smooths out outliers', () => {
      // Record several consistent observations
      for (let i = 0; i < 5; i++) {
        budget.recordActualTokens('qwen3-8b', 3500, 1000); // 3.5 cpt
      }
      const baseline = budget.getCharsPerToken();

      // One outlier shouldn't move it much
      budget.recordActualTokens('qwen3-8b', 10000, 1000); // 10.0 cpt outlier
      const afterOutlier = budget.getCharsPerToken();

      // Should still be close to 3.5, not jumped to 10
      expect(afterOutlier).toBeLessThan(5);
    });
  });
});
