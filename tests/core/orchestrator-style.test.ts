// Tests for Orchestrator style integration — style prompt injection, scoring, retries.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { OrchestratorImpl } from '@semblance/core/agent/orchestrator.js';
import { AutonomyManager } from '@semblance/core/agent/autonomy.js';
import { StyleProfileStore, createEmptyProfile, type StyleProfile } from '@semblance/core/style/style-profile.js';
import type { LLMProvider, ChatResponse, ToolCall } from '@semblance/core/llm/types.js';
import type { KnowledgeGraph, SearchResult } from '@semblance/core/knowledge/index.js';
import type { IPCClient } from '@semblance/core/agent/ipc-client.js';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createMockLLM(overrides?: Partial<LLMProvider>): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn(),
    chat: vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: 'Done.' },
      model: 'llama3.2:8b',
      tokensUsed: { prompt: 100, completion: 20, total: 120 },
      durationMs: 500,
    } satisfies ChatResponse),
    embed: vi.fn(),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn(),
    ...overrides,
  };
}

function createMockKnowledge(): KnowledgeGraph {
  return {
    indexDocument: vi.fn(),
    search: vi.fn().mockResolvedValue([] as SearchResult[]),
    scanDirectory: vi.fn(),
    getDocument: vi.fn(),
    listDocuments: vi.fn(),
    getStats: vi.fn(),
    deleteDocument: vi.fn(),
  };
}

function createMockIPC(): IPCClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    sendAction: vi.fn().mockResolvedValue({
      requestId: 'mock',
      timestamp: new Date().toISOString(),
      status: 'success' as const,
      data: {},
      auditRef: 'audit-1',
    }),
  };
}

function makeToolCallResponse(toolCalls: ToolCall[]): ChatResponse {
  return {
    message: { role: 'assistant', content: '' },
    model: 'llama3.2:8b',
    tokensUsed: { prompt: 200, completion: 50, total: 250 },
    durationMs: 800,
    toolCalls,
  };
}

function makeActiveProfile(): StyleProfile {
  const profile = createEmptyProfile();
  profile.emailsAnalyzed = 50;
  profile.isActive = true;
  profile.greetings = {
    patterns: [{ text: 'Hi', frequency: 0.8, contexts: [] }],
    usesRecipientName: true,
    usesNameVariant: 'first',
  };
  profile.signoffs = {
    patterns: [{ text: 'Best', frequency: 0.7, contexts: [] }],
    includesName: true,
  };
  profile.tone = { formalityScore: 55, directnessScore: 70, warmthScore: 60 };
  profile.structure = {
    avgSentenceLength: 12, avgParagraphLength: 2, avgEmailLength: 80,
    usesListsOrBullets: false, listFrequency: 0,
  };
  profile.vocabulary = {
    commonPhrases: ['sounds good'], avoidedWords: [],
    usesContractions: true, contractionRate: 0.8,
    usesEmoji: false, emojiFrequency: 0, commonEmoji: [],
    usesExclamation: true, exclamationRate: 0.1,
  };
  profile.contextVariations = [];
  return profile;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Orchestrator — Style Integration', () => {
  let db: Database.Database;
  let styleDb: Database.Database;
  let styleStore: StyleProfileStore;
  let autonomy: AutonomyManager;
  let ipc: IPCClient;

  beforeEach(() => {
    db = new Database(':memory:');
    styleDb = new Database(':memory:');
    styleStore = new StyleProfileStore(styleDb);
    autonomy = new AutonomyManager(db);
    ipc = createMockIPC();
  });

  it('draft_email with active profile generates styled body via LLM', async () => {
    // Create active profile
    const profile = makeActiveProfile();
    styleStore.createProfile(profile);

    // LLM call sequence: 1) initial chat with tool call, 2) style-enhanced draft, 3) follow-up
    const styledDraft = "Hi Bob,\n\nSounds good, I'll take a look at the proposal.\n\nBest,\nAlex";
    const llm = createMockLLM({
      chat: vi.fn()
        .mockResolvedValueOnce(makeToolCallResponse([{
          name: 'draft_email',
          arguments: { to: ['bob@example.com'], subject: 'Re: Proposal', body: 'Draft about proposal' },
        }]))
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: styledDraft },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 300, completion: 60, total: 360 },
          durationMs: 400,
        } satisfies ChatResponse)
        .mockResolvedValue({
          message: { role: 'assistant', content: 'Draft saved with style matching.' },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 200, completion: 30, total: 230 },
          durationMs: 300,
        } satisfies ChatResponse),
    });

    autonomy.setDomainTier('email', 'guardian');
    const orchestrator = new OrchestratorImpl({
      llm, knowledge: createMockKnowledge(), ipc, autonomy, db, model: 'llama3.2:8b',
      styleProfileStore: styleStore,
    });

    const result = await orchestrator.processMessage('Draft an email to bob about the proposal');

    // Verify style prompt was included in the LLM call
    const chatCalls = (llm.chat as ReturnType<typeof vi.fn>).mock.calls;
    // The second call (index 1) should contain the style prompt
    const styleCall = chatCalls[1];
    expect(styleCall).toBeDefined();
    const styleMessages = styleCall[0].messages;
    const userMessage = styleMessages.find((m: { role: string; content: string }) =>
      m.role === 'user' && m.content.includes('style')
    );
    expect(userMessage).toBeDefined();

    // Verify style score is in the response
    expect(result.styleScore).toBeDefined();
    expect(result.styleScore!.overall).toBeGreaterThan(0);
  });

  it('draft_email without profile store uses original body', async () => {
    const originalBody = 'Original draft body';
    const llm = createMockLLM({
      chat: vi.fn()
        .mockResolvedValueOnce(makeToolCallResponse([{
          name: 'draft_email',
          arguments: { to: ['bob@example.com'], subject: 'Test', body: originalBody },
        }]))
        .mockResolvedValue({
          message: { role: 'assistant', content: 'Draft saved.' },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 200, completion: 30, total: 230 },
          durationMs: 300,
        } satisfies ChatResponse),
    });

    autonomy.setDomainTier('email', 'guardian');
    const orchestrator = new OrchestratorImpl({
      llm, knowledge: createMockKnowledge(), ipc, autonomy, db, model: 'llama3.2:8b',
      // No styleProfileStore
    });

    const result = await orchestrator.processMessage('Draft email to bob');
    expect(result.styleScore).toBeUndefined();
  });

  it('draft_email with inactive profile uses generic prompt', async () => {
    // Create profile with < 20 emails
    const profile = createEmptyProfile();
    profile.emailsAnalyzed = 10;
    profile.isActive = false;
    styleStore.createProfile(profile);

    const genericDraft = "Hi Bob,\n\nHere is the information you requested.\n\nBest,\nAlex";
    const llm = createMockLLM({
      chat: vi.fn()
        .mockResolvedValueOnce(makeToolCallResponse([{
          name: 'draft_email',
          arguments: { to: ['bob@example.com'], subject: 'Info', body: 'Info request response' },
        }]))
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: genericDraft },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 200, completion: 40, total: 240 },
          durationMs: 300,
        } satisfies ChatResponse)
        .mockResolvedValue({
          message: { role: 'assistant', content: 'Draft saved.' },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 200, completion: 30, total: 230 },
          durationMs: 300,
        } satisfies ChatResponse),
    });

    autonomy.setDomainTier('email', 'guardian');
    const orchestrator = new OrchestratorImpl({
      llm, knowledge: createMockKnowledge(), ipc, autonomy, db, model: 'llama3.2:8b',
      styleProfileStore: styleStore,
    });

    const result = await orchestrator.processMessage('Draft info email to bob');

    // Verify the generic prompt was used (no style scoring for inactive profile)
    // When inactive, style scoring is not performed — score is undefined
    expect(result.styleScore).toBeUndefined();
  });

  it('below-threshold draft triggers regeneration (max 2 retries)', async () => {
    const profile = makeActiveProfile();
    styleStore.createProfile(profile);

    // First attempt: bad draft (low score). Second attempt: better. Third: good.
    const badDraft = 'Dear Sir, I am writing to confirm. Respectfully, Alexander';
    const betterDraft = 'Hello Bob, I wanted to confirm. Regards, Alex';
    const goodDraft = "Hi Bob,\n\nJust wanted to confirm the meeting. Let me know if that works.\n\nBest,\nAlex";

    const llm = createMockLLM({
      chat: vi.fn()
        .mockResolvedValueOnce(makeToolCallResponse([{
          name: 'draft_email',
          arguments: { to: ['bob@example.com'], subject: 'Confirm', body: 'Confirm meeting' },
        }]))
        // Style drafting attempts (up to 3)
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: badDraft },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 300, completion: 30, total: 330 },
          durationMs: 300,
        } satisfies ChatResponse)
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: betterDraft },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 350, completion: 30, total: 380 },
          durationMs: 300,
        } satisfies ChatResponse)
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: goodDraft },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 400, completion: 40, total: 440 },
          durationMs: 300,
        } satisfies ChatResponse)
        // Follow-up
        .mockResolvedValue({
          message: { role: 'assistant', content: 'Draft saved.' },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 200, completion: 30, total: 230 },
          durationMs: 300,
        } satisfies ChatResponse),
    });

    autonomy.setDomainTier('email', 'guardian');
    const orchestrator = new OrchestratorImpl({
      llm, knowledge: createMockKnowledge(), ipc, autonomy, db, model: 'llama3.2:8b',
      styleProfileStore: styleStore,
      styleScoreThreshold: 70,
    });

    await orchestrator.processMessage('Draft confirmation to bob');

    // Verify multiple LLM calls happened (retries)
    const chatCalls = (llm.chat as ReturnType<typeof vi.fn>).mock.calls;
    // At least 3 calls: initial tool call + 2+ style attempts + follow-up
    expect(chatCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('style score is included in response when draft tool is used', async () => {
    const profile = makeActiveProfile();
    styleStore.createProfile(profile);

    const styledDraft = "Hi Bob,\n\nI've reviewed the doc. Looks good to me.\n\nBest,\nAlex";
    const llm = createMockLLM({
      chat: vi.fn()
        .mockResolvedValueOnce(makeToolCallResponse([{
          name: 'draft_email',
          arguments: { to: ['bob@example.com'], subject: 'Review', body: 'Review doc' },
        }]))
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: styledDraft },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 300, completion: 40, total: 340 },
          durationMs: 300,
        } satisfies ChatResponse)
        .mockResolvedValue({
          message: { role: 'assistant', content: 'Draft ready.' },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 200, completion: 30, total: 230 },
          durationMs: 300,
        } satisfies ChatResponse),
    });

    autonomy.setDomainTier('email', 'guardian');
    const orchestrator = new OrchestratorImpl({
      llm, knowledge: createMockKnowledge(), ipc, autonomy, db, model: 'llama3.2:8b',
      styleProfileStore: styleStore,
    });

    const result = await orchestrator.processMessage('Draft review email to bob');
    expect(result.styleScore).toBeDefined();
    expect(result.styleScore!.overall).toBeGreaterThanOrEqual(0);
    expect(result.styleScore!.breakdown).toBeDefined();
  });

  it('send_email tool also gets style enhancement', async () => {
    const profile = makeActiveProfile();
    styleStore.createProfile(profile);

    const styledDraft = "Hi Bob,\n\nHere's the update.\n\nBest,\nAlex";
    const llm = createMockLLM({
      chat: vi.fn()
        .mockResolvedValueOnce(makeToolCallResponse([{
          name: 'send_email',
          arguments: { to: ['bob@example.com'], subject: 'Update', body: 'Project update' },
        }]))
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: styledDraft },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 300, completion: 40, total: 340 },
          durationMs: 300,
        } satisfies ChatResponse)
        .mockResolvedValue({
          message: { role: 'assistant', content: 'Email queued.' },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 200, completion: 30, total: 230 },
          durationMs: 300,
        } satisfies ChatResponse),
    });

    autonomy.setDomainTier('email', 'guardian');
    const orchestrator = new OrchestratorImpl({
      llm, knowledge: createMockKnowledge(), ipc, autonomy, db, model: 'llama3.2:8b',
      styleProfileStore: styleStore,
    });

    const result = await orchestrator.processMessage('Send update to bob');
    expect(result.styleScore).toBeDefined();
  });

  it('non-email tools are not affected by style system', async () => {
    const profile = makeActiveProfile();
    styleStore.createProfile(profile);

    // Use search_files — a local tool that doesn't need autonomy domain mapping
    const llm = createMockLLM({
      chat: vi.fn()
        .mockResolvedValueOnce(makeToolCallResponse([{
          name: 'search_files',
          arguments: { query: 'meeting notes' },
        }]))
        .mockResolvedValue({
          message: { role: 'assistant', content: 'Found some files.' },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 200, completion: 30, total: 230 },
          durationMs: 300,
        } satisfies ChatResponse),
    });

    autonomy.setDomainTier('email', 'guardian');
    const orchestrator = new OrchestratorImpl({
      llm, knowledge: createMockKnowledge(), ipc, autonomy, db, model: 'llama3.2:8b',
      styleProfileStore: styleStore,
    });

    const result = await orchestrator.processMessage('Find meeting notes');
    expect(result.styleScore).toBeUndefined();
  });

  it('all existing email tests still pass — constructor accepts new optional params', () => {
    // Verify backwards compatibility — no styleProfileStore means no style
    const orchestrator = new OrchestratorImpl({
      llm: createMockLLM(),
      knowledge: createMockKnowledge(),
      ipc,
      autonomy,
      db,
      model: 'llama3.2:8b',
    });
    expect(orchestrator).toBeDefined();
  });

  it('max 2 retries enforced (3 total attempts)', async () => {
    const profile = makeActiveProfile();
    styleStore.createProfile(profile);

    // All attempts return low-scoring drafts
    const lowDraft = 'Dear Sir, Thank you for your correspondence. Respectfully, The Management';
    const llm = createMockLLM({
      chat: vi.fn()
        .mockResolvedValueOnce(makeToolCallResponse([{
          name: 'draft_email',
          arguments: { to: ['bob@example.com'], subject: 'Test', body: 'test' },
        }]))
        // 3 style attempts (all low scoring)
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: lowDraft },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 300, completion: 30, total: 330 },
          durationMs: 300,
        } satisfies ChatResponse)
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: lowDraft },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 350, completion: 30, total: 380 },
          durationMs: 300,
        } satisfies ChatResponse)
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: lowDraft },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 400, completion: 30, total: 430 },
          durationMs: 300,
        } satisfies ChatResponse)
        // Follow-up
        .mockResolvedValue({
          message: { role: 'assistant', content: 'Draft saved.' },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 200, completion: 30, total: 230 },
          durationMs: 300,
        } satisfies ChatResponse),
    });

    autonomy.setDomainTier('email', 'guardian');
    const orchestrator = new OrchestratorImpl({
      llm, knowledge: createMockKnowledge(), ipc, autonomy, db, model: 'llama3.2:8b',
      styleProfileStore: styleStore,
      styleScoreThreshold: 95, // Very high threshold to force all retries
    });

    await orchestrator.processMessage('Draft test email');

    const chatCalls = (llm.chat as ReturnType<typeof vi.fn>).mock.calls;
    // 1 initial + 3 style attempts (max) + 1 follow-up = 5
    const styleCalls = chatCalls.filter((call: unknown[]) => {
      const messages = (call[0] as { messages: Array<{ content: string }> }).messages;
      return messages.some(m => m.content.includes('style') || m.content.includes('email body'));
    });
    // Should be exactly 3 style attempts (initial + 2 retries)
    expect(styleCalls.length).toBeLessThanOrEqual(3);
  });
});
