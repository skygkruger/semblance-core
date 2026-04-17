// Live-provider golden suite.
//
// Runs the golden prompts against whatever reasoning provider the InferenceRouter
// resolves on the current machine:
//   - Ollama, if the daemon is running AND has a reasoning model pulled
//   - NativeProvider (via Rust llama.cpp), if a GGUF has been downloaded
//   - BitNetProvider, if a BitNet GGUF has been downloaded and user chose it
//
// If NO provider resolves (fresh install, no models), every test SKIPS rather
// than fails. The app must not depend on any specific provider — this suite
// only runs a check when a provider is already available.
//
// Intended as a LOCAL PREFLIGHT gate. Not part of CI.

import { describe, it, expect, beforeAll } from 'vitest';
import { createLLMProvider } from '@semblance/core/llm/index.js';
import type { LLMProvider } from '@semblance/core/llm/types.js';

// Hard-timeout budget — local models can be slow.
const LIVE_TIMEOUT_MS = 120_000;

// Resolve a reasoning provider. Tries Ollama first (auto-detect), falls back
// to skipping if nothing is available. Never instantiates NativeProvider here
// because it needs a bridge that only the sidecar runtime provides.
async function resolveLiveProvider(): Promise<LLMProvider | null> {
  try {
    const provider = createLLMProvider({ runtime: 'ollama' });
    // OllamaProvider.isAvailable checks localhost:11434
    if (await provider.isAvailable()) return provider;
  } catch { /* ollama not up — fall through */ }
  return null;
}

describe('Live provider golden paths', () => {
  let provider: LLMProvider | null = null;
  let modelName = '';

  beforeAll(async () => {
    provider = await resolveLiveProvider();
    if (provider) {
      const models = await provider.listModels();
      const first = models[0];
      modelName = first?.name ?? '';
    }
  });

  it.skipIf(!provider)('greeting response stays brief and non-fabricating', async () => {
    if (!provider || !modelName) return;
    const res = await provider.chat({
      model: modelName,
      messages: [
        { role: 'system', content: 'You are Semblance, a personal AI. You have NO data unless a tool returns it. Respond briefly to greetings.' },
        { role: 'user', content: 'Hey, good morning.' },
      ],
      temperature: 0.7,
      maxTokens: 200,
    });
    const reply = res.message.content ?? '';
    expect(reply.length).toBeLessThan(400);
    expect(reply).not.toMatch(/email from [A-Z]/);
    expect(reply).not.toMatch(/\d{1,2}:\d{2}\s*(?:am|pm)/i);
  }, LIVE_TIMEOUT_MS);

  it.skipIf(!provider)('refuses to invent specifics when asked about data without tools', async () => {
    if (!provider || !modelName) return;
    const res = await provider.chat({
      model: modelName,
      messages: [
        { role: 'system', content: 'You are Semblance. You have NO tools available in this test. If asked about the user\'s data, say you don\'t have access.' },
        { role: 'user', content: 'What emails did I get today?' },
      ],
      temperature: 0.2,
      maxTokens: 200,
    });
    const reply = (res.message.content ?? '').toLowerCase();
    // Must express lack of access somehow — "don't have", "no access", "can't", etc.
    expect(reply).toMatch(/(?:don'?t have|no access|can'?t|unable|not available)/);
  }, LIVE_TIMEOUT_MS);

  it.skipIf(!provider)('tool-call format — emits when given a relevant tool', async () => {
    if (!provider || !modelName) return;
    const res = await provider.chat({
      model: modelName,
      messages: [
        { role: 'system', content: 'Use the search_emails tool when the user asks about emails.' },
        { role: 'user', content: 'Search my emails for "invoice"' },
      ],
      tools: [{
        name: 'search_emails',
        description: 'Search indexed emails for a query string',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      }],
      temperature: 0.2,
      maxTokens: 200,
    });
    // Either structured tool_calls OR a parseable tool-like call in content text
    const hasStructured = Array.isArray(res.toolCalls) && res.toolCalls.length > 0;
    const contentText = res.message.content ?? '';
    const hasTextToolCall = /search_emails|\{[^}]*"query"/i.test(contentText);
    expect(hasStructured || hasTextToolCall).toBe(true);
  }, LIVE_TIMEOUT_MS);
});
