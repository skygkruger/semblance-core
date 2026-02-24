/**
 * Step 22 — HealthInsightTracker tests.
 * Tests trend insight generation, premium gating, insufficient data.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { HealthStore } from '@semblance/core/health/health-store';
import { CorrelationEngine } from '@semblance/core/health/correlation-engine';
import { HealthInsightGenerator } from '@semblance/core/health/health-insights';
import { HealthInsightTracker } from '@semblance/core/health/insight-tracker';
import type { PremiumGate } from '@semblance/core/premium/premium-gate';
import type { KnowledgeGraph } from '@semblance/core/knowledge/index';
import type { LLMProvider } from '@semblance/core/llm/types';

let db: InstanceType<typeof Database>;
let store: HealthStore;

function makeGate(premium: boolean): PremiumGate {
  return {
    isPremium: () => premium,
    isFeatureAvailable: () => premium,
    getLicenseTier: () => premium ? 'digital-representative' : 'free',
    getAvailableFeatures: () => [],
  } as unknown as PremiumGate;
}

function makeTracker(premium: boolean): HealthInsightTracker {
  const correlationEngine = new CorrelationEngine({
    db: db as unknown as DatabaseHandle,
    knowledgeGraph: { search: async () => [] } as unknown as KnowledgeGraph,
  });
  const insightGenerator = new HealthInsightGenerator({
    correlationEngine,
    store,
    llm: { chat: vi.fn() } as unknown as LLMProvider,
    model: 'test',
  });
  return new HealthInsightTracker({
    insightGenerator,
    store,
    premiumGate: makeGate(premium),
  });
}

beforeEach(() => {
  db = new Database(':memory:');
  store = new HealthStore({ db: db as unknown as DatabaseHandle });
});

afterEach(() => {
  db.close();
});

describe('HealthInsightTracker (Step 22)', () => {
  it('generates health-trend-change insight when trend detected', () => {
    // First half: high mood
    for (let i = 0; i < 7; i++) {
      store.addEntry({ metricType: 'mood', value: 5, recordedAt: new Date(Date.now() - (14 - i) * 86400000).toISOString(), source: 'manual' });
    }
    // Second half: low mood (significant drop)
    for (let i = 0; i < 7; i++) {
      store.addEntry({ metricType: 'mood', value: 2, recordedAt: new Date(Date.now() - (7 - i) * 86400000).toISOString(), source: 'manual' });
    }

    const tracker = makeTracker(true);
    const insights = tracker.generateInsights();

    const trendInsights = insights.filter(i => i.type === 'health-trend-change');
    expect(trendInsights.length).toBeGreaterThan(0);
  });

  it('returns empty array when not premium', () => {
    store.addEntry({ metricType: 'mood', value: 5, recordedAt: new Date().toISOString(), source: 'manual' });

    const tracker = makeTracker(false);
    const insights = tracker.generateInsights();
    expect(insights).toEqual([]);
  });

  it('returns empty array when insufficient data', () => {
    const tracker = makeTracker(true);
    const insights = tracker.generateInsights();
    expect(insights).toEqual([]);
  });
});
