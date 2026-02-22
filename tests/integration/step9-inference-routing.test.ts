// Integration: Step 9 Inference Routing — InferenceRouter, TaskType mapping, provider selection.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { InferenceRouter } from '@semblance/core/llm/inference-router.js';
import { TASK_TIER_MAP, TIER_FALLBACK_CHAIN } from '@semblance/core/llm/inference-types.js';
import type { LLMProvider } from '@semblance/core/llm/types.js';
import type { TaskType, InferenceTier } from '@semblance/core/llm/inference-types.js';

const ROOT = join(import.meta.dirname, '..', '..');

function makeMockProvider(name: string): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn().mockResolvedValue({ text: `from ${name}`, model: name, tokensUsed: { prompt: 0, completion: 0, total: 0 }, durationMs: 0 }),
    chat: vi.fn().mockResolvedValue({ message: { role: 'assistant', content: `from ${name}` }, model: name, tokensUsed: { prompt: 0, completion: 0, total: 0 }, durationMs: 0 }),
    embed: vi.fn().mockResolvedValue({ embeddings: [Array(768).fill(0.1)], model: name, durationMs: 0 }),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn().mockResolvedValue(null),
  };
}

describe('Step 9: InferenceRouter Integration', () => {
  it('inference-router.ts exists', () => {
    const path = join(ROOT, 'packages', 'core', 'llm', 'inference-router.ts');
    expect(existsSync(path)).toBe(true);
  });

  it('implements LLMProvider interface', () => {
    const provider = makeMockProvider('test');
    const router = new InferenceRouter({
      reasoningProvider: provider,
      embeddingProvider: provider,
      reasoningModel: 'test-reasoning',
      embeddingModel: 'test-embedding',
    });

    // Should have all LLMProvider methods
    expect(typeof router.isAvailable).toBe('function');
    expect(typeof router.generate).toBe('function');
    expect(typeof router.chat).toBe('function');
    expect(typeof router.embed).toBe('function');
    expect(typeof router.listModels).toBe('function');
    expect(typeof router.getModel).toBe('function');
  });

  it('routes generate calls through reasoning provider', async () => {
    const provider = makeMockProvider('test-provider');
    const router = new InferenceRouter({
      reasoningProvider: provider,
      embeddingProvider: provider,
      reasoningModel: 'test-reasoning',
      embeddingModel: 'test-embedding',
    });

    const result = await router.generate({ model: 'test', prompt: 'hello' });
    expect(result.text).toContain('from test-provider');
  });

  it('routes embed calls through embedding provider', async () => {
    const reasoning = makeMockProvider('reasoning');
    const embedding = makeMockProvider('embedding');
    const router = new InferenceRouter({
      reasoningProvider: reasoning,
      embeddingProvider: embedding,
      reasoningModel: 'test-reasoning',
      embeddingModel: 'test-embedding',
    });

    const result = await router.embed({ model: 'test', input: 'hello' });
    expect(result.embeddings).toHaveLength(1);
    expect(result.embeddings[0]).toHaveLength(768);
    expect(embedding.embed).toHaveBeenCalled();
    expect(reasoning.embed).not.toHaveBeenCalled();
  });
});

describe('Step 9: Task-Tier Mapping', () => {
  it('all TaskTypes are mapped to tiers', () => {
    const taskTypes: TaskType[] = ['generate', 'classify', 'extract', 'embed', 'reason', 'draft'];
    for (const task of taskTypes) {
      expect(TASK_TIER_MAP[task]).toBeDefined();
    }
  });

  it('embed tasks map to embedding tier', () => {
    expect(TASK_TIER_MAP['embed']).toBe('embedding');
  });

  it('reason tasks map to quality tier', () => {
    expect(TASK_TIER_MAP['reason']).toBe('quality');
  });

  it('classify tasks map to fast tier', () => {
    expect(TASK_TIER_MAP['classify']).toBe('fast');
  });

  it('all tiers have fallback chains', () => {
    const tiers: InferenceTier[] = ['fast', 'primary', 'quality', 'embedding'];
    for (const tier of tiers) {
      expect(TIER_FALLBACK_CHAIN[tier]).toBeDefined();
      expect(Array.isArray(TIER_FALLBACK_CHAIN[tier])).toBe(true);
    }
  });
});

describe('Step 9: Provider Usage Guard', () => {
  it('guard test exists', () => {
    const guardPath = join(ROOT, 'tests', 'core', 'llm', 'provider-usage-guard.test.ts');
    expect(existsSync(guardPath)).toBe(true);
  });

  it('guard test checks for direct LLMProvider usage', () => {
    const guardPath = join(ROOT, 'tests', 'core', 'llm', 'provider-usage-guard.test.ts');
    const content = readFileSync(guardPath, 'utf-8');
    expect(content).toContain('OllamaProvider');
    expect(content).toContain('ALLOWED_ROOTS');
  });
});
