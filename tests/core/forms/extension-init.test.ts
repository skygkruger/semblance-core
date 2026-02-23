/**
 * Step 21 — Extension init tests.
 * Tests createFormExtension returns valid SemblanceExtension.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import type { LLMProvider } from '@semblance/core/llm/types';
import type { AutonomyManager } from '@semblance/core/agent/autonomy';
import type { SemanticSearch } from '@semblance/core/knowledge/search';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { createFormExtension } from '@semblance/core/forms/index';

let db: InstanceType<typeof Database>;

function makeDeps() {
  const llm: LLMProvider = {
    isAvailable: async () => true,
    generate: async () => ({ text: '', model: 'test', tokensUsed: { prompt: 0, completion: 0, total: 0 }, durationMs: 0 }),
    chat: async () => ({
      message: { role: 'assistant' as const, content: 'name' },
      model: 'test',
      tokensUsed: { prompt: 10, completion: 5, total: 15 },
      durationMs: 50,
    }),
    embed: async () => ({ embeddings: [[]], model: 'test', durationMs: 0 }),
    listModels: async () => [],
    getModel: async () => null,
  };

  const autonomyManager = {
    getDomainTier: () => 'partner',
    decide: () => 'requires_approval',
    getDomainForAction: () => 'files',
    setDomainTier: vi.fn(),
    getConfig: () => ({}),
  } as unknown as AutonomyManager;

  const semanticSearch = {
    search: vi.fn(async () => []),
  } as unknown as SemanticSearch;

  return {
    db: db as unknown as DatabaseHandle,
    llm,
    model: 'test-model',
    autonomyManager,
    premiumGate: new PremiumGate(db as unknown as DatabaseHandle),
    semanticSearch,
  };
}

beforeEach(() => {
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
});

describe('Form Extension Init (Step 21)', () => {
  it('createFormExtension returns valid SemblanceExtension', () => {
    const ext = createFormExtension(makeDeps());
    expect(ext).toBeDefined();
    expect(ext.name).toBe('Form & Bureaucracy Automation');
    expect(ext.version).toBe('1.0.0');
  });

  it('extension has id @semblance/forms', () => {
    const ext = createFormExtension(makeDeps());
    expect(ext.id).toBe('@semblance/forms');
  });

  it('extension registers 3 tools and 1 insight tracker', () => {
    const ext = createFormExtension(makeDeps());
    expect(ext.tools).toHaveLength(3);
    expect(ext.insightTrackers).toHaveLength(1);

    const toolNames = ext.tools!.map(t => t.definition.name);
    expect(toolNames).toContain('fill_form');
    expect(toolNames).toContain('check_form_status');
    expect(toolNames).toContain('list_form_templates');
  });
});
