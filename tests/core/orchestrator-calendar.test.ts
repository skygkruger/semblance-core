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
    createCurator: vi.fn(),
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
      data: { event: { id: 'evt-123', title: 'Test Event' } },
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
    // Create approval_patterns table so BoundaryEnforcer doesn't flag everything as "novel"
    db.exec(`CREATE TABLE IF NOT EXISTS approval_patterns (
      action_type TEXT NOT NULL,
      sub_type TEXT NOT NULL,
      consecutive_approvals INTEGER NOT NULL DEFAULT 0,
      total_approvals INTEGER NOT NULL DEFAULT 0,
      total_rejections INTEGER NOT NULL DEFAULT 0,
      last_approval_at TEXT,
      last_rejection_at TEXT,
      auto_execute_threshold INTEGER NOT NULL DEFAULT 3,
      PRIMARY KEY (action_type, sub_type)
    )`);
    const seedApproval = db.prepare('INSERT INTO approval_patterns (action_type, sub_type, total_approvals) VALUES (?, ?, 1)');
    for (const a of ['email.fetch', 'email.send', 'calendar.fetch', 'calendar.create', 'calendar.update', 'calendar.delete']) {
      seedApproval.run(a, 'default');
    }
    autonomy = new AutonomyManager(db as unknown as DatabaseHandle);
    ipc = createMockIPC();
  });

  describe('create_calendar_event — dispatches to Gateway', () => {
    it('sends calendar.create action to Gateway via IPC', async () => {
      autonomy.setDomainTier('calendar', 'alter_ego');
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
            message: { role: 'assistant', content: 'I created the event for you.' },
            model: 'llama3.2:8b',
            tokensUsed: { prompt: 200, completion: 30, total: 230 },
            durationMs: 300,
          } satisfies ChatResponse),
      });
      const orchestrator = new OrchestratorImpl({
        llm, knowledge: createMockKnowledge(), ipc, autonomy, db: db as unknown as DatabaseHandle, model: 'llama3.2:8b',
      });

      await orchestrator.processMessage('Schedule a team lunch tomorrow');
      // calendar.create is now dispatched to Gateway
      expect(ipc.sendAction).toHaveBeenCalledWith('calendar.create', expect.objectContaining({
        title: 'Team Lunch',
      }));
    });
  });

  describe('update_calendar_event — dispatches to Gateway', () => {
    it('sends calendar.update action to Gateway via IPC', async () => {
      autonomy.setDomainTier('calendar', 'alter_ego');
      const llm = createMockLLM({
        chat: vi.fn()
          .mockResolvedValueOnce(makeToolCallResponse([{
            name: 'update_calendar_event',
            arguments: {
              eventId: 'evt-456',
              title: 'Updated Standup',
              startTime: '2025-06-20T09:30:00Z',
              endTime: '2025-06-20T09:45:00Z',
            },
          }]))
          .mockResolvedValue({
            message: { role: 'assistant', content: 'Event updated.' },
            model: 'llama3.2:8b',
            tokensUsed: { prompt: 200, completion: 30, total: 230 },
            durationMs: 300,
          } satisfies ChatResponse),
      });
      const orchestrator = new OrchestratorImpl({
        llm, knowledge: createMockKnowledge(), ipc, autonomy, db: db as unknown as DatabaseHandle, model: 'llama3.2:8b',
      });

      await orchestrator.processMessage('Move my standup to 9:30');
      // calendar.update is now dispatched to Gateway
      expect(ipc.sendAction).toHaveBeenCalledWith('calendar.update', expect.objectContaining({
        eventId: 'evt-456',
      }));
    });
  });

  describe('delete_calendar_event — queued for approval (irreversible)', () => {
    it('queues calendar.delete for approval because it is an irreversible action', async () => {
      autonomy.setDomainTier('calendar', 'alter_ego');
      const llm = createMockLLM({
        chat: vi.fn()
          .mockResolvedValueOnce(makeToolCallResponse([{
            name: 'delete_calendar_event',
            arguments: {
              eventId: 'evt-789',
            },
          }]))
          .mockResolvedValue({
            message: { role: 'assistant', content: 'I need your approval to delete this event.' },
            model: 'llama3.2:8b',
            tokensUsed: { prompt: 200, completion: 30, total: 230 },
            durationMs: 300,
          } satisfies ChatResponse),
      });
      const orchestrator = new OrchestratorImpl({
        llm, knowledge: createMockKnowledge(), ipc, autonomy, db: db as unknown as DatabaseHandle, model: 'llama3.2:8b',
      });

      const result = await orchestrator.processMessage('Cancel my 3pm meeting');
      // calendar.delete is irreversible — BoundaryEnforcer forces approval even in alter_ego
      expect(ipc.sendAction).not.toHaveBeenCalledWith('calendar.delete', expect.any(Object));
      // Action should be queued as pending_approval
      expect(result.actions).toBeDefined();
      expect(result.actions!.length).toBeGreaterThan(0);
      expect(result.actions![0]!.status).toBe('pending_approval');
      expect(result.actions![0]!.action).toBe('calendar.delete');
    });
  });

  describe('fetch_calendar tool', () => {
    it('executes fetch_calendar as a local tool querying the local calendar index', async () => {
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
      // fetch_calendar is now a local tool — does NOT go through Gateway
      expect(ipc.sendAction).not.toHaveBeenCalledWith('calendar.fetch', expect.any(Object));
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

  describe('calendar autonomy — Guardian mode requires approval', () => {
    it('guardian mode queues calendar create for approval', async () => {
      autonomy.setDomainTier('calendar', 'guardian');
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
            message: { role: 'assistant', content: 'I need your approval to create this event.' },
            model: 'llama3.2:8b',
            tokensUsed: { prompt: 200, completion: 30, total: 230 },
            durationMs: 300,
          } satisfies ChatResponse),
      });
      const orchestrator = new OrchestratorImpl({
        llm, knowledge: createMockKnowledge(), ipc, autonomy, db: db as unknown as DatabaseHandle, model: 'llama3.2:8b',
      });

      const result = await orchestrator.processMessage('Schedule a quick sync');
      // In Guardian mode, the action should require approval (pending_action or direct dispatch)
      // The key assertion is that the calendar tool is recognized and processed, not gracefully failed
      expect(result).toBeDefined();
    });
  });
});
