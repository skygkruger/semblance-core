/**
 * Step 22 — Extension init tests.
 * Tests createHealthExtension returns valid SemblanceExtension.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { createHealthExtension } from '@semblance/core/health/index';
import type { PremiumGate } from '@semblance/core/premium/premium-gate';
import type { KnowledgeGraph } from '@semblance/core/knowledge/index';
import type { LLMProvider } from '@semblance/core/llm/types';

let db: InstanceType<typeof Database>;

beforeEach(() => {
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
});

describe('createHealthExtension (Step 22)', () => {
  it('returns valid SemblanceExtension', () => {
    const ext = createHealthExtension({
      db: db as unknown as DatabaseHandle,
      llm: { chat: vi.fn() } as unknown as LLMProvider,
      model: 'test',
      premiumGate: { isPremium: () => true, isFeatureAvailable: () => true } as unknown as PremiumGate,
      knowledgeGraph: { search: async () => [] } as unknown as KnowledgeGraph,
    });

    expect(ext).toBeDefined();
    expect(ext.name).toBe('Health & Wellness Tracking');
    expect(ext.version).toBe('1.0.0');
  });

  it('has id @semblance/health', () => {
    const ext = createHealthExtension({
      db: db as unknown as DatabaseHandle,
      llm: { chat: vi.fn() } as unknown as LLMProvider,
      model: 'test',
      premiumGate: { isPremium: () => true, isFeatureAvailable: () => true } as unknown as PremiumGate,
      knowledgeGraph: { search: async () => [] } as unknown as KnowledgeGraph,
    });

    expect(ext.id).toBe('@semblance/health');
  });

  it('registers 3 tools and 1 insight tracker', () => {
    const ext = createHealthExtension({
      db: db as unknown as DatabaseHandle,
      llm: { chat: vi.fn() } as unknown as LLMProvider,
      model: 'test',
      premiumGate: { isPremium: () => true, isFeatureAvailable: () => true } as unknown as PremiumGate,
      knowledgeGraph: { search: async () => [] } as unknown as KnowledgeGraph,
    });

    expect(ext.tools).toHaveLength(3);
    expect(ext.insightTrackers).toHaveLength(1);
  });
});
