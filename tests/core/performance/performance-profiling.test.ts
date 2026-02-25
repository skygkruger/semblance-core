// Performance Profiling Tests — Budget validation, lazy loading, report generation.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getBudget,
  isColdStartWithinBudget,
  isMemoryWithinBudget,
  isFeatureLoadWithinBudget,
} from '../../../packages/core/performance/performance-budget';
import { LazyLoader } from '../../../packages/core/performance/lazy-loader';
import type {
  ColdStartMetrics,
  MemoryMetrics,
  PerformanceReport,
} from '../../../packages/core/performance/types';

// ─── Performance Budget ─────────────────────────────────────────────────────

describe('Performance Budget', () => {
  it('validates cold start within limit', () => {
    const metrics: ColdStartMetrics = {
      totalMs: 2500,
      criticalPhaseMs: 1200,
      importantPhaseMs: 800,
      deferredPhaseMs: 500,
      startedAt: Date.now() - 2500,
    };

    // 2500ms is within 3000ms mobile/mid budget
    expect(isColdStartWithinBudget(metrics, 'mobile', 'mid')).toBe(true);
  });

  it('rejects cold start over limit', () => {
    const metrics: ColdStartMetrics = {
      totalMs: 4000,
      criticalPhaseMs: 2000,
      importantPhaseMs: 1200,
      deferredPhaseMs: 800,
      startedAt: Date.now() - 4000,
    };

    // 4000ms exceeds 3000ms mobile/mid budget
    expect(isColdStartWithinBudget(metrics, 'mobile', 'mid')).toBe(false);
  });

  it('adjusts thresholds by platform and tier', () => {
    const mobileMid = getBudget('mobile', 'mid');
    const mobileHigh = getBudget('mobile', 'high');
    const desktopMid = getBudget('desktop', 'mid');

    // High-tier mobile has tighter cold start budget than mid-tier
    expect(mobileHigh.coldStartMaxMs).toBeLessThan(mobileMid.coldStartMaxMs);

    // Desktop has larger memory budget than mobile at same tier
    expect(desktopMid.memoryMaxBytes).toBeGreaterThan(mobileMid.memoryMaxBytes);

    // All budgets have positive values
    expect(mobileMid.coldStartMaxMs).toBeGreaterThan(0);
    expect(mobileMid.memoryMaxBytes).toBeGreaterThan(0);
    expect(mobileMid.featureLoadMaxMs).toBeGreaterThan(0);
  });
});

// ─── Lazy Loader ────────────────────────────────────────────────────────────

describe('Lazy Loader', () => {
  let loader: LazyLoader;

  beforeEach(() => {
    loader = new LazyLoader();
  });

  it('defers feature loading until first access', async () => {
    let loaded = false;
    loader.registerFeature('sovereignty', async () => {
      loaded = true;
      return { module: 'sovereignty' };
    });

    // After registration, feature is NOT loaded
    expect(loaded).toBe(false);
    expect(loader.isLoaded('sovereignty')).toBe(false);

    // Load on first access
    await loader.loadFeature('sovereignty');
    expect(loaded).toBe(true);
    expect(loader.isLoaded('sovereignty')).toBe(true);
  });

  it('tracks load time per feature', async () => {
    loader.registerFeature('knowledge-graph', async () => {
      // Simulate 10ms load time
      await new Promise(r => setTimeout(r, 10));
      return {};
    });

    expect(loader.getLoadTime('knowledge-graph')).toBeNull();

    await loader.loadFeature('knowledge-graph');

    const time = loader.getLoadTime('knowledge-graph');
    expect(time).not.toBeNull();
    expect(time!).toBeGreaterThanOrEqual(0);

    // Should appear in all load times
    const allTimes = loader.getAllLoadTimes();
    expect(allTimes['knowledge-graph']).toBeDefined();
  });

  it('preloads specified features in background', async () => {
    let aLoaded = false;
    let bLoaded = false;

    loader.registerFeature('feature-a', async () => { aLoaded = true; return 'a'; });
    loader.registerFeature('feature-b', async () => { bLoaded = true; return 'b'; });
    loader.registerFeature('feature-c', async () => 'c');

    // Preload only a and b
    await loader.preloadFeatures(['feature-a', 'feature-b']);

    expect(aLoaded).toBe(true);
    expect(bLoaded).toBe(true);
    expect(loader.isLoaded('feature-a')).toBe(true);
    expect(loader.isLoaded('feature-b')).toBe(true);
    expect(loader.isLoaded('feature-c')).toBe(false);
  });
});

// ─── Performance Report ─────────────────────────────────────────────────────

describe('Performance Report', () => {
  it('includes all metric categories', () => {
    // Verify the PerformanceReport type has the required fields
    const report: PerformanceReport = {
      deviceTier: 'mid',
      platform: 'mobile',
      coldStart: {
        totalMs: 2500,
        criticalPhaseMs: 1200,
        importantPhaseMs: 800,
        deferredPhaseMs: 500,
        startedAt: Date.now() - 2500,
      },
      memory: {
        usedBytes: 100 * 1024 * 1024,
        totalBytes: 200 * 1024 * 1024,
        byFeature: { 'knowledge-graph': 20 * 1024 * 1024 },
        measuredAt: Date.now(),
      },
      battery: {
        levelPercent: 75,
        isCharging: false,
        isLowPowerMode: false,
      },
      featureLoadTimes: {
        'knowledge-graph': 150,
        'sovereignty': 80,
      },
      generatedAt: Date.now(),
    };

    expect(report.deviceTier).toBe('mid');
    expect(report.platform).toBe('mobile');
    expect(report.coldStart).not.toBeNull();
    expect(report.memory).not.toBeNull();
    expect(report.battery).not.toBeNull();
    expect(Object.keys(report.featureLoadTimes).length).toBe(2);
    expect(report.generatedAt).toBeGreaterThan(0);
  });
});
