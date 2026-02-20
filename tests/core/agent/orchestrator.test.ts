// Tests for Orchestrator — message processing, tool calls, conversation storage.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
      message: { role: 'assistant', content: 'Hello! How can I help?' },
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
      data: { messages: [] },
      auditRef: 'audit-mock',
    }),
  };
}

describe('Orchestrator', () => {
  let db: Database.Database;
  let orchestrator: OrchestratorImpl;
  let mockLLM: LLMProvider;
  let mockKnowledge: KnowledgeGraph;
  let mockIPC: IPCClient;
  let autonomy: AutonomyManager;

  beforeEach(() => {
    db = new Database(':memory:');
    mockLLM = createMockLLM();
    mockKnowledge = createMockKnowledge();
    mockIPC = createMockIPC();
    autonomy = new AutonomyManager(db, { defaultTier: 'partner', domainOverrides: {} });

    orchestrator = new OrchestratorImpl({
      llm: mockLLM,
      knowledge: mockKnowledge,
      ipc: mockIPC,
      autonomy,
      db,
      model: 'llama3.2:8b',
    });
  });

  afterEach(() => {
    db.close();
  });

  it('processes a simple message', async () => {
    const result = await orchestrator.processMessage('Hello');

    expect(result.message).toBe('Hello! How can I help?');
    expect(result.conversationId).toBeDefined();
    expect(result.actions).toEqual([]);
    expect(mockLLM.chat).toHaveBeenCalled();
  });

  it('searches knowledge graph for context', async () => {
    await orchestrator.processMessage('What did I write about React?');

    expect(mockKnowledge.search).toHaveBeenCalledWith(
      'What did I write about React?',
      { limit: 5 },
    );
  });

  it('stores conversation turns', async () => {
    const result = await orchestrator.processMessage('Hello');

    const turns = await orchestrator.getConversation(result.conversationId);
    expect(turns).toHaveLength(2);
    expect(turns[0]!.role).toBe('user');
    expect(turns[0]!.content).toBe('Hello');
    expect(turns[1]!.role).toBe('assistant');
    expect(turns[1]!.content).toBe('Hello! How can I help?');
  });

  it('maintains conversation across multiple messages', async () => {
    const r1 = await orchestrator.processMessage('Hello');
    await orchestrator.processMessage('How are you?', r1.conversationId);

    const turns = await orchestrator.getConversation(r1.conversationId);
    expect(turns).toHaveLength(4); // 2 user + 2 assistant
  });

  it('handles LLM tool calls for search_files', async () => {
    const llmWithToolCall = createMockLLM({
      chat: vi.fn()
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: 'Let me search for that.' },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 100, completion: 20, total: 120 },
          durationMs: 500,
          toolCalls: [{ name: 'search_files', arguments: { query: 'React hooks' } }],
        } satisfies ChatResponse)
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: 'I found some relevant notes.' },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 200, completion: 30, total: 230 },
          durationMs: 600,
        } satisfies ChatResponse),
    });

    const orch = new OrchestratorImpl({
      llm: llmWithToolCall,
      knowledge: mockKnowledge,
      ipc: mockIPC,
      autonomy,
      db,
      model: 'llama3.2:8b',
    });

    const result = await orch.processMessage('Search my files for React hooks');

    // search_files is handled locally (not through IPC)
    expect(mockKnowledge.search).toHaveBeenCalled();
    expect(result.actions).toEqual([]); // search_files doesn't produce actions
  });

  it('queues actions for approval in partner mode for execute actions', async () => {
    const llmWithToolCall = createMockLLM({
      chat: vi.fn().mockResolvedValueOnce({
        message: { role: 'assistant', content: 'I\'ll send that email for you.' },
        model: 'llama3.2:8b',
        tokensUsed: { prompt: 100, completion: 20, total: 120 },
        durationMs: 500,
        toolCalls: [{
          name: 'send_email',
          arguments: { to: ['test@example.com'], subject: 'Hi', body: 'Hello' },
        }],
      } satisfies ChatResponse),
    });

    const orch = new OrchestratorImpl({
      llm: llmWithToolCall,
      knowledge: mockKnowledge,
      ipc: mockIPC,
      autonomy,
      db,
      model: 'llama3.2:8b',
    });

    const result = await orch.processMessage('Send an email to test@example.com saying Hi');

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.status).toBe('pending_approval');
    expect(result.actions[0]!.action).toBe('email.send');
    expect(result.message).toContain('1 action(s) awaiting your approval');
  });

  it('auto-executes read actions in partner mode', async () => {
    const llmWithToolCall = createMockLLM({
      chat: vi.fn()
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: 'Let me check your email.' },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 100, completion: 20, total: 120 },
          durationMs: 500,
          toolCalls: [{
            name: 'fetch_email',
            arguments: { folder: 'INBOX', limit: 5 },
          }],
        } satisfies ChatResponse)
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: 'You have 3 new emails.' },
          model: 'llama3.2:8b',
          tokensUsed: { prompt: 200, completion: 30, total: 230 },
          durationMs: 600,
        } satisfies ChatResponse),
    });

    const orch = new OrchestratorImpl({
      llm: llmWithToolCall,
      knowledge: mockKnowledge,
      ipc: mockIPC,
      autonomy,
      db,
      model: 'llama3.2:8b',
    });

    const result = await orch.processMessage('Check my email');

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.status).toBe('executed');
    expect(mockIPC.sendAction).toHaveBeenCalledWith('email.fetch', expect.any(Object));
  });

  it('approves a pending action', async () => {
    // First create a pending action
    const llmWithToolCall = createMockLLM({
      chat: vi.fn().mockResolvedValueOnce({
        message: { role: 'assistant', content: 'I\'ll send that.' },
        model: 'llama3.2:8b',
        tokensUsed: { prompt: 100, completion: 20, total: 120 },
        durationMs: 500,
        toolCalls: [{
          name: 'send_email',
          arguments: { to: ['x@y.com'], subject: 'Test', body: 'Body' },
        }],
      } satisfies ChatResponse),
    });

    const orch = new OrchestratorImpl({
      llm: llmWithToolCall,
      knowledge: mockKnowledge,
      ipc: mockIPC,
      autonomy,
      db,
      model: 'llama3.2:8b',
    });

    const result = await orch.processMessage('Send test email');
    const actionId = result.actions[0]!.id;

    // Now approve it
    const response = await orch.approveAction(actionId);
    expect(response.status).toBe('success');
    expect(mockIPC.sendAction).toHaveBeenCalledWith('email.send', expect.any(Object));
  });

  it('rejects a pending action', async () => {
    const llmWithToolCall = createMockLLM({
      chat: vi.fn().mockResolvedValueOnce({
        message: { role: 'assistant', content: 'I\'ll send that.' },
        model: 'llama3.2:8b',
        tokensUsed: { prompt: 100, completion: 20, total: 120 },
        durationMs: 500,
        toolCalls: [{
          name: 'send_email',
          arguments: { to: ['x@y.com'], subject: 'Test', body: 'Body' },
        }],
      } satisfies ChatResponse),
    });

    const orch = new OrchestratorImpl({
      llm: llmWithToolCall,
      knowledge: mockKnowledge,
      ipc: mockIPC,
      autonomy,
      db,
      model: 'llama3.2:8b',
    });

    const result = await orch.processMessage('Send test email');
    const actionId = result.actions[0]!.id;

    await orch.rejectAction(actionId);

    const pending = await orch.getPendingActions();
    expect(pending).toHaveLength(0);
  });

  it('getPendingActions returns queued actions', async () => {
    const llmWithToolCall = createMockLLM({
      chat: vi.fn().mockResolvedValueOnce({
        message: { role: 'assistant', content: 'Sending.' },
        model: 'llama3.2:8b',
        tokensUsed: { prompt: 100, completion: 20, total: 120 },
        durationMs: 500,
        toolCalls: [{
          name: 'send_email',
          arguments: { to: ['a@b.com'], subject: 'S', body: 'B' },
        }],
      } satisfies ChatResponse),
    });

    const orch = new OrchestratorImpl({
      llm: llmWithToolCall,
      knowledge: mockKnowledge,
      ipc: mockIPC,
      autonomy,
      db,
      model: 'llama3.2:8b',
    });

    await orch.processMessage('Send email');

    const pending = await orch.getPendingActions();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.action).toBe('email.send');
    expect(pending[0]!.status).toBe('pending_approval');
  });
});
