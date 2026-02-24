/**
 * Step 22 — Health extension tools tests.
 * Tests log_health, health_summary, health_correlations, isLocal.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { HealthStore } from '@semblance/core/health/health-store';
import { ManualEntryManager } from '@semblance/core/health/manual-entry';
import { CorrelationEngine } from '@semblance/core/health/correlation-engine';
import { createHealthTools } from '@semblance/core/health/extension-tools';
import type { PremiumGate } from '@semblance/core/premium/premium-gate';
import type { KnowledgeGraph } from '@semblance/core/knowledge/index';
import type { LLMProvider } from '@semblance/core/llm/types';
import type { ExtensionTool } from '@semblance/core/extensions/types';

let db: InstanceType<typeof Database>;
let tools: ExtensionTool[];

function makeGate(premium: boolean): PremiumGate {
  return {
    isPremium: () => premium,
    isFeatureAvailable: () => premium,
    getLicenseTier: () => premium ? 'digital-representative' : 'free',
    getAvailableFeatures: () => [],
    activateLicense: () => ({ success: false }),
  } as unknown as PremiumGate;
}

beforeEach(() => {
  db = new Database(':memory:');
  const store = new HealthStore({ db: db as unknown as DatabaseHandle });
  const manualEntry = new ManualEntryManager({ store });
  const correlationEngine = new CorrelationEngine({
    db: db as unknown as DatabaseHandle,
    knowledgeGraph: { search: async () => [] } as unknown as KnowledgeGraph,
  });

  tools = createHealthTools({
    manualEntry,
    correlationEngine,
    store,
    premiumGate: makeGate(true),
    llm: { chat: vi.fn(async () => ({ message: { content: 'desc' }, model: 'test', tokensUsed: { prompt: 0, completion: 0, total: 0 }, durationMs: 0 })) } as unknown as LLMProvider,
    model: 'test',
  });
});

afterEach(() => {
  db.close();
});

describe('Health Extension Tools (Step 22)', () => {
  it('log_health tool stores entry via ManualEntryManager', async () => {
    const logTool = tools.find(t => t.definition.name === 'log_health')!;
    const result = await logTool.handler({ metricType: 'mood', value: 4 });
    expect(result.result).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('health_summary tool returns recent data', async () => {
    const summaryTool = tools.find(t => t.definition.name === 'health_summary')!;
    const result = await summaryTool.handler({ days: 7 });
    expect(result.result).toBeDefined();
  });

  it('health_correlations tool returns computed correlations', async () => {
    const corrTool = tools.find(t => t.definition.name === 'health_correlations')!;
    const result = await corrTool.handler({ windowDays: 30 });
    expect(result.result).toBeDefined();
  });

  it('all tools have isLocal: true', () => {
    for (const tool of tools) {
      expect(tool.isLocal).toBe(true);
    }
    expect(tools).toHaveLength(3);
  });
});
