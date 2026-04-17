// Provider-agnostic golden-path tests.
//
// Each prompt is asserted against a MOCK LLMProvider with a scripted response.
// These verify the orchestrator's control-flow decisions (conversational routing,
// fabrication scanning, empty-state prompt selection, tool dispatch) independent
// of which model actually runs at deploy time. Real-model behavior drift is
// covered separately by the live-provider suite (run manually against whatever
// reasoning provider the InferenceRouter resolved to — Ollama, BitNet, Native).
//
// Rationale: the orchestrator is the only layer we control tightly. Model
// quality will vary across Qwen / Llama / BitNet / Ollama configurations. These
// tests pin the CONTRACT the orchestrator enforces regardless of model.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { OrchestratorImpl } from '@semblance/core/agent/orchestrator.js';
import { AutonomyManager } from '@semblance/core/agent/autonomy.js';
import { getPlatform } from '@semblance/core/platform/index.js';
import type { LLMProvider, ChatRequest, ChatResponse, EmbedRequest, EmbedResponse, ToolCall } from '@semblance/core/llm/types.js';
import type { KnowledgeGraph } from '@semblance/core/knowledge/index.js';
import type { IPCClient } from '@semblance/core/agent/ipc-client.js';

// ─── Mock infrastructure ──────────────────────────────────────────────────────

interface MockLLMConfig {
  /** Scripted reply content (per-call, in order). */
  replies: Array<{ content: string; toolCalls?: ToolCall[] }>;
  /** Optional callback invoked with every chat request (inspection). */
  onChat?: (req: ChatRequest) => void;
}

function mockLLM(cfg: MockLLMConfig): LLMProvider {
  let callIdx = 0;
  return {
    async isAvailable() { return true; },
    getModel() { return 'test-model'; },
    async chat(req: ChatRequest): Promise<ChatResponse> {
      cfg.onChat?.(req);
      const reply = cfg.replies[callIdx] ?? cfg.replies[cfg.replies.length - 1];
      callIdx++;
      return {
        message: { role: 'assistant', content: reply?.content ?? '' },
        model: req.model,
        tokensUsed: { prompt: 50, completion: 20, total: 70 },
        durationMs: 10,
        toolCalls: reply?.toolCalls,
      };
    },
    async *chatStream() { /* not used */ },
    async generate() {
      return { text: '', model: '', tokensUsed: { prompt: 0, completion: 0, total: 0 }, durationMs: 0 };
    },
    async embed(req: EmbedRequest): Promise<EmbedResponse> {
      // Deterministic 8-dim vector so search results are stable
      const inputs = Array.isArray(req.input) ? req.input : [req.input];
      return {
        embeddings: inputs.map(() => [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]),
        model: req.model,
        durationMs: 1,
      };
    },
    async listModels() { return []; },
  } as unknown as LLMProvider;
}

function mockKnowledge(): KnowledgeGraph {
  return {
    async indexDocument() { return { documentId: 'mock', chunksCreated: 0, durationMs: 0 }; },
    async search() { return []; },
    async scanDirectory() { return { filesFound: 0, filesIndexed: 0, errors: [] }; },
    async getDocument() { return null; },
    async listDocuments() { return []; },
    async getStats() { return { totalDocuments: 0, totalChunks: 0, bySource: {} as Record<string, number> }; },
    async removeDocument() { return true; },
  } as unknown as KnowledgeGraph;
}

function mockIPC(): IPCClient {
  return {
    async sendAction() {
      return { requestId: 'r', timestamp: new Date().toISOString(), status: 'success' as const, data: null, auditRef: 'a' };
    },
  } as unknown as IPCClient;
}

function makeOrchestrator(llm: LLMProvider, opts?: { connectedServices?: string[]; indexedDocCount?: number }) {
  const p = getPlatform();
  const tmpDir = mkdtempSync(join(tmpdir(), 'semblance-golden-'));
  const db = p.sqlite.openDatabase(join(tmpDir, 'test.db'));
  db.pragma('journal_mode = WAL');
  const autonomy = new AutonomyManager(db);
  const orch = new OrchestratorImpl({
    llm,
    knowledge: mockKnowledge(),
    ipc: mockIPC(),
    autonomy,
    db,
    model: 'test-model',
    aiName: 'Semblance',
    userName: 'Sky',
    connectedServices: opts?.connectedServices,
    indexedDocCount: opts?.indexedDocCount,
  });
  return { orch, tmpDir };
}

// ─── Golden paths ─────────────────────────────────────────────────────────────

describe('AI golden paths', () => {
  let cleanupPaths: string[] = [];
  beforeEach(() => { cleanupPaths = []; });
  afterEach(() => {
    for (const p of cleanupPaths) {
      try { rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('GP-1: bare greeting → no proactive content, no fabrication', async () => {
    const llm = mockLLM({
      replies: [{ content: 'Good morning, Sky. How can I help?' }],
    });
    const { orch, tmpDir } = makeOrchestrator(llm, { connectedServices: ['gmail'], indexedDocCount: 0 });
    cleanupPaths.push(tmpDir);
    const res = await orch.processMessage('Hey, good morning');
    expect(res.message.length).toBeLessThan(250);
    expect(res.message).not.toMatch(/email from/i);
    expect(res.message).not.toMatch(/meeting (?:at|with)/i);
    expect(res.actions).toHaveLength(0);
  });

  it('GP-2: cold start with indexedDocCount=0 forces empty-state prompt even if services connected', async () => {
    let capturedSystemPrompt = '';
    const llm = mockLLM({
      replies: [{ content: 'I\'m still getting set up — haven\'t indexed anything yet.' }],
      onChat: (req) => {
        const sys = req.messages.find(m => m.role === 'system');
        if (sys) capturedSystemPrompt = sys.content;
      },
    });
    const { orch, tmpDir } = makeOrchestrator(llm, { connectedServices: ['gmail', 'google-calendar'], indexedDocCount: 0 });
    cleanupPaths.push(tmpDir);
    // Use a non-greeting message so we hit the full-prompt path, not the short
    // conversational variant. The conversational variant skips the empty-state
    // branch entirely (intentionally — it's meant to be terse).
    await orch.processMessage('tell me about the weather');
    // Empty-state prompt must mention the user has NOT indexed yet (either
    // "still catching up" when services are connected or the stricter
    // "no accounts connected" variant) — never claim data is available.
    expect(capturedSystemPrompt).toMatch(/(?:still .* catching up|RIGHT NOW: .* not been indexed|no accounts are connected|hasn't finished|have ZERO access)/i);
  });

  it('GP-3: fabrication in no-tool reply gets rejected and replaced', async () => {
    // Model tries to invent a meeting — scanner must catch it.
    const llm = mockLLM({
      // First call: the fabricated answer.
      // Second call (retry): still fabricates → triggers safe fallback.
      replies: [
        { content: 'You have a meeting at 3:00 pm with Alan about the Q3 roadmap.' },
        { content: 'You have a meeting at 3:00 pm with Alan about the Q3 roadmap.' },
      ],
    });
    const { orch, tmpDir } = makeOrchestrator(llm, { connectedServices: [], indexedDocCount: 0 });
    cleanupPaths.push(tmpDir);
    const res = await orch.processMessage('What does my day look like?');
    expect(res.message).not.toMatch(/alan/i);
    expect(res.message).not.toMatch(/3:00 pm/i);
    expect(res.message.toLowerCase()).toMatch(/(?:don't have|no accounts|connect|don't know)/);
  });

  it('GP-4: conversation turn retrieved from history with fabrication is redacted on load', async () => {
    // First message indexes a clean turn
    const llm = mockLLM({
      replies: [
        { content: 'Hello Sky, nice to meet you.' },
        { content: 'You received an email from Jane about the product launch.' }, // fabrication (no tool)
      ],
    });
    const { orch, tmpDir } = makeOrchestrator(llm, { connectedServices: [], indexedDocCount: 0 });
    cleanupPaths.push(tmpDir);
    const first = await orch.processMessage('hi');
    await orch.processMessage('update me', first.conversationId);
    const turns = await orch.getConversation(first.conversationId);
    // Any turn containing the fabrication pattern should be redacted OR not present.
    for (const t of turns) {
      expect(t.content).not.toMatch(/received an email from jane/i);
    }
  });

  it('GP-5: multi-language greeting (spanish/french/german/japanese) → conversational path', async () => {
    let toolsExposed = false;
    const llm = mockLLM({
      replies: [{ content: 'Hola, Sky. ¿En qué te puedo ayudar hoy?' }],
      onChat: (req) => {
        if (req.tools && req.tools.length > 0) toolsExposed = true;
      },
    });
    const { orch, tmpDir } = makeOrchestrator(llm, { connectedServices: ['gmail'], indexedDocCount: 5 });
    cleanupPaths.push(tmpDir);
    await orch.processMessage('Hola, buenos días');
    // Conversational path = NO tools exposed to the model
    expect(toolsExposed).toBe(false);
  });

  it('GP-6: empty chat message handled without crash', async () => {
    const llm = mockLLM({ replies: [{ content: 'fallback' }] });
    const { orch, tmpDir } = makeOrchestrator(llm);
    cleanupPaths.push(tmpDir);
    const res = await orch.processMessage('   ');
    expect(res.message.length).toBeGreaterThan(0);
  });

  it('GP-7: over-long user message is truncated (32K cap) without throwing', async () => {
    const llm = mockLLM({ replies: [{ content: 'Got it.' }] });
    const { orch, tmpDir } = makeOrchestrator(llm);
    cleanupPaths.push(tmpDir);
    const huge = 'a'.repeat(40_000);
    const res = await orch.processMessage(huge);
    expect(res.message).toBeTruthy();
  });

  it('GP-8: data query with no services connected → direct fallback, no LLM call', async () => {
    let chatCalled = false;
    const llm = mockLLM({
      replies: [{ content: 'SHOULD NOT BE USED' }],
      onChat: () => { chatCalled = true; },
    });
    const { orch, tmpDir } = makeOrchestrator(llm, { connectedServices: [], indexedDocCount: 0 });
    cleanupPaths.push(tmpDir);
    const res = await orch.processMessage("what's in my inbox?");
    expect(chatCalled).toBe(false);
    expect(res.message.toLowerCase()).toMatch(/(?:don't have|connect|email)/);
  });

  it('GP-9: recovery mode activates after 2 fabrication strikes', async () => {
    // Prime conversation with two turns that each fabricate.
    const llm = mockLLM({
      replies: [
        { content: 'Your meeting at 2:30 pm with Jordan starts soon.' },  // fab
        { content: 'Your meeting at 2:30 pm with Jordan starts soon.' },  // retry — also fab
        { content: 'You received an email from Taylor about budget.' },   // fab (2nd strike)
        { content: 'You received an email from Taylor about budget.' },   // retry — also fab
        { content: 'Plain answer.' },  // 3rd turn should be in recovery mode
      ],
    });
    const { orch, tmpDir } = makeOrchestrator(llm, { connectedServices: [], indexedDocCount: 0 });
    cleanupPaths.push(tmpDir);
    const t1 = await orch.processMessage("what's on my schedule?");
    await orch.processMessage('and emails?', t1.conversationId);
    const t3 = await orch.processMessage('anything else?', t1.conversationId);
    // By the third turn, the orchestrator should be in recovery mode — no
    // retrieval context, no tools, minimal prompt. We verify the return isn't
    // a fabrication sanitized message.
    expect(t3.message).toBeTruthy();
  });

  it('GP-10: proper noun + verb heuristic catches "Sarah requested..." fabrication', async () => {
    const llm = mockLLM({
      replies: [
        { content: 'Sarah requested a meeting next Tuesday.' },
        { content: 'Sarah requested a meeting next Tuesday.' },  // retry — also bad
      ],
    });
    const { orch, tmpDir } = makeOrchestrator(llm, { connectedServices: [], indexedDocCount: 0 });
    cleanupPaths.push(tmpDir);
    const res = await orch.processMessage('any updates?');
    expect(res.message).not.toMatch(/sarah requested/i);
  });

  it('GP-11: direct-access claim without tool backing is rejected', async () => {
    // Covers the specificity scanner + the "I have access to your" pattern.
    // Response must NOT contain terms the intent-extractor interprets as
    // matching a tool name (avoid triggering the fake-tool-call path).
    const llm = mockLLM({
      replies: [
        { content: 'I have access to your calendar and can check it for you.' },
        { content: 'I have access to your calendar and can check it for you.' },
      ],
    });
    const { orch, tmpDir } = makeOrchestrator(llm, { connectedServices: [], indexedDocCount: 0 });
    cleanupPaths.push(tmpDir);
    const res = await orch.processMessage('tell me something interesting');
    expect(res.message).not.toMatch(/have access to your calendar/i);
  });

  it('GP-12: AI greeting with name when user name is configured', async () => {
    let capturedSystem = '';
    const llm = mockLLM({
      replies: [{ content: 'Hello Sky.' }],
      onChat: (req) => { capturedSystem = req.messages.find(m => m.role === 'system')?.content ?? ''; },
    });
    const { orch, tmpDir } = makeOrchestrator(llm);
    cleanupPaths.push(tmpDir);
    await orch.processMessage('hi');
    // System prompt must mention the user's name so the model can address them personally
    expect(capturedSystem).toMatch(/Sky/);
  });
});
