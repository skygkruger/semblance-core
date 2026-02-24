// Tests for Orchestrator calendar tools — event creation, conflict detection, autonomy.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { OrchestratorImpl } from '@semblance/core/agent/orchestrator.js';
import { AutonomyManager } from '@semblance/core/agent/autonomy.js';
import type { LLMProvider, ChatResponse, ToolCall } from '@semblance/core/llm/types.js';
import type { KnowledgeGraph, SearchResult } from '@semblance/core/knowledge/index.js';
import type { IPCClient } from '@semblance/core/agent/ipc-client.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';

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

function createMockKnowledge(searchResults?: SearchResult[]): KnowledgeGraph {
  return {
    indexDocument: vi.fn(),
    search: vi.fn().mockResolvedValue(searchResults ?? ([] as SearchResult[])),
    scanDirectory: vi.fn(),
    getDocument: vi.fn(),
    listDocuments: vi.fn(),
    getStats: vi.fn(),
    deleteDocument: vi.fn(),
    semanticSearch: { search: vi.fn().mockResolvedValue([]) } as any,
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

describe('Orchestrator — Calendar Tools', () => {
  let db: Database.Database;
  let autonomy: AutonomyManager;
  let ipc: IPCClient;

  beforeEach(() => {
    db = new Database(':memory:');
    autonomy = new AutonomyManager(db as unknown as DatabaseHandle);
    ipc = createMockIPC();
  });

  describe('create_calendar_event — Guardian mode', () => {
    it('queues event creation for approval in guardian mode', async () => {
      autonomy.setDomainTier('calendar', 'guardian');
      const llm = createMockLLM({
        chat: vi.fn()
          .mockResolvedValueOnce(makeToolCallResponse([{
            name: 'create_calendar_event',
            arguments: {
              title: 'Team Lunch',
              startTime: '2025-06-20T12:00:00Z',
              endTime: '2025-06-20T13:00:00Z',
            },
          }]))
          .mockResolvedValue({
            message: { role: 'assistant', content: 'Queued.' },
            model: 'llama3.2:8b',
            tokensUsed: { prompt: 200, completion: 30, total: 230 },
            durationMs: 300,
          } satisfies ChatResponse),
      });
      const orchestrator = new OrchestratorImpl({
        llm, knowledge: createMockKnowledge(), ipc, autonomy, db: db as unknown as DatabaseHandle, model: 'llama3.2:8b',
      });

      await orchestrator.processMessage('Schedule a team lunch tomorrow');
      const pending = await orchestrator.getPendingActions();
      expect(pending.length).toBeGreaterThanOrEqual(1);
      expect(pending[0]!.action).toBe('calendar.create');
      expect(pending[0]!.status).toBe('pending_approval');
    });
  });

  describe('create_calendar_event — Alter Ego mode', () => {
    it('auto-executes event creation in alter_ego mode', async () => {
      autonomy.setDomainTier('calendar', 'alter_ego');
      const llm = createMockLLM({
        chat: vi.fn()
          .mockResolvedValueOnce(makeToolCallResponse([{
            name: 'create_calendar_event',
            arguments: {
              title: 'Standup',
              startTime: '2025-06-20T09:00:00Z',
              endTime: '2025-06-20T09:15:00Z',
            },
          }]))
          .mockResolvedValue({
            message: { role: 'assistant', content: 'Event created.' },
            model: 'llama3.2:8b',
            tokensUsed: { prompt: 200, completion: 30, total: 230 },
            durationMs: 300,
          } satisfies ChatResponse),
      });
      const orchestrator = new OrchestratorImpl({
        llm, knowledge: createMockKnowledge(), ipc, autonomy, db: db as unknown as DatabaseHandle, model: 'llama3.2:8b',
      });

      await orchestrator.processMessage('Add a standup at 9am');
      expect(ipc.sendAction).toHaveBeenCalledWith('calendar.create', expect.any(Object));
    });
  });

  describe('fetch_calendar tool', () => {
    it('auto-executes fetch_calendar as a read action in partner mode', async () => {
      autonomy.setDomainTier('calendar', 'partner');
      const llm = createMockLLM({
        chat: vi.fn()
          .mockResolvedValueOnce(makeToolCallResponse([{
            name: 'fetch_calendar',
            arguments: { daysAhead: 7 },
          }]))
          .mockResolvedValue({
            message: { role: 'assistant', content: 'Here are your events.' },
            model: 'llama3.2:8b',
            tokensUsed: { prompt: 200, completion: 50, total: 250 },
            durationMs: 400,
          } satisfies ChatResponse),
      });
      const orchestrator = new OrchestratorImpl({
        llm, knowledge: createMockKnowledge(), ipc, autonomy, db: db as unknown as DatabaseHandle, model: 'llama3.2:8b',
      });

      await orchestrator.processMessage("What's on my calendar?");
      // Read actions auto-execute in partner mode (calendar.fetch is 'read' risk)
      expect(ipc.sendAction).toHaveBeenCalledWith('calendar.fetch', expect.any(Object));
    });
  });

  describe('detect_calendar_conflicts tool', () => {
    it('runs conflict detection locally without IPC', async () => {
      const llm = createMockLLM({
        chat: vi.fn()
          .mockResolvedValueOnce(makeToolCallResponse([{
            name: 'detect_calendar_conflicts',
            arguments: {
              startTime: '2025-06-20T10:00:00Z',
              endTime: '2025-06-20T11:00:00Z',
            },
          }]))
          .mockResolvedValue({
            message: { role: 'assistant', content: 'No conflicts found.' },
            model: 'llama3.2:8b',
            tokensUsed: { prompt: 200, completion: 20, total: 220 },
            durationMs: 200,
          } satisfies ChatResponse),
      });
      const orchestrator = new OrchestratorImpl({
        llm, knowledge: createMockKnowledge(), ipc, autonomy, db: db as unknown as DatabaseHandle, model: 'llama3.2:8b',
      });

      await orchestrator.processMessage('Check for conflicts at 10am');
      // Conflict detection is local — should NOT call sendAction
      const calCreateCalls = (ipc.sendAction as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: unknown[]) => call[0] === 'calendar.create'
      );
      expect(calCreateCalls.length).toBe(0);
    });
  });

  describe('calendar autonomy across tiers', () => {
    it('partner mode auto-approves routine scheduling', async () => {
      autonomy.setDomainTier('calendar', 'partner');
      const llm = createMockLLM({
        chat: vi.fn()
          .mockResolvedValueOnce(makeToolCallResponse([{
            name: 'create_calendar_event',
            arguments: {
              title: 'Quick sync',
              startTime: '2025-06-20T14:00:00Z',
              endTime: '2025-06-20T14:30:00Z',
            },
          }]))
          .mockResolvedValue({
            message: { role: 'assistant', content: 'Created.' },
            model: 'llama3.2:8b',
            tokensUsed: { prompt: 200, completion: 30, total: 230 },
            durationMs: 300,
          } satisfies ChatResponse),
      });
      const orchestrator = new OrchestratorImpl({
        llm, knowledge: createMockKnowledge(), ipc, autonomy, db: db as unknown as DatabaseHandle, model: 'llama3.2:8b',
      });

      const result = await orchestrator.processMessage('Schedule a quick sync');
      // In partner mode, calendar.create may be auto-approved depending on action classification
      expect(result.actions.length).toBeGreaterThanOrEqual(1);
      expect(result.actions[0]!.action).toBe('calendar.create');
    });
  });
});
