// Tests for Orchestrator email tools — tool routing, autonomy tier checks, approval queueing.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { OrchestratorImpl } from '@semblance/core/agent/orchestrator.js';
import { AutonomyManager } from '@semblance/core/agent/autonomy.js';
import type { LLMProvider, ChatResponse, ToolCall } from '@semblance/core/llm/types.js';
import type { KnowledgeGraph, SearchResult } from '@semblance/core/knowledge/index.js';
import type { IPCClient } from '@semblance/core/agent/ipc-client.js';

function createMockLLM(overrides?: Partial<LLMProvider>): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn(),
    chat: vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: 'Done.' },
      model: 'llama3.2:8b',
      tokensUsed: { prompt: 100, completion: 20, total: 120 },
      durationMs: 500,
      toolCalls: undefined,
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

describe('Orchestrator — Email Tools', () => {
  let db: Database.Database;
  let orchestrator: OrchestratorImpl;
  let autonomy: AutonomyManager;
  let ipc: IPCClient;
  let llm: LLMProvider;

  beforeEach(() => {
    db = new Database(':memory:');
    autonomy = new AutonomyManager(db);
    ipc = createMockIPC();
  });

  describe('send_email tool — Guardian mode', () => {
    beforeEach(() => {
      autonomy.setDomainTier('email', 'guardian');
      llm = createMockLLM({
        chat: vi.fn()
          .mockResolvedValueOnce(makeToolCallResponse([{
            name: 'send_email',
            arguments: {
              to: ['bob@example.com'],
              subject: 'Hello',
              body: 'Test body',
            },
          }]))
          .mockResolvedValue({
            message: { role: 'assistant', content: 'Email queued for approval.' },
            model: 'llama3.2:8b',
            tokensUsed: { prompt: 200, completion: 30, total: 230 },
            durationMs: 300,
          } satisfies ChatResponse),
      });

      orchestrator = new OrchestratorImpl({
        llm,
        knowledge: createMockKnowledge(),
        ipc,
        autonomy,
        db,
        model: 'llama3.2:8b',
      });
    });

    it('queues email.send for approval in guardian mode', async () => {
      const result = await orchestrator.processMessage('Send an email to bob');
      const pending = await orchestrator.getPendingActions();
      expect(pending.length).toBeGreaterThanOrEqual(1);
      expect(pending[0].action).toBe('email.send');
      expect(pending[0].status).toBe('pending_approval');
    });

    it('does not call IPC directly in guardian mode', async () => {
      await orchestrator.processMessage('Send an email to bob');
      // In guardian mode, send_email should NOT trigger IPC directly
      const sendCalls = (ipc.sendAction as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: unknown[]) => call[0] === 'email.send'
      );
      expect(sendCalls.length).toBe(0);
    });
  });

  describe('send_email tool — Partner mode', () => {
    beforeEach(() => {
      autonomy.setDomainTier('email', 'partner');
    });

    it('auto-executes email.send in partner mode for write actions (queued)', async () => {
      llm = createMockLLM({
        chat: vi.fn()
          .mockResolvedValueOnce(makeToolCallResponse([{
            name: 'send_email',
            arguments: {
              to: ['bob@example.com'],
              subject: 'Quick reply',
              body: 'Thanks!',
            },
          }]))
          .mockResolvedValue({
            message: { role: 'assistant', content: 'Email sent.' },
            model: 'llama3.2:8b',
            tokensUsed: { prompt: 200, completion: 30, total: 230 },
            durationMs: 300,
          } satisfies ChatResponse),
      });
      orchestrator = new OrchestratorImpl({
        llm, knowledge: createMockKnowledge(), ipc, autonomy, db, model: 'llama3.2:8b',
      });

      const result = await orchestrator.processMessage('Reply thanks to bob');
      // Partner mode: send_email is a write action, decision depends on autonomy config
      // Default partner: novel sends require approval
      expect(result.actions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('archive_email tool — Partner mode', () => {
    beforeEach(() => {
      autonomy.setDomainTier('email', 'partner');
      llm = createMockLLM({
        chat: vi.fn()
          .mockResolvedValueOnce(makeToolCallResponse([{
            name: 'archive_email',
            arguments: { messageIds: ['msg-1', 'msg-2'] },
          }]))
          .mockResolvedValue({
            message: { role: 'assistant', content: 'Archived.' },
            model: 'llama3.2:8b',
            tokensUsed: { prompt: 150, completion: 20, total: 170 },
            durationMs: 200,
          } satisfies ChatResponse),
      });
      orchestrator = new OrchestratorImpl({
        llm, knowledge: createMockKnowledge(), ipc, autonomy, db, model: 'llama3.2:8b',
      });
    });

    it('routes archive_email to email.archive action type', async () => {
      const result = await orchestrator.processMessage('Archive these emails');
      expect(result.actions.length).toBeGreaterThanOrEqual(1);
      expect(result.actions[0].action).toBe('email.archive');
    });
  });

  describe('draft_email tool', () => {
    beforeEach(() => {
      autonomy.setDomainTier('email', 'guardian');
      llm = createMockLLM({
        chat: vi.fn()
          .mockResolvedValueOnce(makeToolCallResponse([{
            name: 'draft_email',
            arguments: {
              to: ['bob@example.com'],
              subject: 'Draft subject',
              body: 'Draft body',
            },
          }]))
          .mockResolvedValue({
            message: { role: 'assistant', content: 'Draft saved.' },
            model: 'llama3.2:8b',
            tokensUsed: { prompt: 150, completion: 20, total: 170 },
            durationMs: 200,
          } satisfies ChatResponse),
      });
      orchestrator = new OrchestratorImpl({
        llm, knowledge: createMockKnowledge(), ipc, autonomy, db, model: 'llama3.2:8b',
      });
    });

    it('routes draft_email to email.draft action type', async () => {
      const result = await orchestrator.processMessage('Save a draft to bob');
      expect(result.actions.length).toBeGreaterThanOrEqual(1);
      expect(result.actions[0].action).toBe('email.draft');
    });
  });

  describe('approval flow', () => {
    beforeEach(() => {
      autonomy.setDomainTier('email', 'guardian');
      llm = createMockLLM({
        chat: vi.fn()
          .mockResolvedValueOnce(makeToolCallResponse([{
            name: 'send_email',
            arguments: { to: ['bob@example.com'], subject: 'Approve me', body: 'Body' },
          }]))
          .mockResolvedValue({
            message: { role: 'assistant', content: 'Queued.' },
            model: 'llama3.2:8b',
            tokensUsed: { prompt: 200, completion: 30, total: 230 },
            durationMs: 300,
          } satisfies ChatResponse),
      });
      orchestrator = new OrchestratorImpl({
        llm, knowledge: createMockKnowledge(), ipc, autonomy, db, model: 'llama3.2:8b',
      });
    });

    it('approveAction executes the queued action via IPC', async () => {
      await orchestrator.processMessage('Send email');
      const pending = await orchestrator.getPendingActions();
      expect(pending.length).toBe(1);

      await orchestrator.approveAction(pending[0].id);
      expect(ipc.sendAction).toHaveBeenCalledWith('email.send', expect.any(Object));
    });

    it('rejectAction removes from pending', async () => {
      await orchestrator.processMessage('Send email');
      const pending = await orchestrator.getPendingActions();
      await orchestrator.rejectAction(pending[0].id);

      const afterReject = await orchestrator.getPendingActions();
      expect(afterReject.length).toBe(0);
    });
  });

  describe('approval pattern tracking', () => {
    beforeEach(() => {
      autonomy.setDomainTier('email', 'guardian');
      llm = createMockLLM({
        chat: vi.fn()
          .mockResolvedValue(makeToolCallResponse([{
            name: 'send_email',
            arguments: { to: ['bob@example.com'], subject: 'Pattern test', body: 'Body' },
          }])),
      });
      orchestrator = new OrchestratorImpl({
        llm, knowledge: createMockKnowledge(), ipc, autonomy, db, model: 'llama3.2:8b',
      });
    });

    it('getApprovalCount returns 0 for new action types', () => {
      const count = orchestrator.getApprovalCount('email.send', { to: ['bob@example.com'] });
      expect(count).toBe(0);
    });

    it('getApprovalThreshold returns default 3', () => {
      const threshold = orchestrator.getApprovalThreshold('email.send', {});
      expect(threshold).toBe(3);
    });

    it('increments approval count after approving an action', async () => {
      await orchestrator.processMessage('Send email');
      const pending = await orchestrator.getPendingActions();
      await orchestrator.approveAction(pending[0].id);

      const count = orchestrator.getApprovalCount('email.send', { to: ['bob@example.com'] });
      expect(count).toBe(1);
    });
  });

  describe('local tools (no IPC needed)', () => {
    beforeEach(() => {
      const mockKnowledge = createMockKnowledge();
      (mockKnowledge.search as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          document: { id: 'doc-1', title: 'Email from Alice', metadata: {}, sourcePath: '' },
          chunk: { content: 'Meeting notes from yesterday', chunkIndex: 0 },
          score: 0.85,
        },
      ] as SearchResult[]);

      llm = createMockLLM({
        chat: vi.fn()
          .mockResolvedValueOnce(makeToolCallResponse([{
            name: 'search_emails',
            arguments: { query: 'meeting notes' },
          }]))
          .mockResolvedValue({
            message: { role: 'assistant', content: 'Found meeting notes.' },
            model: 'llama3.2:8b',
            tokensUsed: { prompt: 300, completion: 50, total: 350 },
            durationMs: 500,
          } satisfies ChatResponse),
      });
      orchestrator = new OrchestratorImpl({
        llm, knowledge: mockKnowledge, ipc, autonomy: new AutonomyManager(db), db, model: 'llama3.2:8b',
      });
    });

    it('search_emails does not trigger IPC', async () => {
      await orchestrator.processMessage('Find meeting notes');
      expect(ipc.sendAction).not.toHaveBeenCalled();
    });
  });
});
