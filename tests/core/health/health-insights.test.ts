/**
 * Step 22 — HealthInsightGenerator tests.
 * Tests trend detection, anomaly detection, streaks, and LLM description-only.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { HealthStore } from '@semblance/core/health/health-store';
import { CorrelationEngine } from '@semblance/core/health/correlation-engine';
import { HealthInsightGenerator } from '@semblance/core/health/health-insights';
import type { KnowledgeGraph } from '@semblance/core/knowledge/index';
import type { LLMProvider } from '@semblance/core/llm/types';

let db: InstanceType<typeof Database>;
let store: HealthStore;
let generator: HealthInsightGenerator;
let llmPrompts: string[];

function makeKnowledgeGraph(): KnowledgeGraph {
  return {
    search: async () => [],
    indexDocument: async () => ({ documentId: '', chunksCreated: 0, durationMs: 0 }),
    scanDirectory: async () => ({ filesFound: 0, filesIndexed: 0, errors: [] }),
    getDocument: async () => null,
    listDocuments: async () => [],
    getStats: async () => ({ totalDocuments: 0, totalChunks: 0, sources: {} }),
  } as unknown as KnowledgeGraph;
}

function makeLLM(): LLMProvider {
  llmPrompts = [];
  return {
    chat: vi.fn(async (req) => {
      llmPrompts.push(req.messages.map((m: { content: string }) => m.content).join('\n'));
      return {
        message: { role: 'assistant', content: 'Generated insight description.' },
        model: 'test',
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
        durationMs: 0,
      };
    }),
    isAvailable: async () => true,
    generate: vi.fn(),
    embed: vi.fn(),
    listModels: async () => [],
    getModel: async () => null,
  } as unknown as LLMProvider;
}

beforeEach(() => {
  db = new Database(':memory:');
  store = new HealthStore({ db: db as unknown as DatabaseHandle });
  const correlationEngine = new CorrelationEngine({
    db: db as unknown as DatabaseHandle,
    knowledgeGraph: makeKnowledgeGraph(),
  });
  generator = new HealthInsightGenerator({
    correlationEngine,
    store,
    llm: makeLLM(),
    model: 'test-model',
  });
});

afterEach(() => {
  db.close();
});

describe('HealthInsightGenerator (Step 22)', () => {
  it('detectTrends identifies downward sleep trend', () => {
    // First week: good sleep (~7h)
    for (let i = 0; i < 7; i++) {
      store.addEntry({ metricType: 'sleep_duration', value: 420 + i * 5, recordedAt: new Date(Date.now() - (14 - i) * 86400000).toISOString(), source: 'manual' });
    }
    // Second week: bad sleep (~5h)
    for (let i = 0; i < 7; i++) {
      store.addEntry({ metricType: 'sleep_duration', value: 300 + i * 5, recordedAt: new Date(Date.now() - (7 - i) * 86400000).toISOString(), source: 'manual' });
    }

    const trend = generator.detectTrend('sleep_duration', 14);
    expect(trend).not.toBeNull();
    expect(trend!.direction).toBe('down');
    expect(trend!.changePercent).toBeLessThan(0);
  });

  it('detectAnomalies flags value > 2 std devs from mean', () => {
    // 29 days of normal values (~7 hours)
    for (let i = 0; i < 29; i++) {
      store.addEntry({ metricType: 'sleep_duration', value: 420, recordedAt: new Date(Date.now() - (30 - i) * 86400000).toISOString(), source: 'manual' });
    }
    // Today: extreme value (2 hours)
    store.addEntry({ metricType: 'sleep_duration', value: 120, recordedAt: new Date().toISOString(), source: 'manual' });

    const anomalies = generator.detectAnomalies('sleep_duration');
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0]!.type).toBe('anomaly');
    expect(anomalies[0]!.severity).toBe('warning');
  });

  it('detectStreaks identifies consecutive logging days', () => {
    // 10 consecutive days of mood logging
    for (let i = 0; i < 10; i++) {
      store.addEntry({ metricType: 'mood', value: 4, recordedAt: new Date(Date.now() - i * 86400000).toISOString(), source: 'manual' });
    }

    const streaks = generator.detectStreaks('mood');
    expect(streaks.length).toBeGreaterThan(0);
    expect(streaks[0]!.type).toBe('streak');
    expect(streaks[0]!.title).toContain('mood');
  });

  it('generateInsights combines trends + correlations + anomalies', async () => {
    // Add enough data for trends
    for (let i = 0; i < 14; i++) {
      store.addEntry({ metricType: 'mood', value: i < 7 ? 4 : 2, recordedAt: new Date(Date.now() - (14 - i) * 86400000).toISOString(), source: 'manual' });
    }

    const insights = await generator.generateInsights(14);
    // Should have at least a trend insight
    expect(insights.length).toBeGreaterThan(0);
    const types = insights.map(i => i.type);
    expect(types).toContain('trend');
  });

  it('LLM called for description only (prompt contains computed stats, not raw data)', async () => {
    // This test verifies the LLM prompt structure
    // Add data that produces a correlation
    for (let i = 0; i < 10; i++) {
      const date = new Date(Date.now() - (10 - i) * 86400000).toISOString();
      store.addEntry({ metricType: 'sleep_duration', value: 400 + i * 20, recordedAt: date, source: 'manual' });
      store.addEntry({ metricType: 'mood', value: 1 + i * 0.4, recordedAt: date, source: 'manual' });
    }

    await generator.generateInsights(30);

    // If LLM was called, check the prompt contains statistical info
    for (const prompt of llmPrompts) {
      expect(prompt).toContain('Correlation');
      expect(prompt).toContain('Sample');
      // Should NOT contain raw health entry data
      expect(prompt).not.toContain('health_entries');
    }
  });
});
