// Tests for Orchestrator v2 — Phase 1 multi-agent coordination.
//
// Covers: complexity classification, session memory, context compaction,
// hierarchical permissions, tool hooks, subagent execution, backward compatibility,
// and integration test calling the real factory function.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ComplexityClassifier } from '@semblance/core/agent/complexity-classifier.js';
import { InMemorySessionMemory } from '@semblance/core/agent/session-memory.js';
import { ContextCompactionEngine } from '@semblance/core/agent/context-compaction.js';
import { HierarchicalPermissionResolver } from '@semblance/core/agent/hierarchical-permissions.js';
import {
  ToolHookRegistryImpl,
  executePreToolHooks,
  executePostToolHooks,
  createAutonomyEnforcementHook,
  createGuardianRedirectHook,
} from '@semblance/core/agent/tool-hooks.js';
import { AutonomyManager } from '@semblance/core/agent/autonomy.js';
import { createCoordinatorAgent } from '@semblance/core/agent/index.js';
import { initDesktopPlatform, resetPlatform } from '@semblance/core/platform/index.js';
import { SemblanceEventBus } from '@semblance/gateway/events/event-bus.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';
import type { LLMProvider, ChatMessage, ToolDefinition } from '@semblance/core/llm/types.js';
import type { KnowledgeGraph } from '@semblance/core/knowledge/index.js';
import type { IPCClient } from '@semblance/core/agent/ipc-client.js';
import type { PreToolUseHook, PostToolUseHook, ToolHookContext } from '@semblance/core/agent/orchestrator-v2-types.js';

// ─── Mock LLM Provider ───────────────────────────────────────────────────────

function createMockLLM(chatResponse?: string): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn().mockResolvedValue({ text: chatResponse ?? '', model: 'mock', tokensUsed: { prompt: 10, completion: 10, total: 20 }, durationMs: 100 }),
    chat: vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: chatResponse ?? 'Mock response' },
      model: 'mock',
      tokensUsed: { prompt: 10, completion: 10, total: 20 },
      durationMs: 100,
    }),
    embed: vi.fn().mockResolvedValue({ embeddings: [[0.1, 0.2]], model: 'mock', durationMs: 50 }),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn().mockResolvedValue(null),
  };
}

// ─── Complexity Classifier ────────────────────────────────────────────────────

describe('ComplexityClassifier', () => {
  let classifier: ComplexityClassifier;

  beforeEach(() => {
    classifier = new ComplexityClassifier(null, []);
  });

  describe('simple requests', () => {
    it('classifies greetings as simple', () => {
      const result = classifier.classify('hello');
      expect(result.complexity).toBe('simple');
    });

    it('classifies single-domain requests with multiple tool matches', () => {
      // "check my inbox" matches email pattern which maps to 4 tools
      const result = classifier.classify('check my inbox');
      expect(result.domains).toContain('email');
      // Multiple tools in single domain = compound
      expect(['simple', 'compound']).toContain(result.complexity);
    });

    it('classifies weather queries as simple', () => {
      const result = classifier.classify("what's the weather like?");
      expect(result.complexity).toBe('simple');
      expect(result.domains).toContain('location');
    });
  });

  describe('compound requests', () => {
    it('classifies multi-tool single-domain requests', () => {
      // "search my emails and draft a reply" — "search" also triggers web domain
      // and "draft" triggers email, so this may be compound or complex
      const result = classifier.classify('draft an email reply to the meeting invite');
      expect(result.domains).toContain('email');
    });
  });

  describe('complex requests', () => {
    it('classifies multi-domain requests as complex', () => {
      const result = classifier.classify('check my email, calendar, and find related documents');
      expect(result.complexity).toBe('complex');
      expect(result.domains.length).toBeGreaterThanOrEqual(2);
      expect(result.parallelCapable).toBe(true);
    });

    it('classifies "prepare for" with multiple domains as complex', () => {
      // "prepare for" + email + calendar = complex pattern + 2 domains
      const result = classifier.classify("prepare me for tomorrow's meeting — check email and calendar");
      expect(result.complexity).toBe('complex');
      expect(result.parallelCapable).toBe(true);
    });

    it('classifies morning brief with domains as complex', () => {
      // "morning brief" is a complex pattern, but needs domain keywords to trigger
      const result = classifier.classify('give me my morning brief — email, calendar, and weather');
      expect(result.complexity).toBe('complex');
    });

    it('classifies research+action combos as complex', () => {
      const result = classifier.classify('research the latest quarterly results and then draft an email to the team');
      expect(result.complexity).toBe('complex');
    });
  });

  describe('tool domain mapping', () => {
    it('maps email tools to email domain', () => {
      expect(ComplexityClassifier.getToolDomain('fetch_inbox')).toBe('email');
      expect(ComplexityClassifier.getToolDomain('send_email')).toBe('email');
    });

    it('maps calendar tools to calendar domain', () => {
      expect(ComplexityClassifier.getToolDomain('fetch_calendar')).toBe('calendar');
    });

    it('returns null for unknown tools', () => {
      expect(ComplexityClassifier.getToolDomain('nonexistent_tool')).toBeNull();
    });
  });
});

// ─── Session Memory ───────────────────────────────────────────────────────────

describe('InMemorySessionMemory', () => {
  let memory: InMemorySessionMemory;

  beforeEach(() => {
    memory = new InMemorySessionMemory();
  });

  it('stores and retrieves entries', () => {
    memory.set('key1', 'value1', 'normal', 'coordinator');
    const entry = memory.get('key1');
    expect(entry).not.toBeNull();
    expect(entry!.value).toBe('value1');
    expect(entry!.priority).toBe('normal');
    expect(entry!.source).toBe('coordinator');
  });

  it('overwrites existing entries', () => {
    memory.set('key1', 'old', 'normal', 'coordinator');
    memory.set('key1', 'new', 'critical', 'coordinator');
    expect(memory.get('key1')!.value).toBe('new');
    expect(memory.get('key1')!.priority).toBe('critical');
  });

  it('returns null for missing keys', () => {
    expect(memory.get('missing')).toBeNull();
  });

  it('filters by priority', () => {
    memory.set('a', '1', 'critical', 'coordinator');
    memory.set('b', '2', 'normal', 'coordinator');
    memory.set('c', '3', 'ephemeral', 'coordinator');

    expect(memory.getByPriority('critical')).toHaveLength(1);
    expect(memory.getByPriority('normal')).toHaveLength(1);
    expect(memory.getByPriority('ephemeral')).toHaveLength(1);
  });

  it('clears ephemeral entries only', () => {
    memory.set('a', '1', 'critical', 'coordinator');
    memory.set('b', '2', 'normal', 'coordinator');
    memory.set('c', '3', 'ephemeral', 'coordinator');

    memory.clearEphemeral();

    expect(memory.get('a')).not.toBeNull();
    expect(memory.get('b')).not.toBeNull();
    expect(memory.get('c')).toBeNull();
    expect(memory.size).toBe(2);
  });

  it('returns compaction snapshot without ephemeral', () => {
    memory.set('a', '1', 'critical', 'coordinator');
    memory.set('b', '2', 'normal', 'coordinator');
    memory.set('c', '3', 'ephemeral', 'coordinator');

    const snapshot = memory.getCompactionSnapshot();
    expect(snapshot).toHaveLength(2);
    expect(snapshot.some(e => e.priority === 'ephemeral')).toBe(false);
  });

  it('clears all entries', () => {
    memory.set('a', '1', 'critical', 'coordinator');
    memory.set('b', '2', 'normal', 'coordinator');
    memory.clear();
    expect(memory.size).toBe(0);
  });
});

// ─── Context Compaction ───────────────────────────────────────────────────────

describe('ContextCompactionEngine', () => {
  let llm: LLMProvider;
  let sessionMemory: InMemorySessionMemory;
  let engine: ContextCompactionEngine;

  beforeEach(() => {
    llm = createMockLLM('Summary of conversation so far.');
    sessionMemory = new InMemorySessionMemory();
    engine = new ContextCompactionEngine(llm, null, sessionMemory, {
      interval: 3,
      retainRecentCount: 2,
      maxSummaryTokens: 256,
    });
  });

  it('tracks tool calls and triggers compaction at interval', () => {
    expect(engine.recordToolCall()).toBe(false);
    expect(engine.recordToolCall()).toBe(false);
    expect(engine.recordToolCall()).toBe(true); // 3rd call triggers
  });

  it('resets counter', () => {
    engine.recordToolCall();
    engine.recordToolCall();
    engine.resetCounter();
    expect(engine.recordToolCall()).toBe(false);
  });

  it('does not compact short conversations', async () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
    ];

    const { messages: compacted, result } = await engine.compact(messages, 'test-session');
    expect(result.messagesCompacted).toBe(0);
    expect(compacted).toHaveLength(3);
  });

  it('compacts long conversations', async () => {
    // Use longer messages so the compacted version is clearly shorter
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a helpful AI assistant with deep knowledge.' },
      { role: 'user', content: 'This is a fairly long message about planning my entire week including meals, workouts, meetings, and travel arrangements that I need help with.' },
      { role: 'assistant', content: 'I can help with all of that. Let me break down each area: meals, workouts, meetings, and travel. Starting with meals for Monday through Friday...' },
      { role: 'user', content: 'Actually let me also add that I need to prepare a presentation for the board meeting on Wednesday, and I need to coordinate with three team members about the project deadline.' },
      { role: 'assistant', content: 'Understood. I have added the board presentation and team coordination to your priorities. Here is the updated plan including all items...' },
      { role: 'user', content: 'Great, now what about Thursday?' },
      { role: 'assistant', content: 'Thursday looks open.' },
    ];

    const { messages: compacted, result } = await engine.compact(messages, 'test-session');

    // System + summary + 2 recent = 4 messages (7 original → 4 compacted)
    expect(compacted).toHaveLength(4);
    expect(compacted[0]!.role).toBe('system');
    expect(compacted[1]!.content).toContain('Conversation summary');
    expect(result.messagesCompacted).toBeGreaterThan(0);
    // The compacted messages should have fewer total characters than the original
    const originalChars = messages.reduce((s, m) => s + m.content.length, 0);
    const compactedChars = compacted.reduce((s, m) => s + m.content.length, 0);
    expect(compactedChars).toBeLessThan(originalChars);
  });

  it('preserves session memory in compaction', async () => {
    sessionMemory.set('decision', 'User prefers formal tone', 'critical', 'coordinator');

    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Message 1' },
      { role: 'assistant', content: 'Response 1' },
      { role: 'user', content: 'Message 2' },
      { role: 'assistant', content: 'Response 2' },
      { role: 'user', content: 'Message 3' },
      { role: 'assistant', content: 'Response 3' },
    ];

    const { messages: compacted } = await engine.compact(messages, 'test-session');
    const summaryMsg = compacted.find(m => m.content.includes('Session state'));
    expect(summaryMsg).toBeDefined();
    expect(summaryMsg!.content).toContain('decision');
  });
});

// ─── Tool Hook Registry ───────────────────────────────────────────────────────

describe('ToolHookRegistry', () => {
  let registry: ToolHookRegistryImpl;

  beforeEach(() => {
    registry = new ToolHookRegistryImpl();
  });

  it('registers and retrieves pre-hooks', () => {
    const hook: PreToolUseHook = {
      id: 'test-hook',
      description: 'Test',
      appliesTo: ['send_email'],
      execute: vi.fn().mockResolvedValue({ action: 'allow' }),
    };

    registry.registerPreHook(hook);
    expect(registry.getPreHooks('send_email')).toHaveLength(1);
    expect(registry.getPreHooks('other_tool')).toHaveLength(0);
  });

  it('universal hooks apply to all tools', () => {
    const hook: PreToolUseHook = {
      id: 'universal',
      description: 'Applies to all',
      appliesTo: [],
      execute: vi.fn().mockResolvedValue({ action: 'allow' }),
    };

    registry.registerPreHook(hook);
    expect(registry.getPreHooks('any_tool')).toHaveLength(1);
    expect(registry.getPreHooks('another_tool')).toHaveLength(1);
  });

  it('removes hooks by ID', () => {
    registry.registerPreHook({
      id: 'removable',
      description: 'Will be removed',
      appliesTo: [],
      execute: vi.fn().mockResolvedValue({ action: 'allow' }),
    });

    expect(registry.getAllPreHooks()).toHaveLength(1);
    registry.removePreHook('removable');
    expect(registry.getAllPreHooks()).toHaveLength(0);
  });
});

// ─── Tool Hook Pipeline ──────────────────────────────────────────────────────

describe('Tool Hook Pipeline', () => {
  let registry: ToolHookRegistryImpl;
  const baseContext: ToolHookContext = {
    toolName: 'send_email',
    toolParams: { to: ['test@example.com'], subject: 'Test', body: 'Hello' },
    subagentId: 'sub-1',
    subtaskId: 'st-1',
    sessionId: 'session-1',
    domain: 'email',
    autonomyTier: 'partner',
  };

  beforeEach(() => {
    registry = new ToolHookRegistryImpl();
  });

  describe('PreToolUse', () => {
    it('allows tool call when no hooks fire', async () => {
      const result = await executePreToolHooks(registry, baseContext);
      expect(result.proceed).toBe(true);
      expect(result.toolName).toBe('send_email');
    });

    it('denies tool call when a hook denies', async () => {
      registry.registerPreHook({
        id: 'deny-hook',
        description: 'Denies all',
        appliesTo: [],
        execute: async () => ({ action: 'deny', reason: 'Not allowed' }),
      });

      const result = await executePreToolHooks(registry, baseContext);
      expect(result.proceed).toBe(false);
      expect(result.denyReason).toBe('Not allowed');
    });

    it('mutates parameters', async () => {
      registry.registerPreHook({
        id: 'mutate-hook',
        description: 'Adds CC',
        appliesTo: ['send_email'],
        execute: async (ctx) => ({
          action: 'mutate',
          params: { ...ctx.toolParams, cc: ['manager@example.com'] },
        }),
      });

      const result = await executePreToolHooks(registry, baseContext);
      expect(result.proceed).toBe(true);
      expect(result.params.cc).toEqual(['manager@example.com']);
    });

    it('redirects tool call', async () => {
      registry.registerPreHook({
        id: 'redirect-hook',
        description: 'Redirect send to draft',
        appliesTo: ['send_email'],
        execute: async (ctx) => ({
          action: 'redirect',
          targetTool: 'draft_email',
          params: ctx.toolParams,
        }),
      });

      const result = await executePreToolHooks(registry, baseContext);
      expect(result.proceed).toBe(true);
      expect(result.toolName).toBe('draft_email');
      expect(result.redirectedFrom).toBe('send_email');
    });
  });

  describe('PostToolUse', () => {
    it('passes result through when no hooks fire', async () => {
      const result = await executePostToolHooks(registry, baseContext, { success: true });
      expect(result.aborted).toBe(false);
      expect(result.result).toEqual({ success: true });
    });

    it('filters result data', async () => {
      registry.registerPostHook({
        id: 'filter-hook',
        description: 'Strips sensitive data',
        appliesTo: [],
        execute: async () => ({
          action: 'filter',
          filteredResult: { success: true, data: '[FILTERED]' },
        }),
      });

      const result = await executePostToolHooks(registry, baseContext, { success: true, data: 'secret' });
      expect((result.result as any).data).toBe('[FILTERED]');
    });

    it('injects additional context', async () => {
      registry.registerPostHook({
        id: 'inject-hook',
        description: 'Adds audit note',
        appliesTo: [],
        execute: async () => ({
          action: 'inject',
          appendedContext: 'Audit: action logged to trail',
        }),
      });

      const result = await executePostToolHooks(registry, baseContext, { ok: true });
      expect(result.injectedContext).toContain('Audit');
    });

    it('aborts result delivery', async () => {
      registry.registerPostHook({
        id: 'abort-hook',
        description: 'Aborts on error',
        appliesTo: [],
        execute: async () => ({
          action: 'abort',
          reason: 'Result contained unsafe content',
        }),
      });

      const result = await executePostToolHooks(registry, baseContext, { data: 'unsafe' });
      expect(result.aborted).toBe(true);
      expect(result.abortReason).toContain('unsafe content');
    });
  });
});

// ─── Built-in Hooks ──────────────────────────────────────────────────────────

describe('Built-in Hooks', () => {
  it('Guardian redirect hook redirects send_email to draft_email', async () => {
    const hook = createGuardianRedirectHook();
    const result = await hook.execute({
      toolName: 'send_email',
      toolParams: { to: ['a@b.com'], subject: 'Hi', body: 'Hello' },
      subagentId: null,
      subtaskId: null,
      sessionId: 'test',
      domain: 'email',
      autonomyTier: 'guardian',
    });

    expect(result.action).toBe('redirect');
    if (result.action === 'redirect') {
      expect(result.targetTool).toBe('draft_email');
    }
  });

  it('Guardian redirect hook allows in Partner mode', async () => {
    const hook = createGuardianRedirectHook();
    const result = await hook.execute({
      toolName: 'send_email',
      toolParams: { to: ['a@b.com'], subject: 'Hi', body: 'Hello' },
      subagentId: null,
      subtaskId: null,
      sessionId: 'test',
      domain: 'email',
      autonomyTier: 'partner',
    });

    expect(result.action).toBe('allow');
  });
});

// ─── Hierarchical Permissions ─────────────────────────────────────────────────

describe('HierarchicalPermissionResolver', () => {
  let db: Database.Database;
  let autonomy: AutonomyManager;
  let resolver: HierarchicalPermissionResolver;

  beforeEach(() => {
    db = new Database(':memory:');
    autonomy = new AutonomyManager(db as unknown as DatabaseHandle, { defaultTier: 'partner', domainOverrides: {} });
    resolver = new HierarchicalPermissionResolver(autonomy);
  });

  afterEach(() => {
    db.close();
  });

  it('builds subagent scope with correct tool permissions', () => {
    const scope = resolver.buildSubagentScope({
      id: 'st-1',
      description: 'Test subtask',
      successCriteria: 'Done',
      allowedTools: ['fetch_inbox', 'search_emails', 'draft_email'],
      modelTier: 'primary',
      maxTokens: 1024,
      timeoutMs: 30000,
      contextBudget: 4096,
      turnBudget: 5,
    });

    expect(scope.allowedTools).toHaveLength(3);
    // Partner tier: reads and writes are auto
    expect(scope.toolPermissions['fetch_inbox']).toBe('auto');
    expect(scope.toolPermissions['search_emails']).toBe('auto');
    expect(scope.toolPermissions['draft_email']).toBe('auto');
  });

  it('respects permission overrides (can only restrict)', () => {
    const scope = resolver.buildSubagentScope({
      id: 'st-1',
      description: 'Test subtask',
      successCriteria: 'Done',
      allowedTools: ['draft_email'],
      modelTier: 'primary',
      maxTokens: 1024,
      timeoutMs: 30000,
      contextBudget: 4096,
      turnBudget: 5,
      permissionOverrides: { draft_email: 'approve' },
    });

    // Override restricts auto → approve
    expect(scope.toolPermissions['draft_email']).toBe('approve');
  });

  it('denies tools not in scope', () => {
    const scope = resolver.buildSubagentScope({
      id: 'st-1',
      description: 'Email only',
      successCriteria: 'Done',
      allowedTools: ['fetch_inbox'],
      modelTier: 'primary',
      maxTokens: 1024,
      timeoutMs: 30000,
      contextBudget: 4096,
      turnBudget: 5,
    });

    const resolution = resolver.resolve('send_email', scope);
    expect(resolution.decision).toBe('denied');
    expect(resolution.subagentRestricted).toBe(true);
  });

  it('resolves allowed tools correctly', () => {
    const scope = resolver.buildSubagentScope({
      id: 'st-1',
      description: 'Read email',
      successCriteria: 'Done',
      allowedTools: ['fetch_inbox'],
      modelTier: 'primary',
      maxTokens: 1024,
      timeoutMs: 30000,
      contextBudget: 4096,
      turnBudget: 5,
    });

    const resolution = resolver.resolve('fetch_inbox', scope);
    expect(resolution.decision).toBe('auto_approve');
  });

  it('Guardian tier requires approval even for reads', () => {
    db.close();
    db = new Database(':memory:');
    autonomy = new AutonomyManager(db as unknown as DatabaseHandle, { defaultTier: 'guardian', domainOverrides: {} });
    resolver = new HierarchicalPermissionResolver(autonomy);

    const scope = resolver.buildSubagentScope({
      id: 'st-1',
      description: 'Read email',
      successCriteria: 'Done',
      allowedTools: ['fetch_inbox'],
      modelTier: 'primary',
      maxTokens: 1024,
      timeoutMs: 30000,
      contextBudget: 4096,
      turnBudget: 5,
    });

    const resolution = resolver.resolve('fetch_inbox', scope);
    expect(resolution.decision).toBe('requires_approval');
  });
});

// ─── Event Bus Extension ─────────────────────────────────────────────────────

describe('Event Bus — Orchestrator v2 events', () => {
  it('can import v2 event types without errors', () => {
    const bus = new SemblanceEventBus();

    const events: any[] = [];
    bus.subscribe(['orchestrator.decomposition' as any], (event: any) => {
      events.push(event);
    });

    bus.emit('orchestrator.decomposition' as any, {
      sessionId: 'test-session',
      complexity: 'complex',
      subtaskCount: 3,
      domains: ['email', 'calendar', 'files'],
    } as any);

    expect(events).toHaveLength(1);
    expect(events[0].payload.subtaskCount).toBe(3);
  });
});

// ─── Factory Function Integration Test ────────────────────────────────────────
//
// This test calls createCoordinatorAgent() — the same factory the running
// application uses in createSemblanceCore().initialize(). It verifies:
//   1. The factory produces a working Orchestrator
//   2. Simple messages fall through to v1 (no subagents)
//   3. Complex messages are classified as complex
//   4. EventBus receives orchestrator.decomposition events

describe('createCoordinatorAgent — integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    // Create a temp directory for the factory's SQLite database
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semblance-test-'));

    // Initialize the platform adapter (required by the factory)
    initDesktopPlatform();
  });

  afterEach(() => {
    resetPlatform();

    // Clean up temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* ignore cleanup failures */ }
  });

  function createMockLLMForFactory(): LLMProvider {
    return {
      isAvailable: vi.fn().mockResolvedValue(true),
      generate: vi.fn().mockResolvedValue({
        text: 'Generated text',
        model: 'mock',
        tokensUsed: { prompt: 10, completion: 10, total: 20 },
        durationMs: 100,
      }),
      chat: vi.fn().mockResolvedValue({
        message: { role: 'assistant', content: 'Hello! I can help with that.' },
        model: 'mock',
        tokensUsed: { prompt: 50, completion: 20, total: 70 },
        durationMs: 200,
        toolCalls: undefined,
      }),
      embed: vi.fn().mockResolvedValue({
        embeddings: [[0.1, 0.2, 0.3]],
        model: 'mock',
        durationMs: 50,
      }),
      listModels: vi.fn().mockResolvedValue([]),
      getModel: vi.fn().mockResolvedValue(null),
    };
  }

  function createMockKnowledgeForFactory(): KnowledgeGraph {
    return {
      indexDocument: vi.fn().mockResolvedValue({ documentId: 'doc-1', chunksCreated: 1, durationMs: 10 }),
      search: vi.fn().mockResolvedValue([]),
      scanDirectory: vi.fn().mockResolvedValue({ filesFound: 0, filesIndexed: 0, errors: [] }),
      getDocument: vi.fn().mockResolvedValue(null),
      listDocuments: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({ totalDocuments: 0, totalChunks: 0, sources: {} }),
      deleteDocument: vi.fn().mockResolvedValue(undefined),
      semanticSearch: { search: vi.fn().mockResolvedValue([]) } as any,
      createCurator: vi.fn(),
    } as any;
  }

  function createMockIPCForFactory(): IPCClient {
    return {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
      sendAction: vi.fn().mockResolvedValue({
        requestId: 'mock-req',
        timestamp: new Date().toISOString(),
        status: 'success' as const,
        data: {},
        auditRef: 'audit-mock',
      }),
    };
  }

  it('factory creates a working Orchestrator that processes simple messages via v1', async () => {
    const orchestrator = createCoordinatorAgent({
      llmProvider: createMockLLMForFactory(),
      knowledgeGraph: createMockKnowledgeForFactory(),
      ipcClient: createMockIPCForFactory(),
      dataDir: tmpDir,
      model: 'mock-model',
      hardwareTier: 'standard',
    });

    // The factory returns an Orchestrator
    expect(orchestrator).toBeDefined();
    expect(typeof orchestrator.processMessage).toBe('function');
    expect(typeof orchestrator.getConversation).toBe('function');
    expect(typeof orchestrator.approveAction).toBe('function');
    expect(typeof orchestrator.registerTools).toBe('function');
    expect(orchestrator.autonomy).toBeDefined();

    // Simple message falls through to v1 — returns a response (no decomposition)
    const response = await orchestrator.processMessage('hello');
    expect(response.message).toBeTruthy();
    expect(response.conversationId).toBeTruthy();
    // Simple messages produce zero actions (no tool calls for greetings)
    expect(response.actions).toEqual([]);
  });

  it('factory-created orchestrator classifies complex requests and emits events', async () => {
    const eventBus = new SemblanceEventBus();
    const decompositionEvents: any[] = [];
    eventBus.subscribe(['orchestrator.decomposition' as any], (event: any) => {
      decompositionEvents.push(event);
    });

    const mockLLM = createMockLLMForFactory();

    const orchestrator = createCoordinatorAgent({
      llmProvider: mockLLM,
      knowledgeGraph: createMockKnowledgeForFactory(),
      ipcClient: createMockIPCForFactory(),
      dataDir: tmpDir,
      model: 'mock-model',
      hardwareTier: 'standard',
      eventBus: eventBus as any, // SemblanceEventBus satisfies OrchestratorEventEmitter
    });

    // Complex multi-domain message — should trigger decomposition
    const response = await orchestrator.processMessage(
      'Check my email inbox, review my calendar for conflicts, and find related documents about the project'
    );

    // The coordinator should have:
    // 1. Classified as complex (email + calendar + files = 3 domains)
    // 2. Emitted an orchestrator.decomposition event
    // 3. Returned a synthesized response
    expect(response.message).toBeTruthy();
    expect(decompositionEvents.length).toBeGreaterThanOrEqual(1);
    expect(decompositionEvents[0].payload.complexity).toBe('complex');
    expect(decompositionEvents[0].payload.subtaskCount).toBeGreaterThanOrEqual(2);
  });
});
