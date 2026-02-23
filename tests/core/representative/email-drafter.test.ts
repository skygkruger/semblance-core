/**
 * Step 20 — RepresentativeEmailDrafter tests.
 * Tests style-matched email drafting with retry logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RepresentativeEmailDrafter } from '@semblance/core/representative/email-drafter';
import type { StyleProfileProvider, KnowledgeProvider, DraftEmailRequest } from '@semblance/core/representative/types';
import type { StyleScore } from '@semblance/core/style/style-scorer';
import type { LLMProvider, ChatResponse } from '@semblance/core/llm/types';

function makeStyleProvider(overrides?: Partial<StyleProfileProvider>): StyleProfileProvider {
  return {
    getProfile: () => null,
    hasMinimumData: () => false,
    getStyleScore: () => null,
    getStylePrompt: () => 'Write in a professional tone.',
    getRetryPrompt: () => '',
    ...overrides,
  };
}

function makeKnowledgeProvider(): KnowledgeProvider {
  return {
    searchContext: async () => [],
    searchEmails: async () => [],
  };
}

function makeLLM(responseText: string = 'Hi Alex,\n\nThanks for reaching out.\n\nBest,\nSky'): LLMProvider {
  return {
    isAvailable: async () => true,
    generate: async () => ({ text: '', model: 'test', tokensUsed: { prompt: 0, completion: 0, total: 0 }, durationMs: 0 }),
    chat: async () => ({
      message: { role: 'assistant' as const, content: responseText },
      model: 'test',
      tokensUsed: { prompt: 100, completion: 50, total: 150 },
      durationMs: 200,
    }),
    embed: async () => ({ embeddings: [[]], model: 'test', durationMs: 0 }),
    listModels: async () => [],
    getModel: async () => null,
  };
}

const baseRequest: DraftEmailRequest = {
  to: 'alex@example.com',
  subject: 'Meeting Follow-up',
  intent: 'Follow up on last week\'s meeting about project timelines',
  draftType: 'general',
  recipientName: 'Alex',
};

describe('RepresentativeEmailDrafter (Step 20)', () => {
  it('produces a draft with correct metadata', async () => {
    const drafter = new RepresentativeEmailDrafter({
      llm: makeLLM(),
      model: 'llama3.2',
      styleProvider: makeStyleProvider(),
      knowledgeProvider: makeKnowledgeProvider(),
    });

    const draft = await drafter.draftEmail(baseRequest);
    expect(draft.to).toBe('alex@example.com');
    expect(draft.subject).toBe('Meeting Follow-up');
    expect(draft.draftType).toBe('general');
    expect(draft.body).toContain('Thanks for reaching out');
    expect(draft.attempts).toBe(1);
  });

  it('includes style score when profile is active', async () => {
    const mockScore: StyleScore = {
      overall: 80,
      breakdown: { greeting: 90, signoff: 85, sentenceLength: 70, formality: 75, vocabulary: 80 },
    };

    const drafter = new RepresentativeEmailDrafter({
      llm: makeLLM(),
      model: 'llama3.2',
      styleProvider: makeStyleProvider({
        hasMinimumData: () => true,
        getStyleScore: () => mockScore,
        getStylePrompt: () => 'Match the user\'s casual style.',
      }),
      knowledgeProvider: makeKnowledgeProvider(),
    });

    const draft = await drafter.draftEmail(baseRequest);
    expect(draft.styleScore).not.toBeNull();
    expect(draft.styleScore!.overall).toBe(80);
  });

  it('retries when style score is below threshold', async () => {
    let callCount = 0;
    const scores: StyleScore[] = [
      { overall: 40, breakdown: { greeting: 30, signoff: 50, sentenceLength: 40, formality: 35, vocabulary: 45 } },
      { overall: 75, breakdown: { greeting: 80, signoff: 85, sentenceLength: 70, formality: 65, vocabulary: 70 } },
    ];

    const llm = makeLLM();
    llm.chat = async () => {
      callCount++;
      return {
        message: { role: 'assistant' as const, content: `Draft attempt ${callCount}` },
        model: 'test',
        tokensUsed: { prompt: 100, completion: 50, total: 150 },
        durationMs: 200,
      };
    };

    const drafter = new RepresentativeEmailDrafter({
      llm,
      model: 'llama3.2',
      scoreThreshold: 65,
      styleProvider: makeStyleProvider({
        hasMinimumData: () => true,
        getStyleScore: () => {
          const idx = Math.min(callCount - 1, scores.length - 1);
          return scores[idx]!;
        },
        getStylePrompt: () => 'Match style',
        getRetryPrompt: () => 'Fix greeting and formality',
      }),
      knowledgeProvider: makeKnowledgeProvider(),
    });

    const draft = await drafter.draftEmail(baseRequest);
    expect(callCount).toBe(2);
    expect(draft.attempts).toBe(2);
    expect(draft.styleScore!.overall).toBe(75);
  });

  it('stops after 3 attempts even if score is below threshold', async () => {
    let callCount = 0;
    const lowScore: StyleScore = {
      overall: 30,
      breakdown: { greeting: 20, signoff: 30, sentenceLength: 40, formality: 25, vocabulary: 35 },
    };

    const llm = makeLLM();
    llm.chat = async () => {
      callCount++;
      return {
        message: { role: 'assistant' as const, content: `Draft ${callCount}` },
        model: 'test',
        tokensUsed: { prompt: 100, completion: 50, total: 150 },
        durationMs: 200,
      };
    };

    const drafter = new RepresentativeEmailDrafter({
      llm,
      model: 'llama3.2',
      scoreThreshold: 90,
      styleProvider: makeStyleProvider({
        hasMinimumData: () => true,
        getStyleScore: () => lowScore,
        getStylePrompt: () => 'Match style',
        getRetryPrompt: () => 'Fix everything',
      }),
      knowledgeProvider: makeKnowledgeProvider(),
    });

    const draft = await drafter.draftEmail(baseRequest);
    expect(callCount).toBe(3);
    expect(draft.attempts).toBe(3);
  });

  it('accepts first draft when no style profile is active', async () => {
    let callCount = 0;
    const llm = makeLLM();
    llm.chat = async () => {
      callCount++;
      return {
        message: { role: 'assistant' as const, content: 'Hi there' },
        model: 'test',
        tokensUsed: { prompt: 100, completion: 50, total: 150 },
        durationMs: 200,
      };
    };

    const drafter = new RepresentativeEmailDrafter({
      llm,
      model: 'llama3.2',
      styleProvider: makeStyleProvider({ getStyleScore: () => null }),
      knowledgeProvider: makeKnowledgeProvider(),
    });

    const draft = await drafter.draftEmail(baseRequest);
    expect(callCount).toBe(1);
    expect(draft.styleScore).toBeNull();
  });

  it('includes knowledge context in LLM prompt', async () => {
    let capturedMessages: unknown[] = [];
    const llm = makeLLM();
    llm.chat = async (req) => {
      capturedMessages = req.messages;
      return {
        message: { role: 'assistant' as const, content: 'Draft with context' },
        model: 'test',
        tokensUsed: { prompt: 100, completion: 50, total: 150 },
        durationMs: 200,
      };
    };

    const kp: KnowledgeProvider = {
      searchContext: async () => [{
        chunk: { id: 'c1', documentId: 'd1', content: 'Previous meeting discussed Q3 budget', chunkIndex: 0, metadata: {} },
        document: {
          id: 'd1', source: 'email', title: 'Meeting Notes', content: '', contentHash: '',
          mimeType: 'text/plain', createdAt: '', updatedAt: '', indexedAt: '', metadata: {},
        },
        score: 0.8,
      }],
      searchEmails: async () => [],
    };

    const drafter = new RepresentativeEmailDrafter({
      llm,
      model: 'llama3.2',
      styleProvider: makeStyleProvider(),
      knowledgeProvider: kp,
    });

    await drafter.draftEmail(baseRequest);
    const systemMsg = capturedMessages[0] as { content: string };
    expect(systemMsg.content).toContain('Q3 budget');
  });

  it('preserves replyToMessageId in output', async () => {
    const drafter = new RepresentativeEmailDrafter({
      llm: makeLLM(),
      model: 'llama3.2',
      styleProvider: makeStyleProvider(),
      knowledgeProvider: makeKnowledgeProvider(),
    });

    const draft = await drafter.draftEmail({ ...baseRequest, replyToMessageId: 'msg-123' });
    expect(draft.replyToMessageId).toBe('msg-123');
  });

  it('keeps the best scoring draft across retries', async () => {
    let callCount = 0;
    const llm = makeLLM();
    llm.chat = async () => {
      callCount++;
      return {
        message: { role: 'assistant' as const, content: `Draft-${callCount}` },
        model: 'test',
        tokensUsed: { prompt: 100, completion: 50, total: 150 },
        durationMs: 200,
      };
    };

    // Scores: 50, 60, 45 — should keep draft from attempt 2 (score 60)
    const scores = [50, 60, 45];
    const drafter = new RepresentativeEmailDrafter({
      llm,
      model: 'llama3.2',
      scoreThreshold: 90,
      styleProvider: makeStyleProvider({
        hasMinimumData: () => true,
        getStyleScore: () => {
          const idx = Math.min(callCount - 1, scores.length - 1);
          return {
            overall: scores[idx]!,
            breakdown: { greeting: 50, signoff: 50, sentenceLength: 50, formality: 50, vocabulary: 50 },
          };
        },
        getStylePrompt: () => 'Match style',
        getRetryPrompt: () => 'Retry',
      }),
      knowledgeProvider: makeKnowledgeProvider(),
    });

    const draft = await drafter.draftEmail(baseRequest);
    expect(draft.styleScore!.overall).toBe(60);
    expect(draft.body).toBe('Draft-2');
  });
});
